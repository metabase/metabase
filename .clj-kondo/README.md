Update `clj-kondo` configs for libraries using

```sh
clj-kondo --copy-configs --dependencies --lint "$(clojure -Spath -A:dev)"
```
