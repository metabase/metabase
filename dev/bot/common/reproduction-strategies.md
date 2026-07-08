## Reproduction Strategy Selection

Choose the fastest verification path for each issue type:

| Issue Type | Primary Strategy | Secondary |
|------------|-----------------|-----------|
| UI / frontend behavior | Playwright + REPL for data setup | API |
| Setup steps in issue | REPL for data setup, Playwright for UI verification | API |
| API / endpoint behavior | REPL (invoke handlers directly) or `./bin/mage -bot-api-call` | Code analysis |
| Query results / SQL generation | REPL: `qp/process-query` or `qp.compile/compile` | Code analysis |
| Wrong data / DB state | REPL: `t2/select` to inspect | API |
| Permissions / auth flows | REPL + Playwright | Code analysis |
| Code logic / edge case | REPL: read source then invoke functions | Direct code comparison |
| Checking if fixed | Compare source + REPL to test both versions | API verification |

### Efficiency budgets

- **Code search**: Use at most 3-5 Grep calls with broad patterns. Parallelize independent searches. Don't iterate narrow patterns — broaden instead.
- **Code analysis**: Compare files in at most 5-7 targeted file reads. If root cause isn't clear, pivot to runtime verification. Don't trace full git history.
- **Backend bugs**: Limit Playwright to 1-2 screenshots for evidence. Don't iterate on UI reproduction if REPL already confirmed the bug.

### Special cases

- **Timing / race conditions**: If reproduction requires simulating slow responses or race conditions that can't be triggered locally, proceed with code analysis. Note that root cause is confirmed via code review but not empirically observable in a single-instance environment.
- **Time-series bugs**: Test at multiple data densities: ~12 points (monthly/1yr), ~36 (monthly/3yr), ~60 (monthly/5yr). Bug often manifests at specific density where ECharts switches interval logic.
- **External dependency bugs**: If the bug requires a remote database, LDAP, SMTP, S3, or other external service not available locally, classify as INCONCLUSIVE and note the required infrastructure.
