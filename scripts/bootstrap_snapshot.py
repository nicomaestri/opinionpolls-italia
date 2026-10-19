"""Optional: seed JSON from a text copy of Wikipedia table supplied by the user.

Not part of automatic updates: GitHub Actions uses fetch_polls.py directly.
Example: python scripts/bootstrap_snapshot.py my_wikipedia_copy.txt
"""
from pathlib import Path
import json
import re
import sys
from datetime import datetime,timezone
from fetch_polls import parse_period, sample_size, numeric_share, PARTIES, URL


def parse_snapshot(text: str):
    # A copied Wikipedia page contains multiple sections. Limit to Party vote.
    text = text.split('Party vote\nGraphical summary',1)[-1].split('\nSeat projections\n',1)[0]
    year=None
    header=None
    rows=[]
    for line in text.splitlines():
        line=line.strip('\ufeff')
        if re.fullmatch(r'20\d{2}',line.strip()):
            year=int(line.strip())
        elif line.startswith('Fieldwork date\t'):
            header=[re.sub(r'\[[^]]+\]','',s).strip() for s in line.split('\t')]
        elif year is not None and header and '\t' in line:
            tokens=line.split('\t')
            if len(tokens)<10 or not re.match(r'^\d{1,2}(?:\s*[-–—]\s*\d{1,2})?',tokens[0]):
                continue
            date=parse_period(tokens[0],year)
            firm=tokens[1].strip()
            if not date or not firm or firm.lower()=='election' or any(w in firm.lower() for w in ('joins','election','referendum')):
                continue
            mapping=dict(zip(header,tokens))
            shares={party:numeric_share(mapping.get(party)) for party in PARTIES}
            if sum(isinstance(v,float) for v in shares.values())<4:
                continue
            rows.append({'date':date,'firm':firm,'n':sample_size(tokens[2]),**shares})
    unique={}
    for r in rows:
        key=(r['date'],r['firm'],r['n'],*(r[p] for p in PARTIES))
        unique[key]=r
    return sorted(unique.values(),key=lambda r:(r['date'],r['firm']))


def main():
    source=Path(sys.argv[1]);dest=Path(sys.argv[2] if len(sys.argv)>2 else 'site/data/polls.json')
    rows=parse_snapshot(source.read_text(encoding='utf8'))
    if len(rows)<20:raise RuntimeError(f'Only {len(rows)} observations parsed: check the snapshot')
    output={
        'source': URL,
        'updated_utc':datetime(2026,10,19,15,32,tzinfo=timezone.utc).isoformat(),
        'source_label':'Wikipedia (English), Party vote (initial snapshot imported from uploaded text)',
        'parties':list(PARTIES),'polls':rows
    }
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    print('Wrote',dest,'with',len(rows),'rows', 'range',rows[0]['date'],rows[-1]['date'],'firms',len({v['firm'] for v in rows}))

if __name__=='__main__':main()
