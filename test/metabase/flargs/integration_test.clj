(ns metabase.flargs.integration-test
  "Integration test for the `defflarg` machinery exercised under real classpath isolation.

  This test is alias-aware: it inspects the classpath to determine whether the flarg's namespace is
  loadable, then asserts the expected behavior for that condition. To exercise BOTH conditions, run
  it twice:

    - Without `:flarg/test-flarg` (default REPL/test config): asserts the `:default` branch runs.
    - With `:flarg/test-flarg`: asserts the `:impl` branch runs.

  Coordinator-verifiable command for the on-alias path:

    clojure -X:dev:ee:ee-dev:test:flarg/test-flarg \\
      :only '[metabase.flargs.integration-test]'

  Because the lazy require in `metabase.flargs.core/dynamic-flarg-fn` caches its first result, any
  impl registration must happen before the seam function is first invoked. The `flarg-loadable?`
  probe below requires the flarg-side namespace (triggering the `defflarg` impl registration if
  it's on the classpath) before any call to the seam. Calling the seam without that require first
  would race the lazy-load and observe whatever state happens to be cached."
  (:require
   [clojure.test :refer :all]
   [metabase.flargs.integration-seam :as seam]))

(defn- flarg-loadable?
  "Returns true when the flarg-side namespace can be loaded on the current classpath. Loading also
  triggers the flarg-side `defflarg` form to register its impl against the registry."
  []
  (try
    (require 'metabase.flarg.test-flarg.core)
    true
    (catch Exception _ false)))

(deftest defflarg-classpath-isolation-test
  (let [loadable? (flarg-loadable?)]
    (testing (str "When the flarg ns is "
                  (if loadable? "loadable" "NOT loadable")
                  ", the dispatcher routes to the "
                  (if loadable? "impl" "default"))
      (is (= (if loadable? :impl :default)
             (seam/test-fn))))))
