(ns metabase-enterprise.mcp.v2.tools.browse-sandbox-test
  "Row-restriction tests for `browse_data`'s `get_fields` action. Fingerprints are computed at sync
   time over every row of the table, so they must not reach a user whose row access is narrowed."
  ;; A gtap `:query` is persisted as a card's legacy `dataset_query`, so building these in Lib would
  ;; only round-trip back through `lib.convert/->legacy-MBQL`.
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.mcp.v2.tools.browse-sandbox-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.mcp.v2.tools.browse :as tools.browse]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- get-fields
  [args]
  (let [text (-> (tools.browse/browse-data args {}) :content first :text)]
    (json/decode+kw (first (str/split-lines text)))))

(defn- field-named
  [envelope field-name]
  (->> (:tables envelope) (mapcat :fields) (filter #(= field-name (:name %))) first))

(deftest ^:synchronized sandboxed-get-fields-withholds-fingerprint-test
  (testing "a row-sandboxed user gets no fingerprint — it is computed over rows they cannot see"
    (met/with-gtaps! {:gtaps      {:venues {:query (mt/mbql-query venues {:filter [:= $price 1]})}}
                      :attributes {}}
      (let [envelope (get-fields {:action          "get_fields"
                                  :table_ids       [(mt/id :venues)]
                                  :response_format "detailed"})
            price    (field-named envelope "PRICE")
            name-col (field-named envelope "NAME")]
        (testing "PRICE — sandbox-narrowed :values survive, the whole-table :fingerprint does not"
          (is (some? price))
          (is (= [[1]] (:values price)))
          (is (nil? (:fingerprint price))))
        (testing "NAME — withheld too, since :global :distinct-count leaks whole-table cardinality"
          (is (some? name-col))
          (is (nil? (:fingerprint name-col))))))))

(deftest ^:synchronized sandboxed-get-fields-withholds-temporal-fingerprint-test
  (testing ":earliest/:latest are literal timestamps from hidden rows"
    (met/with-gtaps! {:gtaps      {:checkins {:query (mt/mbql-query checkins {:filter [:= $venue_id 1]})}}
                      :attributes {}}
      (let [envelope (get-fields {:action          "get_fields"
                                  :table_ids       [(mt/id :checkins)]
                                  :response_format "detailed"})
            date-col (field-named envelope "DATE")]
        (is (some? date-col))
        (is (nil? (:fingerprint date-col)))))))

(deftest ^:synchronized sandboxed-get-fields-withholds-fingerprint-projection-test
  (testing "an explicit `fields` projection cannot route around the withholding"
    (met/with-gtaps! {:gtaps      {:venues {:query (mt/mbql-query venues {:filter [:= $price 1]})}}
                      :attributes {}}
      (let [envelope (get-fields {:action    "get_fields"
                                  :table_ids [(mt/id :venues)]
                                  :fields    ["fields.name" "fields.fingerprint"]})
            price    (field-named envelope "PRICE")]
        (is (some? price))
        (is (nil? (:fingerprint price)))))))

(deftest ^:synchronized unrestricted-get-fields-keeps-fingerprint-test
  (testing "control: a user whose row access is not narrowed still gets the full detailed projection"
    (mt/with-test-user :crowberto
      (let [envelope (get-fields {:action          "get_fields"
                                  :table_ids       [(mt/id :venues) (mt/id :checkins)]
                                  :response_format "detailed"})
            price    (field-named envelope "PRICE")
            date-col (field-named envelope "DATE")]
        (testing "numeric fingerprint statistics are present"
          (is (some? (-> price :fingerprint :type :type/Number :max))))
        (testing "temporal fingerprint statistics are present"
          (is (some? (-> date-col :fingerprint :type :type/DateTime :earliest))))
        (testing "the other detailed keys are untouched"
          (is (some? (:effective_type price)))
          (is (some? (:has_field_values price)))
          (is (some? (:database_type price))))))))
