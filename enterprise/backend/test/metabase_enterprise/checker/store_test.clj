(ns metabase-enterprise.checker.store-test
  "Tests for the checker store — ID registry, index queries, entity loading/caching."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.store :as store]
   [metabase-enterprise.checker.test-helpers :as helpers]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Test data
;;; ===========================================================================

(def ^:private test-entities
  {:databases {"DB" {:name "DB" :engine "h2"}}
   :tables    {["DB" "PUBLIC" "ORDERS"]   {:name "ORDERS" :schema "PUBLIC"}
               ["DB" "PUBLIC" "PRODUCTS"] {:name "PRODUCTS" :schema "PUBLIC"}}
   :fields    {["DB" "PUBLIC" "ORDERS" "ID"]         {:name "ID" :base_type "type/BigInteger"}
               ["DB" "PUBLIC" "ORDERS" "TOTAL"]      {:name "TOTAL" :base_type "type/Float"}
               ["DB" "PUBLIC" "PRODUCTS" "ID"]       {:name "ID" :base_type "type/BigInteger"}
               ["DB" "PUBLIC" "PRODUCTS" "CATEGORY"] {:name "CATEGORY" :base_type "type/Text"}}
   :cards     {"card-1" {:name "Card 1" :entity_id "card-1"}}})

(defn- make-test-store []
  (let [[schema assets index] (helpers/make-sources-and-index test-entities)]
    (store/make-store schema assets index)))

;;; ===========================================================================
;;; Index query tests
;;; ===========================================================================

(deftest all-refs-test
  (let [store (make-test-store)]
    (testing "all-refs returns refs for each kind"
      (is (= ["DB"] (store/all-database-names store)))
      (is (= #{"card-1"} (set (store/all-card-ids store))))
      (is (= 2 (count (store/all-table-paths store))))
      (is (= 4 (count (store/all-field-paths store)))))))

(deftest exists?-test
  (let [store (make-test-store)]
    (testing "known refs return true"
      (is (store/exists? store :database "DB"))
      (is (store/exists? store :table ["DB" "PUBLIC" "ORDERS"]))
      (is (store/exists? store :card "card-1")))
    (testing "unknown refs return false"
      (is (not (store/exists? store :database "Nonexistent")))
      (is (not (store/exists? store :table ["DB" "PUBLIC" "MISSING"])))
      (is (not (store/exists? store :card "no-such-card"))))))

(deftest index-kind-of-test
  (let [store (make-test-store)]
    (testing "returns the kind for known entity-ids"
      (is (= :card (store/index-kind-of store "card-1"))))
    (testing "returns nil for unknown entity-ids"
      (is (nil? (store/index-kind-of store "unknown"))))))

(deftest index-kind-of-multi-kind-test
  (testing "index-kind-of distinguishes between kinds"
    (let [empty-entities {:databases {} :tables {} :fields {} :cards {}}
          [schema assets _] (helpers/make-sources-and-index empty-entities)
          index  {:card       {"eid-1" :memory}
                  :dashboard  {"eid-2" :memory}
                  :collection {"eid-3" :memory}
                  :document   {"eid-4" :memory}}
          store  (store/make-store schema assets index)]
      (is (= :card       (store/index-kind-of store "eid-1")))
      (is (= :dashboard  (store/index-kind-of store "eid-2")))
      (is (= :collection (store/index-kind-of store "eid-3")))
      (is (= :document   (store/index-kind-of store "eid-4"))))))

(deftest index-file-test
  (let [store (make-test-store)]
    (testing "returns the file path for known refs"
      (is (= :memory (store/index-file store :database "DB")))
      (is (= :memory (store/index-file store :card "card-1"))))
    (testing "returns nil for unknown refs"
      (is (nil? (store/index-file store :database "Nonexistent"))))))

(deftest fields-for-table-test
  (let [store (make-test-store)]
    (testing "returns field paths for a known table"
      (is (= #{["DB" "PUBLIC" "ORDERS" "ID"]
               ["DB" "PUBLIC" "ORDERS" "TOTAL"]}
             (store/fields-for-table store ["DB" "PUBLIC" "ORDERS"]))))
    (testing "returns field paths for another table"
      (is (= #{["DB" "PUBLIC" "PRODUCTS" "ID"]
               ["DB" "PUBLIC" "PRODUCTS" "CATEGORY"]}
             (store/fields-for-table store ["DB" "PUBLIC" "PRODUCTS"]))))
    (testing "returns nil for unknown table"
      (is (nil? (store/fields-for-table store ["DB" "PUBLIC" "MISSING"]))))))

;;; ===========================================================================
;;; ID registry tests
;;; ===========================================================================

(deftest get-or-assign-returns-stable-ids-test
  (let [store (make-test-store)]
    (testing "first call assigns an ID"
      (let [id (store/get-or-assign! store :database "DB")]
        (is (pos-int? id))))
    (testing "second call returns the same ID"
      (let [id1 (store/get-or-assign! store :database "DB")
            id2 (store/get-or-assign! store :database "DB")]
        (is (= id1 id2))))))

