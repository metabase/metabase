(disable-warning
 {:linter :suspicious-expression
  :for-macro 'clojure.core/and
  :if-inside-macroexpansion-of #{'clojure.core.match/match}
  :within-depth 50
  :reason (str "By default, eastwood only allows a depth of up to 13 when ignoring single-arg `and` "
               "in `core/match` macro expansions; some of our `mbql.u/match` macros exceed that depth.")})
