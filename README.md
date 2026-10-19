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


## Partiti disponibili (v3)

Le intestazioni numeriche della tabella «Party vote» di Wikipedia sono rilevate dinamicamente,
escludendo le colonne di metadati e i totali di coalizione. Il menu mostra tutte le
categorie effettivamente rilevate, incluse FN, PLD, A, IV, +E e «Others» (aggregato
Altri, non un singolo partito). Le sei formazioni della versione iniziale sono
preselezionate per leggibilità. Se un partito non era ancora rilevato in un periodo,
non vengono inventati valori retrospettivi.


### Export grafici — v4

Tutti i grafici Plotly hanno sfondo bianco opaco (sia nell'interfaccia, sia nei PNG).
Una firma in basso a sinistra include il link a
`https://github.com/nicomaestri/opinionpolls-italia`: cliccabile sul sito,
mentre nei PNG rimane testo visibile e non un collegamento attivo.
La modifica conserva il riconoscimento dinamico dei partiti della versione v3.

Per aggiornare un repository già pubblicato dalla v2, sostituire i file presenti
nel pacchetto **aggiornamento v4** mantenendone i percorsi. La pubblicazione
GitHub Actions sarà eseguita dopo il commit.


### Grafici e usabilità da cellulare — v5

La matrice Pearson è rettangolare su desktop e non vincola la proporzione delle celle (nessuna `scaleanchor`).
Sui cellulari il grafico resta leggibile con scorrimento orizzontale interno, senza allargare l'intera pagina.
Tutti i PNG vengono esportati dal pulsante **Esporta grafico PNG** sotto il grafico:
sono bianchi, ad alta risoluzione, e contengono **titolo, modalità, periodo, parametro LOWESS, legenda e firma con repository GitHub**.
Il pulsante nativo della barra Plotly è disabilitato per evitare immagini senza intestazione.
La V5 richiede la sostituzione di `site/assets/app.js`, `site/assets/style.css` e `tests/test_export_branding.cjs` (gli altri file restano invariati rispetto alla V4).


## Versione 6 — House effects OLS (integrati in “Variabilità tra istituti”)

Nella tab **03 — Variabilità tra istituti**, il menu permette di passare da
**CV settimanale** a **House effects · OLS**. Sono disponibili una classifica
per singolo partito e una heatmap istituto × partito. Entrambe rispettano il
filtro temporale del sito; la heatmap rispetta anche la selezione dei partiti.

### Specificazione stimata

Per ogni partito `p` viene stimato con **OLS a due effetti fissi**:

```text
y_{i,p,t} = μ_p + α_{i,p} + λ_{p,t} + ε_{i,p,t}
```

- `y_{i,p,t}`: quota di voto pubblicata dall'istituto `i`, mediata nell'eventualità
  di più rilevazioni dello stesso istituto nella settimana `t`. Ogni combinazione
  istituto-settimana vale una osservazione OLS, senza ponderazione per `n`.
- `λ_{p,t}`: effetti fissi settimanali (variazione comune del consenso).
- `α_{i,p}`: differenza persistente attribuibile all'istituto nella finestra selezionata,
  **relativa** agli altri istituti che possono essere confrontati temporalmente.
- **Normalizzazione**: somma degli effetti degli istituti inclusi pari a zero,
  `Σ_i α_{i,p} = 0` (somma non pesata per istituto). Unitá: punti percentuali.

L'OLS sfrutta la trasformazione *within-week* (Frisch-Waugh-Lovell) e non richiede
che il consenso vero sia conosciuto. Il collegamento tra istituti è determinato
soltanto da settimane comuni. Le settimane con un unico istituto e gli istituti
con meno di tre settimane comparabili sono esclusi; se la rete temporale è
disconnessa viene usata soltanto la componente con più osservazioni. Sono inoltre
richiesti almeno tre istituti e otto settimane comparabili.

**Limiti**: gli house effects non dimostrano un errore rispetto al voto vero,
non valutano l'accuratezza elettorale e non sono necessariamente stabili nel tempo.
Il display è volutamente descrittivo e non riporta intervalli di confidenza o
test di significatività: per inferenza rigorosa occorre modellare la dipendenza
seriale delle rilevazioni per istituto e l'incertezza associata alla selezione
/ sovrapposizione delle settimane.

Test: `node tests/house_effects.test.cjs`. Non sono richieste dipendenze
aggiuntive per la stima, che viene eseguita nel browser.