(deftest different-refs-get-different-ids-test
  (let [store (make-test-store)]
    (testing "different refs get different IDs"
      (let [id1 (store/get-or-assign! store :table ["DB" "PUBLIC" "ORDERS"])
            id2 (store/get-or-assign! store :table ["DB" "PUBLIC" "PRODUCTS"])]
        (is (not= id1 id2))))))

(deftest id-ref-roundtrip-test
  (let [store (make-test-store)]
    (testing "id->ref and ref->id are inverses"
      (let [ref ["DB" "PUBLIC" "ORDERS"]
            id  (store/get-or-assign! store :table ref)]
        (is (= ref (store/id->ref store :table id)))
        (is (= id (store/ref->id store :table ref)))))))

(deftest ref->id-returns-nil-before-assignment-test
  (let [store (make-test-store)]
    (testing "ref->id returns nil for unassigned refs"
      (is (nil? (store/ref->id store :table ["DB" "PUBLIC" "ORDERS"]))))
    (testing "id->ref returns nil for unassigned IDs"
      (is (nil? (store/id->ref store :table 999))))))

(deftest ids-are-unique-across-kinds-test
  (let [store (make-test-store)]
    (testing "IDs don't collide across different kinds"
      (let [db-id    (store/get-or-assign! store :database "DB")
            table-id (store/get-or-assign! store :table ["DB" "PUBLIC" "ORDERS"])
            card-id  (store/get-or-assign! store :card "card-1")]
        (is (= 3 (count (distinct [db-id table-id card-id]))))))))

;;; ===========================================================================
;;; Entity loading and caching tests
;;; ===========================================================================

(deftest load-database-test
  (let [store (make-test-store)]
    (testing "load-database! returns data with assigned :id"
      (let [data (store/load-database! store "DB")]
        (is (some? data))
        (is (= "DB" (:name data)))
        (is (= "h2" (:engine data)))
        (is (pos-int? (:id data)))))
    (testing "load-database! returns nil for unknown database"
      (is (nil? (store/load-database! store "Nonexistent"))))))

(deftest load-table-test
  (let [store (make-test-store)]
    (testing "load-table! returns data with :id and :db_id"
      (let [data (store/load-table! store ["DB" "PUBLIC" "ORDERS"])]
        (is (some? data))
        (is (= "ORDERS" (:name data)))
        (is (pos-int? (:id data)))
        (is (pos-int? (:db_id data)))))
    (testing "load-table! returns nil for unknown table"
      (is (nil? (store/load-table! store ["DB" "PUBLIC" "MISSING"]))))))

(deftest load-field-test
  (let [store (make-test-store)]
    (testing "load-field! returns data with :id and :table_id"
      (let [data (store/load-field! store ["DB" "PUBLIC" "ORDERS" "ID"])]
        (is (some? data))
        (is (= "ID" (:name data)))
        (is (pos-int? (:id data)))
        (is (pos-int? (:table_id data)))))
    (testing "load-field! returns nil for unknown field"
      (is (nil? (store/load-field! store ["DB" "PUBLIC" "ORDERS" "MISSING"]))))))

(deftest load-card-test
  (let [store (make-test-store)]
    (testing "load-card! returns data with assigned :id"
      (let [data (store/load-card! store "card-1")]
        (is (some? data))
        (is (= "Card 1" (:name data)))
        (is (pos-int? (:id data)))))
    (testing "load-card! returns nil for unknown card"
      (is (nil? (store/load-card! store "nonexistent"))))))

(deftest caching-returns-same-object-test
  (let [store (make-test-store)]
    (testing "loading the same entity twice returns the cached version"
      (let [first-load  (store/load-database! store "DB")
            second-load (store/load-database! store "DB")]
        (is (identical? first-load second-load))))))

(deftest cached-entity-test
  (let [store (make-test-store)]
    (testing "cached-entity returns nil before loading"
      (is (nil? (store/cached-entity store :database "DB"))))
    (testing "cached-entity returns data after loading"
      (store/load-database! store "DB")
      (is (some? (store/cached-entity store :database "DB"))))))

(deftest load-table-assigns-database-id-test
  (let [store (make-test-store)]
    (testing "loading a table also assigns an ID to its database"
      (store/load-table! store ["DB" "PUBLIC" "ORDERS"])
      (is (some? (store/ref->id store :database "DB"))
          "Database should have an assigned ID after loading a table"))))

(deftest load-field-assigns-table-id-test
  (let [store (make-test-store)]
    (testing "loading a field also assigns an ID to its table"
      (store/load-field! store ["DB" "PUBLIC" "ORDERS" "ID"])
      (is (some? (store/ref->id store :table ["DB" "PUBLIC" "ORDERS"]))
          "Table should have an assigned ID after loading a field"))))
