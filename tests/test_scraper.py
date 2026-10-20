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


    def test_multiple_historical_year_tables(self):
        header='<tr><th>Fieldwork date</th><th>Polling firm</th><th>Sample size</th><th>FdI</th><th>PD</th><th>M5S</th><th>Lega</th><th>FI</th><th>AVS</th></tr>'
        def table(date):
            return '<table class="wikitable">'+header+f'<tr><td>{date}</td><td>SWG</td><td>1200</td><td>28</td><td>21</td><td>12</td><td>6</td><td>7</td><td>6</td></tr></table>'
        html='<h2 id="Party_vote">Party vote</h2><h3>2026</h3>'+table('14–15 Oct')+'<h3>2025</h3>'+table('17–22 Dec')+'<h2>Seat projections</h2>'
        rows=read_source_html(html)
        self.assertEqual(len(rows),2)
        self.assertEqual({r['date'][:4] for r in rows}, {'2025','2026'})

    def test_extra_parties_detected(self):
        html = '''<h2 id="Party_vote">Party vote</h2><h3>2026</h3>
        <table class="wikitable"><tr><th>Fieldwork date</th><th>Polling firm</th><th>Sample size</th>
        <th>FdI</th><th>PD</th><th>M5S</th><th>Lega</th><th>FI</th><th>AVS</th>
        <th>FN</th><th>PLD</th><th>A</th><th>Others</th><th>Lead</th><th>CSX</th></tr>
        <tr><td>14–15 Oct</td><td>Only Numbers</td><td>800</td>
        <td>27.8</td><td>20.0</td><td>11.1</td><td>6.0</td><td>7.7</td><td>6.6</td>
        <td>7.0</td><td>0.7</td><td>3.1</td><td>4.2</td><td>7.8</td><td>43.1</td></tr></table>
        <h2 id="Seat_projections">Seat projections</h2>'''
        rows = read_source_html(html)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['FN'], 7.0)
        self.assertEqual(rows[0]['PLD'], 0.7)
        self.assertEqual(rows[0]['A'], 3.1)
        self.assertEqual(rows[0]['Others'], 4.2)
        self.assertNotIn('Lead',rows[0])
        self.assertNotIn('CSX',rows[0])

if __name__ == "__main__":
    unittest.main()

class TestCoalitionSource(unittest.TestCase):
    def test_separate_hypothetical_scenarios(self):
        from scripts.fetch_polls import read_coalition_source_html
        html='''<h3>Polling for coalitions</h3>
          <h4>CSX vs. CDX vs. FN vs. Centre</h4>
          <table class="wikitable"><tr><th>Fieldwork date</th><th>Polling firm</th><th>Sample size</th><th>CSX</th><th>CDX</th><th>FN</th></tr>
          <tr><td>18–19 Jun 2026</td><td>BiDiMedia</td><td>1,000</td><td>44.6</td><td>44.4</td><td>4.8</td></tr></table>
          <h4>CSX (Schlein leader) vs. CDX vs. FN vs. Centre</h4>
          <table class="wikitable"><tr><th>Fieldwork date</th><th>Polling firm</th><th>Sample size</th><th>CSX</th><th>CDX</th></tr>
          <tr><td>14–19 Oct 2026</td><td>SWG</td><td>1,200</td><td>44.6</td><td>44.0</td></tr></table>
          <h4>Who should be part of the centre-left coalition</h4>
          <table class="wikitable"><tr><th>Fieldwork date</th><th>Polling firm</th><th>CSX</th><th>CDX</th></tr>
          <tr><td>15 Oct 2026</td><td>Not a coalition-vote poll</td><td>40</td><td>50</td></tr></table>
          <h3>Other polling topic</h3>'''
        rows=read_coalition_source_html(html)
        self.assertEqual(len(rows),2)
        self.assertNotEqual(rows[0]['scenario'],rows[1]['scenario'])
        self.assertEqual(rows[0]['CSX'],44.6)
        self.assertEqual(rows[1]['CDX'],44.0)

class TestCoalitionAggregation(unittest.TestCase):
    def test_party_vote_csx_cdx_are_separate_from_party_columns(self):
        from scripts.fetch_polls import read_coalition_party_vote_html
        head='<tr><th>Fieldwork date</th><th>Polling firm</th><th>Sample size</th><th>FdI</th><th>PD</th><th>M5S</th><th>Lega</th><th>FI</th><th>AVS</th><th>CSX</th><th>CDX</th></tr>'
        def t(date):return '<table class="wikitable">'+head+f'<tr><td>{date}</td><td>SWG</td><td>1200</td><td>28</td><td>21</td><td>12</td><td>6</td><td>7</td><td>6</td><td>43.1</td><td>42.8</td></tr></table>'
        html='<h2 id="Party_vote">Party vote</h2><h3>2026</h3>'+t('14–15 Oct')+'<h3>2025</h3>'+t('17–22 Dec')+'<h2>Seat projections</h2>'
        rows=read_coalition_party_vote_html(html)
        self.assertEqual(len(rows),2)
        self.assertEqual({r['date'][:4] for r in rows},{'2025','2026'})
        self.assertEqual(rows[0]['kind'],'aggregate')
        self.assertEqual(rows[0]['CDX'],42.8)
