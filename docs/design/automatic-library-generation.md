# Automatic Library Generation — Design Document

**Issue:** BOT-1784  
**Status:** Design (no implementation)  
**Author:** Metabot team  

---

## Overview

The Library (Data Studio) is currently populated by hand via Data Studio table publishing, collection placement, and moderation reviews. This document describes two approaches to auto-generating a Library from scratch:

1. **Deterministic classifier** — a scoring/thresholding function over quantitative signals.
2. **LLM agent** — a prompt-driven approach that can additionally exploit semantic signals.

Both approaches will be benchmarked against the hand-curated Library on Stats (stats.metabase.com).

---

## Shared Signals

Both approaches consume the same underlying signal set. Each signal is described with its source and rationale.

| Signal | Source | Rationale |
|--------|--------|-----------|
| **Dependency fan-in** | FK relationships, Dimension remappings, transform SQL references | Entities that many others depend on are foundational — strong library candidates. |
| **Dependency fan-out** | Same as above (reverse direction) | Entities with high fan-out are leaf/reporting layers — also strong candidates if in a "final" schema. |
| **Reference frequency** | Cards, dashboards, metrics, transforms that reference this entity | High reference count = high organizational utility. |
| **Usage/view frequency** | `view_log` / analytics tables | Actual user engagement — the strongest demand signal. |
| **Metabot selection frequency** | Metabot tool-call logs (entity_retrieval, search_data) | Proxy for "useful to ask questions about" — captures implicit user intent. |
| **Database/schema location** | `metabase_database.id`, table schema name | Schema tiers (mart/reporting vs. raw/staging) are strong priors. |
| **Existing curation signals** | `is_published`, `data_authority`, `data_layer`, collection `authority_level`, moderation reviews | Entities already partially curated are likely correct inclusions. |

---

## 1. Deterministic Classifier

### Inputs

For every candidate entity (table, model, metric, card, dashboard), compute a raw signal vector:

```
signals = {
  dependency_centrality   : normalized(fan_in + fan_out)        ∈ [0, 1]
  reference_count         : normalized(total_references)        ∈ [0, 1]
  view_count              : normalized(views_last_90d)          ∈ [0, 1]
  metabot_selection_count : normalized(selections_last_90d)     ∈ [0, 1]
  schema_tier             : tier_score(schema_name)             ∈ {0, 0.5, 1}
  curation_flags          : flag_score(is_published, verified,
                            data_authority, official_collection) ∈ [0, 1]
}
```

Normalization is min-max within the instance (per-database or globally — TBD during benchmarking).

### Schema Tier Scoring

| Schema pattern | Score |
|---------------|-------|
| `mart`, `reporting`, `analytics`, `public` | 1.0 |
| `intermediate`, `transform`, `int` | 0.5 |
| `raw`, `staging`, `stg`, `source`, `_airbyte`, `_fivetran` | 0.0 |
| Unrecognized | 0.5 (neutral) |

### Curation Flag Scoring

```
flag_score = max(
  1.0 if is_published AND data_layer = "final",
  0.8 if data_authority = "authoritative",
  0.6 if verified = true,
  0.4 if in official collection,
  0.0 otherwise
)
```

### Composite Score

```
score = w_dep   * dependency_centrality
      + w_ref   * reference_count
      + w_view  * view_count
      + w_bot   * metabot_selection_count
      + w_tier  * schema_tier
      + w_cur   * curation_flags
```

**Starting weights** (to be tuned against Stats benchmark):

| Weight | Value | Rationale |
|--------|-------|-----------|
| `w_dep` | 0.15 | Important but noisy (staging tables can have high centrality) |
| `w_ref` | 0.20 | Strong signal — widely-referenced entities are useful |
| `w_view` | 0.25 | Strongest demand signal — actual user engagement |
| `w_bot` | 0.15 | Good proxy for "askable" entities |
| `w_tier` | 0.10 | Useful prior but not definitive alone |
| `w_cur` | 0.15 | Existing human curation decisions are high-signal |

### Thresholding

Two strategies to evaluate:

