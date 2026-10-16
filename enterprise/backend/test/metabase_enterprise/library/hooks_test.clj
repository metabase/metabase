(ns metabase-enterprise.library.hooks-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.library.hooks :as library.hooks]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- library-collection-types
  []
  (set (t2/select-fn-set :type :model/Collection :type [:in (vec collection/library-collection-types)])))

(deftest hooks-create-library-test
  (doseq [hook [library.hooks/after-startup library.hooks/after-premium-token-update]]
    (testing "With the library feature, the hooks create the Library and its system collections"
      (mt/with-premium-features #{:library}
        (mt/with-discard-model-updates! [:model/Collection]
          (without-library
           (hook)
           (is (= #{collection/library-collection-type
                    collection/library-data-collection-type
                    collection/library-metrics-collection-type
                    collection/library-dashboards-collection-type}
                  (library-collection-types)))))))
    (testing "Without the library feature, the hooks create nothing"
      (mt/with-premium-features #{}
        (mt/with-discard-model-updates! [:model/Collection]
          (without-library
           (hook)
           (is (empty? (library-collection-types)))))))))
