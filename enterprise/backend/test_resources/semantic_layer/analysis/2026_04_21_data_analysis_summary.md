# Semantic Layer Complexity Score — Synonym Axis Analysis

**Date:** 2026-04-21
**Author:** Chris Truter + Claude (Opus 4.6)
**Data source:** Metabase stats instance appdb dump (4,013 tables, 1,252 model/metric cards, 235K fields)

## Motivation

The complexity score includes a "synonym pairs" axis: +50 points for each pair of entity names
that are semantically similar enough to confuse an AI agent during search-based retrieval. The
current implementation mirrors the semantic-search system's cosine-distance threshold (0.70
distance = 0.30 similarity) and reuses whatever embeddings the search index has pre-computed.

We ran this against the stats instance and got absurd numbers — 9.27 million synonym pairs out of
9.27 million possible (100% saturation). This prompted a systematic investigation into what
threshold, embedding model, and text preprocessing actually produces a meaningful signal.

## What We Tested

### Embedding Models

| Model | Dimensions | Type | Availability |
|---|---|---|---|
| Snowflake Arctic Embed XS | 384 | Retrieval | ollama (local) |
| Snowflake Arctic Embed L v2.0 | 1024 | Retrieval | ollama (local), ai-service (prod) |
| all-MiniLM-L6-v2 | 384 | Semantic Textual Similarity (STS) | ollama (local) |

### Text Preprocessing Variants

| Variant | What's embedded | Example |
|---|---|---|
| **names** | Raw entity name, lowercased | `"monthly_active_users"` |
| **names-split** | Underscores/hyphens/camelCase → spaces | `"monthly active users"` |
| **search-text** | `[type] name - description (schema)` | `"[table] orders - All customer orders since 2019 (PUBLIC)"` |
| **typed-split** | `[source\|value] split-name` | `"[source] monthly active users"` |

### Catalogs

- **Library** — 253 distinct entity names (curated subset)
- **Universe** — 4,306 distinct entity names (everything in the appdb)

## Key Findings

### 1. The Current Threshold (0.30 similarity) Is Meaningless

At 0.30, every model and every text variant produces 100% saturation — literally every pair of
names is flagged as a "synonym." This is because embedding models place all short text in a
relatively tight cone in vector space; 0.30 is below the baseline similarity of essentially any
two English strings.

