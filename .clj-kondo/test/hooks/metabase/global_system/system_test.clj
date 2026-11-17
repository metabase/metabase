(ns hooks.metabase.global-system.system-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.global-system.system :as sut]))

(defn- findings
  "Lint `src`, a call to `mutable-component-handle`, as if it appeared in the namespace `ns`."
  [ns src]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/component-handle-own-key {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (sut/mutable-component-handle {:node (hooks/parse-string src)
                                   :ns   ns})
    (mapv :type @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest own-key-test
  (testing "a keyword in the calling namespace is allowed"
    (is (= [] (findings 'metabase.app-db.connection
                        "(system/mutable-component-handle ::application-db)")))
    (is (= [] (findings 'metabase.app-db.connection
                        "(system/mutable-component-handle :metabase.app-db.connection/application-db)")))))

(deftest foreign-key-test
  (testing "any other key is reported"
    (doseq [src ["(system/mutable-component-handle :metabase.task.impl/quartz-scheduler)"
                 "(system/mutable-component-handle ::task/quartz-scheduler)"
                 "(system/mutable-component-handle :application-db)"
                 "(system/mutable-component-handle some-key)"
                 "(system/mutable-component-handle)"]]
      (testing src
        (is (= [:metabase/component-handle-own-key]
               (findings 'metabase.app-db.connection src)))))))
