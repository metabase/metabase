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

(defn- lint [hook form current-ns]
  (binding [clj-kondo.impl.utils/*ctx* {:config     config
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hook {:node   (hooks/parse-string (pr-str form))
           :ns     current-ns
           :config config})
    (mapv #(select-keys % [:message :type])
          @(:findings clj-kondo.impl.utils/*ctx*))))

(defn- lint-require [form current-ns]
  (lint hooks.clojure.core.require/lint-require form current-ns))

(defn- lint-requiring-resolve [form current-ns]
  (lint hooks.clojure.core.require/lint-requiring-resolve form current-ns))

(def ^:private dynamic-require-finding
  {:message "Module dependency cannot be statically determined from a dynamic require"
   :type    :metabase/modules})

(deftest ^:parallel dynamic-requiring-resolve-test
  (testing "outside the module system"
    (is (= [] (lint-requiring-resolve '(requiring-resolve (:failing-test-var opts)) 'dev))))
  (testing "inside a module"
    (are [form] (= [dynamic-require-finding]
                   (lint-requiring-resolve form 'metabase.search.core))
      '(requiring-resolve (:failing-test-var opts))
      '(requiring-resolve @some-atom)
      '(requiring-resolve some-local)
      '(requiring-resolve "not-a-symbol"))))

(deftest ^:parallel dynamic-require-test
  (testing "outside the module system"
    (is (= [] (lint-require '(require some-local) 'dev))))
  (testing "inside a module"
    (is (= [dynamic-require-finding]
           (lint-require '(require some-local) 'metabase.search.core)))))

(deftest ^:parallel static-requiring-resolve-still-linted-test
  (is (= 1
         (count (lint-requiring-resolve '(requiring-resolve 'metabase.task.impl/go)
                                        'metabase.search.core)))
      "a statically-known cross-module violation is still reported"))

(deftest ^:parallel static-require-still-linted-test
  (is (= 1
         (count (lint-require '(require 'metabase.task.impl :reload)
                              'metabase.search.core)))
      "a statically-known cross-module violation is still reported while keyword flags are ignored"))
