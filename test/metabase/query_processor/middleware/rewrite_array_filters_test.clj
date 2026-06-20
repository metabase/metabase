(ns metabase.query-processor.middleware.rewrite-array-filters-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.rewrite-array-filters :as rewrite-array-filters]))

(def ^:private postgres-metadata-provider
  (meta/updated-metadata-provider assoc :engine :postgres))

(defn- array-field-metadata []
  (assoc (meta/field-metadata :venues :name)
         :base-type :type/Array
         :effective-type :type/Array
         :database-type "_text"
         :array-element-type :type/Text))

(deftest ^:parallel rewrite-equality-array-filters-test
  (let [query (-> (lib/query postgres-metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/= (array-field-metadata) "foo")))
        rewritten (rewrite-array-filters/rewrite-array-filters query)
        filter-clause (first (lib/filters rewritten))]
    (is (= :array-contains (first filter-clause)))
    (is (= "foo" (nth filter-clause 3)))))

(deftest ^:parallel rewrite-negated-array-filters-test
  (let [query (-> (lib/query postgres-metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/!= (array-field-metadata) "foo")))
        rewritten (rewrite-array-filters/rewrite-array-filters query)
        filter-clause (first (lib/filters rewritten))]
    (is (= :not (first filter-clause)))
    (is (= :array-contains (first (nth filter-clause 2))))))

(deftest ^:parallel rewrite-scalar-filters-test
  (let [query (-> (lib/query postgres-metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :name) "foo")))]
    (is (= query (rewrite-array-filters/rewrite-array-filters query)))))
