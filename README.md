# Antibiotogram

A sourced antimicrobial coverage reference for trainees and teachers: spectrum bands to compare drugs, organism maps, dosing tables, and your own unit's antibiogram beside the reference.

Live: https://itskaero.github.io/antibiotogram/

## What's in it

| View | What it does |
|---|---|
| **Overview** | Counts, WHO AWaRe mix, the organisms with the fewest reliable options, recent advances and resistance alerts. |
| **Spectrum** | Gantt-style bands: up to four drugs across every organism, a "together" row that shows the gaps, and a full list showing what each other drug would add. Switches between the reference and your imported antibiogram (% susceptible, n < 30 hatched). |
| **Organisms** | Honeycomb map per kingdom (bacteria, fungi, viruses), coloured by how many reliable options exist or by one drug. Each organism lists its mechanism, cited guideline and ranked options. |
| **Drugs** | Horizontal card rail with a coverage fingerprint on every card; drug pages with AWaRe group, FDA label link, dosing by population with renal and hepatic bands, site-of-infection rules, teaching notes and live PubMed results. |
| **Antibiogram** | Import an [Antibiome](https://github.com/itskaero/antibiome) export (JSON) or a CSV. The file stays in the browser. |
| **Recent advances** | Hand-checked approvals and guidance, plus guidelines, trials and reviews from PubMed refreshed weekly by a GitHub Action. |
| **Sources & review** | Every reference, and how much of each dataset is sourced and clinician-reviewed. |

Patient context (population, kidney and liver function, site of infection) is set from the top bar and stays in the browser.

## Data

All data is in [`data/`](data/) as JSON so changes can be reviewed in pull requests.

| File | Contents | Source |
|---|---|---|
| `drugs.json` | 58 antimicrobials, class, route, WHO AWaRe 2023 group | WHO AWaRe 2023, FDA labels |
| `organisms.json` | 38 organisms and resistance phenotypes with activity codes per drug | Guideline cited per row in `basis` |
| `sites.json` | Site-of-infection rules | Only statements made directly in an FDA label or the cited guideline |
| `dosing.json` | Neonate, infant, child, adult, renal and hepatic dosing for 56 of 58 drugs (39 complete, 17 partial) | Current FDA label on DailyMed (setid, section, effective date) or the WHO AWaRe book (PDF page). Each entry carries a verbatim quote. Extracted and then independently re-checked against the source; clinician review pending. No usable source yet for amphotericin B deoxycholate or molnupiravir |
| `sources.json` | Every reference with citation and link | — |
| `curated.json` | Hand-checked approvals and guidance | — |
| `advances.json` | Weekly literature feed | Written by `scripts/update-advances.mjs` |
| `teaching-notes.json`, `combinations.json`, `alerts.json` | Teaching commentary | Editors |

Activity codes: `FD` drug of choice, `F` active, `P` partial, `V` variable, `C` combination only, `I` in vitro or limited data, `N` not reliable. A missing code means **not assessed**, never inactive.

Each organism row has `review.status`. It changes to `reviewed` only when a named clinician has checked every cell against the cited source.

### Weekly update

`.github/workflows/update-advances.yml` runs every Monday (or on demand from the Actions tab). It runs `node scripts/update-advances.mjs`, which queries PubMed for guidelines, randomised trials, meta-analyses and systematic reviews naming a drug in `drugs.json`, plus FDA press releases, and commits `data/advances.json` if anything changed.

## Running locally

The app loads JSON with `fetch`, so serve the folder instead of opening the file directly:

```bash
npx serve .        # or: python3 -m http.server
```

It installs as an app (PWA) and works offline with the last downloaded data.

## Disclaimer

For education and decision support. Coverage is a population-level summary. It does not replace culture and susceptibility results, your local antibiogram, the product label or specialist advice.

The previous single-page version is kept in [`legacy/`](legacy/).
