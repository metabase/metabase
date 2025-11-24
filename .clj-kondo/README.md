Update `clj-kondo` configs for libraries using

```sh
clojure -M:kondo --copy-configs --dependencies --lint "$(clojure -Spath -A:dev)"
```
