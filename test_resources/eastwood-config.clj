(disable-warning
 {:linter :suspicious-expression
  :for-macro 'clojure.core/and
  :if-inside-macroexpansion-of #{'clojure.core.match/match}
  :within-depth 50
  :reason (str "By default, eastwood only allows a depth of up to 13 when ignoring single-arg `and` "
               "in `core/match` macro expansions; some of our `mbql.u/match` macros exceed that depth.")})

(disable-warning
 {:linter          :wrong-arity
  :function-symbol 'metabase.test.data.users/user-http-request
  :arglists-for-linting '([& args])})

(disable-warning
 {:linter          :wrong-arity
  :function-symbol 'metabase.test/user-http-request
  :arglists-for-linting '([& args])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test.fixtures/initialize
  :arglists-for-linting '([& what])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test.initialize/initialize-if-needed!
  :arglists-for-linting '([& what])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.query-processor-test/normal-drivers-with-feature
  :arglists-for-linting '([feature & more-features])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test/normal-drivers-with-feature
  :arglists-for-linting '([feature & more-features])})()
