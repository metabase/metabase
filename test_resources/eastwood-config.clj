(disable-warning
 {:linter                      :suspicious-expression
  :for-macro                   'clojure.core/and
  :if-inside-macroexpansion-of #{'clojure.core.match/match}
  :within-depth                50
  :reason                      (str "By default, eastwood only allows a depth of up to 13 when ignoring single-arg `and` "
                                    "in `core/match` macro expansions; some of our `lib.util/match` macros exceed that depth.")})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test.data.users/user-http-request
  :arglists-for-linting '([& args])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test/user-http-request
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
  :function-symbol      'metabase.test/initialize-if-needed!
  :arglists-for-linting '([& what])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.query-processor-test/normal-drivers-with-feature
  :arglists-for-linting '([feature & more-features])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test/normal-drivers-with-feature
  :arglists-for-linting '([feature & more-features])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.query-processor-test/normal-drivers-without-feature
  :arglists-for-linting '([feature & more-features])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test/normal-drivers-without-feature
  :arglists-for-linting '([feature & more-features])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.http-client/client
  :arglists-for-linting '([& args])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test/client
  :arglists-for-linting '([& args])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.http-client/client-full-response
  :arglists-for-linting '([& args])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test/client-full-response
  :arglists-for-linting '([& args])})

(disable-warning
 {:linter               :wrong-arity
  :function-symbol      'metabase.test.data.sql/qualified-name-components
  :arglists-for-linting '([driver database-name & args])})

(disable-warning
 {:linter                      :suspicious-expression
  :for-macro                   'clojure.core/let
  :if-inside-macroexpansion-of #{'metabase.models.collection-test/with-collection-in-location}
  :within-depth                10})

(disable-warning
 {:linter                      :suspicious-expression
  :for-macro                   'clojure.core/let
  :if-inside-macroexpansion-of '#{metabase.test/with-temp
                                  metabase.test/with-temp*}
  :within-depth                10})

(disable-warning
 {:linter                      :constant-test
  :if-inside-macroexpansion-of #{'clojure.java.jdbc/with-db-connection}
  :within-depth                5})
