(ns metabase.query-processor.middleware.row-restricted-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.row-restricted-metadata :as row-restricted-metadata]))

(def ^:private metadata
  {:cols [{:name "PRICE", :fingerprint {:global {:distinct-count 4}, :type {:type/Number {:min 1.0, :max 4.0}}}}
          {:name "NAME", :fingerprint {:global {:distinct-count 100}}}
          {:name "count"}]})

(def ^:private stripped-metadata
  {:cols [{:name "PRICE"} {:name "NAME"} {:name "count"}]})

(defn- venues-query
  "An MBQL 5 query, the shape post-processing receives."
  []
  (lib/query meta/metadata-provider (meta/table-metadata :venues)))

(defn- strip
  "Run `metadata` through the middleware for `query`, returning what the next rff receives."
  [query]
  ((row-restricted-metadata/strip-row-restricted-fingerprints query identity) metadata))

(deftest ^:parallel unrestricted-query-keeps-fingerprints-test
  (testing "with no row restriction in force the cols are passed through untouched"
    (is (= metadata (strip (venues-query))))))

(deftest ^:parallel sandboxed-query-loses-fingerprints-test
  (testing "a sandboxed-table marker on a stage strips the fingerprint from every col, not only its table's (BOT-2115)"
    (is (= stripped-metadata
           (strip (assoc-in (venues-query) [:stages 0 :query-permissions/sandboxed-table] (meta/id :venues))))))
  (testing "including a marker on the stage of a join, where it sits once a sandboxed joined table is inlined"
    (let [query (lib/join (venues-query)
                          (lib/join-clause (meta/table-metadata :categories)
                                           [(lib/= (meta/field-metadata :venues :category-id)
                                                   (meta/field-metadata :categories :id))]))]
      (is (= metadata (strip query)))
      (is (= stripped-metadata
             (strip (assoc-in query [:stages 0 :joins 0 :stages 0 :query-permissions/sandboxed-table]
                              (meta/id :categories)))))))
  (testing "including a marker on an inner stage, where it sits once a sandboxed source table is wrapped"
    (is (= stripped-metadata
           (strip (-> (venues-query)
                      lib/append-stage
                      (assoc-in [:stages 0 :query-permissions/sandboxed-table] (meta/id :venues))))))))

(deftest ^:parallel impersonated-query-loses-fingerprints-test
  (testing "a connection-impersonation role on the query strips the fingerprint from every col (BOT-2115)"
    (is (= stripped-metadata
           (strip (assoc (venues-query) :impersonation/role "restricted_role"))))))

(deftest ^:parallel db-routed-query-loses-fingerprints-test
  (testing "a destination database on the query strips the fingerprint from every col (BOT-2115)"
    (is (= stripped-metadata
           (strip (assoc (venues-query) :destination-database/id 2))))))