1. **Fixed threshold:** Include entities with `score >= T` (starting T = 0.4, tuned against benchmark).
2. **Top-K per database:** Include the top K entities per database, where K scales with database size (e.g., `K = max(10, 0.15 * entity_count)`).

The benchmark will compare precision/recall of both strategies against the Stats library.

### Known Failure Modes

| Failure mode | Cause | Mitigation |
|-------------|-------|------------|
| Popular but low-quality tables scored high | View frequency dominated by ad-hoc exploration of raw data | Schema tier acts as a dampener; consider penalizing entities with no description |
| New high-quality models scored low | No usage history yet | Curation flag boost captures recently-published models |
| Staging tables with high fan-in scored high | ETL pipelines create many references to staging | Schema tier score of 0.0 offsets; consider hard exclusion of raw/staging |
| Over-inclusion in small instances | Min-max normalization inflates scores when N is small | Floor on entity count before normalization; or use Top-K strategy |
| Under-inclusion of metrics/cards | Signals are table-centric | Separate scoring pass for non-table entities using reference_count + view_count as primary signals |

---

## 2. LLM Agent (Prompt-Based Population)

### Architecture

The LLM agent receives the same quantitative signals as the deterministic classifier, but additionally exploits semantic context that a scoring function cannot use.

### Inputs to the Agent

**Quantitative signals (structured):**
Same signal vector as the deterministic classifier, provided as structured data (JSON) for each candidate entity.

**Semantic signals (agent-only):**

| Signal | Source | Value |
|--------|--------|-------|
| Entity name | `report_card.name`, `metabase_table.name` | LLM can infer domain relevance from naming conventions |
| Entity description | `description` field, `ai_context` | Human-written context about what the entity represents |
| Column names & comments | `metabase_field.name`, `database_comment` | Schema structure reveals entity purpose |
| Semantic similarity to curated content | Vector distance to already-curated entities in the library index | "More of the same kind of thing" |
| Table/column data types | Field types, semantic types | Helps distinguish fact tables from dimension tables |
| Collection hierarchy context | Parent collection names, sibling entities | Organizational context ("this lives in the Finance folder") |

### Prompt Design

The prompt is structured in three sections:

#### Section 1: Task Framing

```
You are a data curation assistant. Your job is to decide which data entities
in a Metabase instance should be included in the Library — the curated set
of trusted, high-quality entities that end users and Metabot can rely on for
answering business questions.

An entity belongs in the Library if it is:
- Authoritative: it represents a single source of truth for its domain
- Well-documented: it has a clear name and description
- Useful: it is actively used or referenced by other content
- Final: it represents a reporting/analytics-ready view, not a staging artifact

An entity does NOT belong if it is:
- A raw/staging table used only for ETL
- A duplicate or superseded version of another entity
- Rarely used and poorly documented
- An intermediate transform not meant for end-user consumption
```

#### Section 2: Context Payload

```json
{
  "instance_summary": {
    "total_tables": 342,
    "total_models": 28,
    "total_metrics": 15,
    "databases": ["Production DWH", "Application DB", "Analytics"]
  },
  "candidates": [
    {
      "id": 42,
      "type": "table",
      "name": "orders",
      "schema": "mart",
      "database": "Production DWH",
      "description": "All completed orders with customer and product details",
      "columns": ["id", "customer_id", "product_id", "total", "created_at", ...],
      "signals": {
        "dependency_centrality": 0.82,
        "reference_count": 0.91,
        "view_count": 0.75,
        "metabot_selection_count": 0.68,
        "schema_tier": 1.0,
        "curation_flags": 0.8
      },
      "semantic_context": {
        "similar_to_curated": ["customers", "products"],
        "collection_path": "Analytics / Core Models"
      }
    }
    // ... batch of candidates
  ]
}
```

#### Section 3: Output Format

```
Return a JSON array of decisions:

[
  {
    "id": 42,
    "include": true,
    "confidence": 0.92,
    "reason": "Core business entity — high usage, well-documented, in mart schema"
  },
  {
    "id": 108,
    "include": false,
    "confidence": 0.85,
    "reason": "Staging table with no description, only referenced by ETL transforms"
  }
]

For each candidate, provide:
- include: boolean — whether to add to the Library
- confidence: 0-1 — how confident you are in this decision
- reason: brief explanation (useful for audit/debugging)
```

