#!/usr/bin/env python3
"""Download Italian opinion polls directly from Wikipedia and write a static JSON feed.

This runs in GitHub Actions. No locally stored Excel spreadsheet is needed.
Data-source: https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_Italian_general_election
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from io import StringIO
import json
import math
from numbers import Number
from pathlib import Path
import re
import sys
from typing import Any

import pandas as pd
import requests
from bs4 import BeautifulSoup

URL = "https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_Italian_general_election"
PARTIES = ("FdI", "PD", "M5S", "Lega", "FI", "AVS")
MONTHS = {m.lower(): i for i, m in enumerate(("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), start=1)}
DATE_TOKEN = re.compile(r"(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+(20\d{2}))?", re.I)


def parse_period(value: Any, reference_year: int) -> str | None:
    """Return the fieldwork interval MIDPOINT as yyyy-mm-dd, matching the user notebook.

    E.g. 12–13 Jan; 31 Dec – 7 Jan; 7 Jan; 14–15 Oct 2026.
    The year's heading is the END of the fieldwork period.
    """
    if pd.isna(value):
        return None
    text = re.sub(r"\[[^]]*]", "", str(value))
    text = text.replace("–", "-").replace("—", "-").replace("−", "-")
    end_match = list(DATE_TOKEN.finditer(text))
    if not end_match:
        return None
    end = end_match[-1]
    end_year = int(end.group(3)) if end.group(3) else reference_year
    try:
        end_date = datetime(end_year, MONTHS[end.group(2).lower()], int(end.group(1)))
        if "-" not in text[:end.end()] or len(text.split("-")) < 2:
            start_date = end_date
        else:
            first = end_match[0]
            if first.start() < end.start():
                start_day, start_month = int(first.group(1)), MONTHS[first.group(2).lower()]
                start_year = int(first.group(3)) if first.group(3) else (end_year - 1 if start_month > end_date.month else end_year)
            else:
                left = text.split("-")[0].strip()
                num = re.search(r"(\d{1,2})\s*$", left)
                if not num:
                    return None
                start_day, start_month, start_year = int(num.group(1)), end_date.month, end_year
            start_date = datetime(start_year, start_month, start_day)
        if (end_date - start_date).days < 0 or (end_date - start_date).days > 50:
            return None
        middle = start_date + (end_date - start_date) / 2
        return middle.date().isoformat()
    except (ValueError, TypeError):
        return None


def numeric_share(value: Any) -> float | None:
    if pd.isna(value):
        return None
    text = str(value).strip().replace("%", "")
    text = re.sub(r"\[[^]]*]", "", text).strip()
    if not re.fullmatch(r"\d{1,2}(?:[.,]\d{1,2})?|100(?:[.,]0+)?", text):
        return None
    val = float(text.replace(",", "."))
    return val if 0 <= val <= 100 else None


def sample_size(value: Any) -> int | None:
    if pd.isna(value):
        return None
    if isinstance(value, Number):
        if not math.isfinite(float(value)) or int(value) != float(value):
            return None
        size = int(value)
        return size if 100 <= size <= 100000 else None
    text = str(value).strip().replace("\u00a0", "")
    text = re.sub(r"\[[^]]*]", "", text)
    # Wikipedia separates thousands by commas; also tolerate 2.400
    if re.fullmatch(r"\d{1,3}(?:[,\.]\d{3})+", text):
        text = text.replace(",", "").replace(".", "")
    if not re.fullmatch(r"\d+", text):
        return None
    n = int(text)
    return n if 100 <= n <= 100000 else None


def normalize_name(s: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\[[^]]*]", "", str(s))).strip()


def normalized_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = []
    for c in df.columns:
        parts = list(c) if isinstance(c, tuple) else [c]
        name = next((str(t) for t in reversed(parts) if not str(t).startswith("Unnamed") and str(t).strip()), str(parts[-1]))
        name = re.sub(r"\[[^]]*]", "", name).strip()
        cols.append(name)
    df.columns = cols
    return df


def read_source_html(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "lxml")
    in_party_vote = False
    year: int | None = None
    polls: list[dict[str, Any]] = []
    for tag in soup.find_all(["h2", "h3", "h4", "h5", "table"]):
        if tag.name == "h2":
            heading = (tag.get("id") or tag.get_text(" ", strip=True)).lower().replace(" ", "_")
            if "party_vote" in heading:
                in_party_vote = True
                year = None
            elif in_party_vote:
                break
        elif tag.name != "table":
            heading = tag.get_text(" ", strip=True)
            if in_party_vote and re.fullmatch(r"20\d{2}", heading):
                year = int(heading)
        elif in_party_vote and year is not None:
            if "wikitable" not in tag.get("class", []):
                continue
            try:
                dfs = pd.read_html(StringIO(str(tag)), flavor="lxml")
            except (ValueError, ImportError):
                continue
            if not dfs:
                continue
            df = normalized_columns(dfs[0])
            expected = {"Fieldwork date", "Polling firm", "FdI", "PD", "M5S", "Lega", "FI", "AVS"}
            if not expected.issubset(set(df.columns)):
                continue
            if df.columns.duplicated().any():
                df = df.loc[:, ~df.columns.duplicated()]
            for _, row in df.iterrows():
                date = parse_period(row["Fieldwork date"], year)
                if not date:
                    continue
                firm = normalize_name(row["Polling firm"])
                if not firm or firm.lower() in {"nan", "polling firm"} or any(x in firm.lower() for x in ("election", "referendum")):
                    continue
                vals = {party: numeric_share(row[party]) for party in PARTIES}
                if sum(v is not None for v in vals.values()) < 4:
                    continue
                n = sample_size(row.get("Sample size"))
                polls.append({"date": date, "firm": firm, "n": n, **vals})
    uniq = {}
    for row in polls:
        key = (row["date"], row["firm"], row["n"], *[row[k] for k in PARTIES])
        uniq[key] = row
    return sorted(uniq.values(), key=lambda r: (r["date"], r["firm"]))


def download() -> list[dict[str, Any]]:
    response = requests.get(URL, headers={"User-Agent": "ItalianPollingDashboard/1.0 (educational project; contact via repository issues)", "Accept-Language": "en"}, timeout=40)
    response.raise_for_status()
    polls = read_source_html(response.text)
    if len(polls) < 20:
        raise RuntimeError(f"Only {len(polls)} polls found; Wikipedia markup may have changed")
    return polls


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="site/data/polls.json")
    parser.add_argument("--strict", action="store_true", help="Fail CI on download/parser errors")
    args = parser.parse_args()
    path = Path(args.output)
    try:
        polls = download()
    except Exception as exc:
        if not args.strict and path.exists():
            print(f"WARNING: download failed ({exc}); retaining last known data", file=sys.stderr)
            return
        raise
    previous = {}
    if path.exists():
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    # Avoid updating the timestamp and creating a git commit if data are identical.
    if previous.get("polls") == polls:
        print(f"No new results ({len(polls)} polls)")
        return
    payload = {
        "source": URL,
        "updated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_label": "Wikipedia (English), Party vote",
        "parties": list(PARTIES),
        "polls": polls,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Updated {path}: {len(polls)} polls")


if __name__ == "__main__":
    main()
