(ns hooks.clojure.core.require-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.clojure.core.require]))

(def ^:private config
  '{:linters          {:metabase/modules {:level :warning}}
    :metabase/modules {search {:uses #{}}
                       task   {:api #{metabase.task.core}}}})

(defn- lint-requiring-resolve [form current-ns]
  (binding [clj-kondo.impl.utils/*ctx* {:config     config
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.core.require/lint-requiring-resolve
     {:node   (hooks/parse-string (pr-str form))
      :ns     current-ns
      :config config})
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:parallel dynamic-requiring-resolve-test
  (are [form] (= [] (lint-requiring-resolve form 'metabase.search.core))
    '(requiring-resolve (:failing-test-var opts))
    '(requiring-resolve @some-atom)
    '(requiring-resolve some-local)
    '(requiring-resolve "not-a-symbol")))

(deftest ^:parallel static-requiring-resolve-still-linted-test
  (is (= 1
         (count (lint-requiring-resolve '(requiring-resolve 'metabase.task.impl/go)
                                        'metabase.search.core)))
      "a statically-known cross-module violation is still reported"))