### Batching Strategy

Instances may have hundreds or thousands of entities. The agent processes candidates in batches of ~50, with cumulative context about what has already been included (to maintain coherence and avoid duplicates).

### Agent-Only Advantages

| Capability | Why the LLM can do this but a score can't |
|-----------|------------------------------------------|
| Name-based inference | "stg_orders" is staging; "orders_fact" is final — naming conventions vary by org |
| Description quality assessment | Can judge whether a description is meaningful vs. boilerplate |
| Semantic deduplication | Can identify that "orders_v2" supersedes "orders" without explicit lineage |
| Domain coherence | Can ensure the library covers key business domains (finance, product, marketing) rather than just high-scoring entities |
| Column-level reasoning | Can assess whether a table's columns suggest it's user-facing vs. internal |

### Known Failure Modes

| Failure mode | Cause | Mitigation |
|-------------|-------|------------|
| Inconsistent decisions across batches | Context window limits, no global view | Provide running summary of included entities in each batch |
| Over-inclusion due to optimistic reasoning | LLM tendency to include rather than exclude | Calibrate with examples of correct exclusions; tune confidence threshold |
| Hallucinated reasoning | LLM invents rationale not grounded in signals | Validate that `reason` references actual signal values |
| Cost/latency at scale | Large instances = many API calls | Pre-filter obvious exclusions (raw/staging with zero usage) deterministically before LLM pass |
| Non-determinism | Same input may yield different outputs | Run multiple passes and use majority vote for borderline cases |

---

## Benchmarking Against Stats

### Methodology

The Stats instance (stats.metabase.com) has a hand-curated Library built by the Metabot team. This serves as ground truth.

**Metrics:**

| Metric | Definition |
|--------|-----------|
| **Precision** | % of auto-generated library entries that are also in the hand-curated library |
| **Recall** | % of hand-curated library entries that appear in the auto-generated output |
| **F1** | Harmonic mean of precision and recall |
| **Novel inclusions** | Entities included by the algorithm but NOT in the hand-curated library — reviewed manually to assess whether they are genuine misses in the hand-curated set or false positives |

### Evaluation Process

1. Run both approaches against the Stats instance (with curation signals zeroed out to avoid circularity).
2. Compare each approach's output to the hand-curated library.
3. Manually review disagreements (novel inclusions + misses) with the Metabot team.
4. Tune weights/thresholds/prompts based on findings.
5. Re-run and iterate until F1 meets target (TBD, starting goal: F1 >= 0.75).

### Hybrid Approach (Stretch)

If neither approach alone hits the target, consider a hybrid:
- Deterministic classifier as a first pass (high-recall pre-filter).
- LLM agent as a second pass (precision refinement — confirms/rejects borderline candidates).

This combines the speed and consistency of the classifier with the semantic judgment of the LLM.

---

## Open Questions

1. **Should the classifier hard-exclude raw/staging schemas or just penalize them?** Hard exclusion is simpler but may miss legitimately useful raw tables (e.g., event streams used directly for analytics).
2. **What is the right batch size for the LLM agent?** Larger batches give better global coherence but risk hitting context limits and degrading quality.
3. **How do we handle instances with no usage history?** New instances have no view_count or metabot_selection data — the classifier degrades to schema_tier + curation_flags + naming heuristics.
4. **Should we expose confidence scores to users?** Showing "why" an entity was included could help users trust and refine the auto-generated library.
5. **Cost budget for LLM approach?** Need to establish acceptable $/instance for the agent pass, especially for large instances (1000+ entities).

---

## Next Steps

1. Review this document with the Metabot team and execs.
2. Agree on approach (deterministic, LLM, or hybrid).
3. Implement benchmarking harness against Stats.
4. Iterate on weights/prompts until target F1 is met.
5. Build the "Generate library" UX and background job infrastructure.
