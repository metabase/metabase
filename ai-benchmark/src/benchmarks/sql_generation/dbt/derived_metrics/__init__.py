"""
# CATEGORY 4 — Derived Metrics, Semantic Consistency & Metric Layer Reasoning

### **Description**
Organizations often define metrics (LTV, churn, ARPU) in dbt models or semantic layers. If an agent recomputes a metric inconsistently or uses incorrect logic, results diverge from canonical business expectations.
This category verifies whether an agent:
- Applies definitions consistently across contexts
- Recognizes reusable metric transformations
- Avoids re-implementing metrics incorrectly

### Why this matters / Why it's DBT-specific
- dbt users often rely on a metrics layer or metric-like logic embedded in models.
- Text-to-SQL agents frequently misapply metric definitions (wrong grain, inappropriate filters).
- Ensures metric reproducibility across models.

### Example Prompts

#### **Prompt 1**
"Show the monthly churn rate using the organization's standard definition of churn."

**Targets:** Application of centralized metric semantics.
**Assumptions:**
- Metric definition exists in a model or external semantic layer.

#### **Prompt 2**
"Report the customer lifetime value for all active customers, following the definition used in financial reporting."

**Targets:** Interpretation of derived metrics built through multiple transformations.
**Assumptions:**
- LTV is defined through multi-step logic (revenue, retention, margins).

#### **Prompt 3**
"Compute average order value for the previous year using the organization's standard formulation."

**Targets:** Ensures correct metric definition (AOV = revenue / orders).
**Assumptions:**
- Metric logic is abstracted somewhere in the DAG.
"""

TEST_SPECS = []