The 0.30 threshold was chosen to match semantic search's retrieval cutoff. But search uses this
threshold for **recall** ("return anything plausibly relevant"), not for **precision** ("these two
things are confusingly similar"). The complexity score needs the latter. These should be
independently calibrated.

### 2. Splitting Underscores Dramatically Improves Discrimination

Embedding models are trained on natural language. `"monthly_active_users"` is an out-of-
distribution token; `"monthly active users"` hits three well-understood tokens. Splitting
before embedding pushes unrelated names further apart.

**Library pair counts at selected thresholds (Arctic-L 1024d):**

| Threshold | Names (raw) | Names (split) | Improvement |
|---|---|---|---|
| 0.70 | 29,613 (92.9%) | 13,695 (43.0%) | 2.2× fewer |
| 0.80 | 7,512 (23.6%) | 1,673 (5.2%) | 4.5× fewer |
| 0.90 | 340 (1.1%) | 129 (0.4%) | 2.6× fewer |

### 3. MiniLM (STS Model) Is Far More Discriminating Than Arctic (Retrieval Model)

Arctic is trained for query→document matching (broad recall). MiniLM is trained for semantic
textual similarity (precise meaning match). At every threshold, MiniLM produces dramatically
fewer pairs:

**Library pair counts, names-split:**

| Threshold | Arctic-L (1024d) | MiniLM (384d) |
|---|---|---|
| 0.30 | 31,878 (100%) | 2,733 (8.6%) |
| 0.50 | 31,878 (100%) | 673 (2.1%) |
| 0.70 | 13,695 (43.0%) | 168 (0.5%) |
| 0.80 | 1,673 (5.2%) | 61 (0.2%) |
| 0.90 | 129 (0.4%) | 12 (0.04%) |

MiniLM at 0.30 is already more selective than Arctic at 0.80.

### 4. Transitivity Creates Mega-Clusters

Connected-component clustering (used by pair-counting) is transitive: if A≈B and B≈C, they're
in the same cluster even if A and C aren't similar at all. This creates massive mega-clusters
from weak transitive chains.

**Universe connected components at threshold 0.90 (Arctic-L, names):**
- Largest cluster: **2,204 out of 4,306 names** (51%)
- Minimum pairwise similarity within that cluster: **0.508**
- Median pairwise similarity: **0.765**

The cluster exists because short names like "orders + products, count" transitively chain through
moderately-similar names to reach "open bugs" (similarity 0.75) — names no human would confuse.

**Greedy cliques** (fully-mutually-connected subgroups) break this down into meaningful groups.
At 0.90, Arctic-L names-split produces cliques of 5 or fewer with density 1.0 — every pair
genuinely confusable.

### 5. Search-Text Embeddings Don't Help Much Over Split Names

Adding descriptions and schema info (the "search-text" variant matching what the search indexer
embeds) provides only modest improvement over split-names-only. The extra text helps at mid
thresholds (0.60–0.80) but at higher thresholds the signal converges. Since descriptions add
complexity and coupling to the search indexer, split-names is the better default.

### 6. Entity-Type Prefixes ([source] vs [value]) Are Risky

We considered prepending `[source]` (tables, models) or `[value]` (metrics, measures) to push
cross-type pairs apart. The concern: the most important confusions ARE cross-type — a table
"orders" vs a model "orders" is exactly what trips agents. Type prefixes would mask this.

We produced typed-split embeddings for reference but do NOT recommend using them as the default.

## Eyeball Calibration: What Each MiniLM Band Looks Like

| Band | Verdict | Example pairs |
|---|---|---|
| 0.50–0.60 | **Noise.** Same vendor prefix, different concept. | "ms_address" ↔ "ms_user", "setup_event" ↔ "action_event" |
| 0.60–0.70 | **Mostly noise.** Occasional real synonym. | "stripe_refund" ↔ "stripe_charge", "ms_contact" ↔ "salesforce_contact" |
| 0.70–0.75 | **Mixed.** ~40% genuinely confusable. | "salesforce_account" ↔ "accounts" (yes), "pipedrive_org" ↔ "pipedrive_person" (no) |
| 0.75–0.80 | **Getting real.** Most pairs are confusable. | "gh_issue" ↔ "gh_project_issue", "setup_event" ↔ "setting_event" |
| **0.80–0.85** | **Almost all signal.** | "gh_workflow_job" ↔ "gh_workflow_step", "monthly_revenue_customer" ↔ "monthly_revenue" |
| 0.85–0.90 | **All signal.** Genuinely problematic pairs. | "gh_pull_request_review" ↔ "gh_pull_request", "accounts" ↔ "account" |
| 0.90+ | **Near-duplicates.** | "ms_stripe_charge" ↔ "stripe_charge", "metabase_version" ↔ "ms_metabase_version" |

## Recommendations

### 1. Decouple the Synonym Threshold from the Search Threshold

The synonym axis and the search system serve different purposes (precision vs recall) and need
independently calibrated thresholds. The current `(- 1 semantic-search/max-cosine-distance)`
derivation should be replaced with a dedicated constant.

### 2. Use MiniLM at 0.80 (Preferred) or Arctic at 0.90 (Pragmatic)

| Option | Model | Threshold | Library pairs | Notes |
|---|---|---|---|---|
| **Preferred** | MiniLM (names-split) | 0.80 | 61 (0.2%) | Best precision. Needs MiniLM deployed. |
| **Pragmatic** | Arctic-L (names-split) | 0.90 | 129 (0.4%) | Uses existing infra. Slightly noisier. |
| Current | Arctic-L (search-index) | 0.30 | 31,878 (100%) | Useless. |

### 3. Always Split Names Before Embedding

Regardless of model or threshold, splitting `_`, `-`, `.`, and camelCase to spaces before
embedding improves discrimination at every operating point. This is a free win — no model
change, no infra, just a text-preprocessing step.

### 4. Consider Clique-Based Scoring Instead of Pair-Counting

Pair-counting with transitive connected components inflates the score with chains of weak
similarity. Greedy cliques (fully-mutually-connected groups) better capture the actual
disambiguation challenge an agent faces. The number and size of cliques could replace or
supplement the raw pair count.

### 5. Don't Add Entity-Type Prefixes

Cross-type confusion (table "orders" ↔ model "orders") is real and important. Type prefixes
would hide it. Keep embeddings type-agnostic.

## Artifacts

### Embedding Files (`appdb_dump/embeddings/`)

| File | Model | Text | Dims | Size |
|---|---|---|---|---|
| `names_arctic-l_1024d.json` | Arctic-L | raw names | 1024 | 89MB |
| `names_arctic-xs_384d.json` | Arctic-XS | raw names | 384 | 33MB |
| `names_split_arctic-l_1024d.json` | Arctic-L | split names | 1024 | 89MB |
| `names_split_minilm-l6v2_384d.json` | MiniLM | split names | 384 | 33MB |
| `search-text_arctic-l_1024d.json` | Arctic-L | search text | 1024 | 89MB |
| `search-text_arctic-xs_384d.json` | Arctic-XS | search text | 384 | 33MB |
| `typed_split_arctic-l_1024d.json` | Arctic-L | typed split | 1024 | 89MB |
| `typed_split_minilm-l6v2_384d.json` | MiniLM | typed split | 384 | 33MB |

### Analysis Output (`analysis/output/{model}/{text}/{catalog}/`)

68 EDN files across 6 model×text configurations, each containing self-describing `:metadata`.
Structure: `{model}/{text}/{catalog}/sample_pairs.edn` and `clusters_v2_{threshold}.edn`.

### Scripts (`analysis/`)

| Script | Purpose |
|---|---|
| `generate_embeddings.clj` | Produce all embedding files (requires ollama + models) |
| `generate_analysis.clj` | Regenerate all output files from embeddings |
| `sample_pairs.clj` | Sample ~100 pairs per similarity band |
| `cluster_analysis_v2.clj` | Connected components + greedy cliques + HAC + density metrics |

## Open Questions

- Should we ship the appdb dump + embeddings as checked-in test resources, or generate on demand?
  The embedding files are 33–89MB each (8 files ≈ 500MB total). Too large for git without LFS.
- For production scoring, do we embed names on the fly (requires an embedding model call) or
  pre-compute during the search indexer's normal pass and read from pgvector?
- Is the +50 per-pair weight still appropriate, or should clique count / clique size be the
  primary scoring primitive?
