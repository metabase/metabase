## Metabase Release Script 3.0

#### Prereqs

1.  Install Clojure CLI -- see [https://clojure.org/guides/getting_started]. Don't use `apt install clojure` as this
    installs a version that doesn't understand `deps.edn`.

1.  Script will interactively prompt for other prereqs and env vars

#### Running

```bash
# Run from the same directory as this README file
cd /path/to/metabase/release
clojure -m release
```
