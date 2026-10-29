;; Extra Eastwood config, loaded by `metabase.linters.eastwood`.

;; Kondo's `:deprecated-var` linter checks our own deprecated vars, with its exceptions in `.clj-kondo/config.edn`.
;; Eastwood only needs to flag deprecated Java and library calls, which Kondo can't see.
#_{:clj-kondo/ignore [:unresolved-symbol]}
(disable-warning
 {:linter         :deprecations
  :symbol-matches #{#"^#'metabase(-enterprise)?\."}})

;; `(is (thrown? ...))` expands to a `try` whose body is evaluated only to see whether it throws.
#_{:clj-kondo/ignore [:unresolved-symbol]}
(disable-warning
 {:linter                      :unused-ret-vals-in-try
  :if-inside-macroexpansion-of #{'clojure.test/is}
  :within-depth                10})
