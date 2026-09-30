(ns hooks.metabase.app-db.schema-migrations-test.impl-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.app-db.schema-migrations-test.impl]))

(defn- finding-types!
  [ns-symb]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/validate-mb-app-db-migrations-test {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.metabase.app-db.schema-migrations-test.impl/test-migrations!
     {:ns   ns-symb
      :node (hooks/parse-string (pr-str '(impl/test-migrations ["v64.2026-09-01T00:00:00"] [migrate!] (migrate!))))})
    (mapv :type @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:synchronized require-app-db-migrations-test-tag-test
  (testing "a namespace that runs migration tests must be tagged, so CI shards it with the other migration tests"
    (is (= [:metabase/validate-mb-app-db-migrations-test]
           (finding-types! 'metabase.some-migrations-test))))
  (testing "a tagged namespace is fine"
    (is (= []
           (finding-types! (with-meta 'metabase.some-migrations-test {:mb/app-db-migrations-test true}))))))
