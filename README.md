# OpinionPolls Italia

Un sito pubblico e gratuito per esplorare i sondaggi italiani con cinque analisi interattive: **medie settimanali + LOWESS**, **IC campionari 95%**, **CV settimanale tra istituti**, **boxplot per istituto**, **matrice di correlazione LOWESS**. Frontend statico (`site/`), Python per il download e GitHub Actions per aggiornare e pubblicare.


## Che cosa misura ciascun grafico

1. **Trend**: si calcola la media dei sondaggi dello stesso istituto nella stessa settimana (`W-SUN`), poi la media delle medie degli istituti (peso uguale per istituto). Si applica LOWESS robusto alle medie settimanali; ampiezza regolabile (10–70%). La prima analisi consente di passare da quote percentuali a un indice base 100 (prima settimana selezionata = 100), come nel notebook originario. Il campo data si riferisce al punto centrale dell'intervallo di fieldwork.
2. **IC teorici 95%**: per ciascun sondaggio e partito con `n` noto, `p ± 1.96 √[p(1−p)/n]` con `p` espresso come frazione. Il sito mostra la stima in percentuale e la semiampiezza in punti percentuali. **Non sono intervalli corretti per il disegno campionario**, pesi di post-stratificazione, non risposta o errori degli istituti; sono solo una misura campionaria illustrativa.
3. **CV tra istituti**: per ogni partito e settimana, `100 × s_istituti / media_istituti`, dove `s` è la deviazione standard campionaria delle medie per istituto nella stessa settimana. Solo settimane con **almeno tre istituti**. È una misura *descrittiva* della dispersione relativa, non la probabilità che la stima sia sbagliata né un IC formale. Non separa house effects persistenti, errori di campionamento o cambiamenti avvenuti nella settimana.
4. **Boxplot**: per ogni istituto, distribuzione dei singoli valori per il partito e le date scelti; mostra quartili, mediana, baffi e outlier. Vengono mostrati istituti con **almeno tre rilevazioni**. Le differenze di periodo possono influenzare il confronto.


5. **Correlazioni**: sulle serie LOWESS dei livelli settimanali oppure, per impostazione predefinita, sulle **variazioni settimanali in punti percentuali** di tali serie. Per ogni coppia di partiti si intersecano le **date realmente osservate**; non si interpolano date mancanti e, per le variazioni, si considerano solo settimane consecutive distanti esattamente sette giorni. Si calcola la **correlazione di Pearson** e si mostra il numero di settimane comuni (almeno otto; altrimenti la cella non è calcolata). I parametri di smoothing e il periodo selezionato modificano l'analisi. I livelli possono avere correlazioni spurie dovute ai trend; le percentuali dei partiti appartengono inoltre a dati composizionali, quindi correlazioni negative possono essere vincoli aritmetici. **Non implica trasferimenti di voto né causalità**.

## Origine e disponibilità dei dati

- Fonte di aggregazione operativa: [Wikipedia — Opinion polling for the next Italian general election](https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_Italian_general_election), sezione *Party vote*. Per controlli metodologici e conferma primaria delle rilevazioni, consultare il portale governativo [Sondaggi politico-elettorali](https://www.sondaggipoliticoelettorali.it/).
- Dati estratti automaticamente dalla tabella HTML di Wikipedia, senza usare l'Excel locale.
- Il progetto contiene uno **snapshot iniziale reale ma parziale** ricostruito dal testo Wikipedia fornito nel messaggio originario: **216 sondaggi fra gennaio e ottobre 2026**. Il primo workflow proverà a rimpiazzarlo con tutte le osservazioni che riesce a leggere dalla pagina viva.
- Il parser accetta sondaggi con almeno 4 valori numerici fra i 6 partiti scelti (FdI, PD, M5S, Lega, FI, AVS), scarta righe senza data e non impone un dato di `n` se mancante.
- I dati originali appartengono ai loro autori; Wikipedia è disponibile secondo i termini di attribuzione e condivisione della sua licenza. Mantieni il riferimento alla fonte nel sito.

## Struttura

```text
.github/workflows/pages.yml     Aggiornamento e deploy automatico
scripts/fetch_polls.py          Parser Wikipedia → JSON
scripts/bootstrap_snapshot.py   Conversione opzionale di copia testuale della fonte
site/index.html                 Dashboard
site/assets/style.css          Stile responsive
site/assets/app.js             LOWESS, matrice di correlazione, statistica, filtri, Plotly
site/assets/plotly.min.js      Bundle Plotly, utilizzabile senza CDN
site/data/polls.json           Archivio iniziale, aggiornato dalle Actions
tests/test_scraper.py           Test del parser
tests/correlation.test.cjs     Test calcoli di correlazione (Node)
requirements.txt               Librerie Python
```

## Nota tecnica

La struttura delle tabelle Wikipedia può cambiare. Il parser conserva l'ultimo JSON in caso di errore e richiede almeno 20 righe; se in futuro cambia il markup, occorrerà aggiornare `scripts/fetch_polls.py`. **Il progetto non ha ancora subito un test completo di fetch Wikipedia in questa sessione senza accesso HTTP diretto**: dopo il primo avvio su Actions verifica il log e la nuova numerosità dell'archivio.

## Costi

Il sito non richiede server o database dedicati: GitHub Pages e l'uso moderato di GitHub Actions sono normalmente gratuiti nei limiti applicabili ai repository pubblici. Un dominio personalizzato è facoltativo.
