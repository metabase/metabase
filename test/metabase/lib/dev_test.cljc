(ns metabase.lib.dev-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.dev :as lib.dev]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(deftest ^:parallel field-test
  (are [x] (fn? x)
    (lib/field "VENUES" "ID")
    (lib/field "ID")
    (lib/field nil "VENUES" "ID")))

(deftest ^:parallel field-from-database-metadata-test
  (let [f (lib/field "VENUES" "ID")]
    (is (fn? f))
    (is (=? [:field (meta/id :venues :id) {:lib/uuid uuid?}]
            (f {:lib/type :mbql/query, :lib/metadata meta/metadata-provider} -1)))))

(deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/stage-column (lib.query/saved-question-query
                                                   meta/metadata-provider
                                                   meta/saved-question)
                                                  "ID")]
    (is (=? {:lib/type :metadata/field
             :name     "ID"}
            field-metadata))
    (is (=? [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]
            (#'lib.field/->field {} -1 field-metadata)))))

(deftest ^:parallel query-for-table-name-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid uuid?}
                       :source-table (meta/id :venues)}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (dissoc :lib/metadata)))))

(deftest ^:parallel ->=-test
  (let [q1                          (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        categories-id-metadata      (lib.metadata/stage-column q2 -1 "ID")
        f (lib.dev/->= venues-category-id-metadata categories-id-metadata)]
    (is (fn? f))
    (is (=? [:=
             {:lib/uuid uuid?}
             [:field (meta/id :venues :category-id) {:lib/uuid uuid?}]
             [:field "ID" {:base-type :type/BigInteger, :lib/uuid uuid?}]]
            (f {:lib/metadata meta/metadata} -1)))))
