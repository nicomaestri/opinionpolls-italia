import unittest
from scripts.fetch_polls import parse_period, sample_size, numeric_share, read_source_html

class TestScraper(unittest.TestCase):
    def test_dates(self):
        self.assertEqual(parse_period("7 Jan", 2026), "2026-01-07")
        self.assertEqual(parse_period("12–13 Jan", 2026), "2026-01-12")
        self.assertEqual(parse_period("31 Dec – 7 Jan", 2026), "2026-01-03")
        self.assertEqual(parse_period("14–15 Oct", 2026), "2026-10-14")

    def test_fields(self):
        self.assertEqual(sample_size("2,400"), 2400)
        self.assertEqual(sample_size("2.400"), 2400)
        self.assertEqual(sample_size(2400.0), 2400)
        self.assertIsNone(sample_size("—N/a"))
        self.assertEqual(numeric_share("27.8"), 27.8)
        self.assertIsNone(numeric_share("w. IV"))

    def test_structure(self):
        html = '''<h2 id="Party_vote">Party vote</h2><h3>2026</h3>
        <table class="wikitable"><tr><th>Fieldwork date</th><th>Polling firm</th><th>Sample size</th>
        <th>FdI</th><th>PD</th><th>M5S</th><th>Lega</th><th>FI</th><th>AVS</th></tr>
        <tr><td>14–15 Oct</td><td>Only Numbers</td><td>800</td><td>27.8</td><td>20.0</td><td>11.1</td><td>6.0</td><td>7.7</td><td>6.6</td></tr></table>
        <h2 id="Seat_projections">Seat projections</h2>
        <table class="wikitable"><tr><th>Fieldwork date</th><th>Polling firm</th><th>Sample size</th>
        <th>FdI</th><th>PD</th><th>M5S</th><th>Lega</th><th>FI</th><th>AVS</th></tr>
        <tr><td>15 Oct</td><td>Not Poll</td><td>800</td><td>27</td><td>20</td><td>11</td><td>6</td><td>7</td><td>6</td></tr></table>'''
        rows = read_source_html(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['date'], '2026-10-14')
        self.assertEqual(rows[0]['AVS'], 6.6)

if __name__ == "__main__":
    unittest.main()
