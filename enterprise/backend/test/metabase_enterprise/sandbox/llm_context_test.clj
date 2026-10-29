(ns metabase-enterprise.sandbox.llm-context-test
  "Tests that native query source extraction respects column-level sandboxing."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.sandbox.llm-context-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.llm.context :as llm.context]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- column-restricting-query
  "A GTAP query that restricts `:categories` to only its `:id` column, so the resulting sandbox
   card's result_metadata -- and therefore sandbox-restricted-fields -- excludes every other column."
  []
  (mt/mbql-query categories
    {:fields [$id]}))

(deftest get-tables-with-columns-omits-sandbox-restricted-source-columns-test
  (testing "column-level sandbox restrictions apply to a requested table even when native access is regranted"
    (met/with-gtaps! {:gtaps {:categories {:query (column-restricting-query)}}}
      (perms/set-table-permission! &group (mt/id :categories) :perms/create-queries :query-builder-and-native)
      (is (= #{"ID"}
             (into #{} (map :name)
                   (-> (llm.context/get-tables-with-columns (mt/id) #{(mt/id :categories)})
                       first
                       :columns)))))))

(deftest get-tables-with-columns-fk-target-sandbox-restricted-field-omitted-test
  (testing "an FK target field hidden by column-level sandboxing is not named in the FK target"
    (met/with-gtaps! {:gtaps {:categories {:query (column-restricting-query)}}}
      (perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :query-builder-and-native)
      (mt/with-temp-vals-in-db :model/Field (mt/id :venues :category_id) {:fk_target_field_id (mt/id :categories :name)}
        (let [category-id-col (->> (llm.context/get-tables-with-columns (mt/id) #{(mt/id :venues)})
                                   first
                                   :columns
                                   (some #(when (= "CATEGORY_ID" (:name %)) %)))]
          (is (some? category-id-col))
          (is (not (contains? category-id-col :fk_target))))))))
