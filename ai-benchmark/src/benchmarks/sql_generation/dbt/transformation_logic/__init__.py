"""
# CATEGORY 5 — Transformation Logic & Business Rules

### **Description**
dbt encourages analysts to encode business semantics (fraud rules, conversion definitions, tiering logic) directly into SQL models. These rules often appear as long `CASE` expressions or multi-step filters.
LLMs frequently:
- Recreate an oversimplified version
- Omit required filters
- Misrepresent the organization's actual definitions
This category ensures the agent respects *transformed* semantics, not naive interpretations.

### Why this matters / Why it's DBT-specific
- dbt encourages encoding business logic in intermediate layers.
- Agents must reproduce applied CASE/SPLIT/GROUP rules, bucketing logic, and normalization.
- Hard for LLMs because rules are implicit in upstream models.

### Example Prompts

#### **Prompt 1**
"Segment customers into standardized spending tiers and return the number of customers in each tier."

**Targets:** Business segmentation logic is often embedded in dbt models.
**Assumptions:**
- Tiering logic exists upstream.

#### **Prompt 2**
"Identify the share of transactions classified as 'high risk' based on the organization's fraud rules."

**Targets:** Complex CASE logic encoded in transformations.
**Assumptions:**
- Fraud rules implemented in intermediate models.

#### **Prompt 3**
"Return the count of events that qualify as conversions under the company's canonical conversion definition."

**Targets:** Must locate correct transformation model containing conversion rules.
**Assumptions:**
- Conversion logic applied in a specialized intermediate model.
"""

TEST_SPECS = []
