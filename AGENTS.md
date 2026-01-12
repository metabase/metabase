# Build/Test Commands

## Target Test
```bash
# Via clj-nrepl-eval (preferred)
clj-nrepl-eval -p 7888 --timeout 300000 <<'EOF'
(require '[metabase.driver.redshift-test :as rt] :reload-all)
(clojure.test/test-var #'rt/remark-test)
EOF
```

## Quick Namespace Reload
```bash
clj-nrepl-eval -p 7888 "(require '[metabase.test.data.impl.get-or-create :reload])"
```

## Check for Cyclic Dependencies
```bash
clj-nrepl-eval -p 7888 "(require '[metabase.test.data.sql :reload])"
```

## Run Full Redshift Test Suite (slow - avoid unless needed)
```bash
clj -X:dev:test :only metabase.driver.redshift-test
```

## Lint Check
```bash
clj-kondo --lint test/metabase/test/data/impl/get_or_create.clj
```
