(ns metabase.sync.analyze.table-rows-sample-contract-test
  "The surface that a driver's override of [[driver/table-rows-sample]] relies on. A third-party driver can override
  the method in the two ways the built-in drivers do: through the shared helper, as Mongo does, or with its own
  reduction, as BigQuery does. These tests fail if sync stops calling the override, changes its arguments, reads the
  metadata map the driver gives to `rff`, or wraps what the reduction returns.

  The test drivers derive from `:h2` and declare no new sample feature. That is the case of a third-party driver that
  only overrides `table-rows-sample`: it must keep getting its own override. Do not give them a new sample feature."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private calls
  "The arguments of each call to the overrides below."
  (atom []))

(defn- record-call!
  [driver table fields opts]
  (swap! calls conj {:driver driver :table table :fields fields :opts opts}))

(driver/register! ::override-through-helper, :parent :h2)

;; The Mongo way: the shared helper, inside a metadata provider, with options of its own (a limit and an order)
;; merged with the ones sync gives.
(defmethod driver/table-rows-sample ::override-through-helper
  [driver table fields rff opts]
  (record-call! driver table fields opts)
  (driver-api/with-metadata-provider (:db_id table)
    (let [id-column (driver-api/field (driver-api/metadata-provider)
                                      (some #(when (= "ID" (:name %)) (:id %))
                                            (driver-api/fields (driver-api/metadata-provider) (:id table))))]
      (table-rows-sample/table-rows-sample table fields rff (merge {:limit    table-rows-sample/nested-field-sample-limit
                                                                    :order-by [(driver-api/order-by-clause id-column :desc)]}
                                                                   opts)))))

(def ^:private query-contexts
  "The `:context` of each query the query processor runs during a fingerprint step."
  (atom []))

(driver/register! ::override-with-own-reduction, :parent :h2)

(def ^:private own-row-count
  "How many rows the override below returns, all with the same values."
  2)

(defn- own-value
  "The value the override below returns for `field`."
  [{base-type :base_type}]
  (if (isa? base-type :type/Number) 7 "abcd"))

;; The BigQuery way: rows read without the query processor, reduced with what `rff` returns for a metadata map that
;; is not the query processor's. Some overrides give nil.
(defmethod driver/table-rows-sample ::override-with-own-reduction
  [driver table fields rff opts]
  (record-call! driver table fields opts)
  (let [rf  (rff nil)
        row (mapv own-value fields)]
    (transduce identity rf (repeat own-row-count row))))

(defn- fingerprint-with-driver!
  "Fingerprint the `venues` Fields of a copy of test-data whose engine is `driver`, from no fingerprint, returning the
  stats of the step, the Table, and the fingerprints it saved for `venues.name` and `venues.price`."
  [driver]
  (reset! calls [])
  (reset! query-contexts [])
  (mt/with-temp-copy-of-db
    (t2/update! :model/Database :id (mt/id) {:engine driver})
    (t2/update! :model/Field :table_id (mt/id :venues) {:fingerprint nil :fingerprint_version 0 :last_analyzed nil})
    (let [table   (t2/select-one :model/Table :id (mt/id :venues))
          execute qp.pipeline/*execute*
          ;; the JDBC layer streams a query that has the `:table-rows-sample` context
          stats   (binding [qp.pipeline/*execute* (fn [driver query rff]
                                                    (swap! query-contexts conj (get-in query [:info :context]))
                                                    (execute driver query rff))]
                    (sync.fingerprint/fingerprint-table! table))]
      {:stats             stats
       :table             table
       :name-fingerprint  (t2/select-one-fn :fingerprint :model/Field :id (mt/id :venues :name))
       :price-fingerprint (t2/select-one-fn :fingerprint :model/Field :id (mt/id :venues :price))})))

(deftest sync-calls-the-override-with-the-same-arguments-test
  (mt/test-driver :h2
    (doseq [driver [::override-through-helper ::override-with-own-reduction]]
      (testing (str driver)
        (let [{:keys [table stats]} (fingerprint-with-driver! driver)
              [call :as all]        @calls]
          (testing "sync calls the override once for the table"
            (is (= 1 (count all)))
            (is (= driver (:driver call))))
          (testing "with the Table as a Table instance, with what overrides read from it"
            (is (t2/instance-of? :model/Table (:table call)))
            (is (= (:id table) (:id (:table call))))
            (is (every? #(contains? (:table call) %) [:db_id :schema :name])))
          (testing "with the Fields that need a fingerprint, as Field instances"
            (is (seq (:fields call)))
            (is (every? #(t2/instance-of? :model/Field %) (:fields call)))
            (is (every? #(contains? % :database_position) (:fields call)))
            (is (= (:fingerprints-attempted stats) (count (:fields call)))))
          (testing "and with no option but the truncation size"
            (is (= #{:truncation-size} (set (keys (:opts call)))))
            (is (pos-int? (get-in call [:opts :truncation-size])))))))))

(deftest sync-ignores-the-metadata-map-and-uses-what-the-reduction-returns-test
  (mt/test-driver :h2
    (testing "an override that gives `rff` no metadata map and its own rows still gets its Fields fingerprinted"
      (let [{:keys [stats name-fingerprint price-fingerprint]} (fingerprint-with-driver! ::override-with-own-reduction)]
        (is (pos? (:updated-fingerprints stats)))
        (is (zero? (:failed-fingerprints stats)))
        (testing "from exactly the rows it returned, each value under its own Field"
          (is (= {:distinct-count 1, :nil% 0.0} (:global name-fingerprint)))
          (is (= 4.0 (get-in name-fingerprint [:type :type/Text :average-length])))
          (is (= 7.0 (get-in price-fingerprint [:type :type/Number :min])))
          (is (= 7.0 (get-in price-fingerprint [:type :type/Number :max]))))))
    (testing "an override through the shared helper reads the table"
      (let [{:keys [stats name-fingerprint]} (fingerprint-with-driver! ::override-through-helper)]
        (is (pos? (:updated-fingerprints stats)))
        (is (< 1 (get-in name-fingerprint [:global :distinct-count])))
        (testing "with a query that has the `:table-rows-sample` context"
          (is (= [:table-rows-sample] @query-contexts)))))))

(deftest ^:parallel shared-helper-surface-test
  (testing "the vars that overrides read stay where they are"
    (is (pos-int? table-rows-sample/max-sample-rows))
    (is (pos-int? table-rows-sample/nested-field-sample-limit)))
  (mt/test-driver :h2
    (testing "the helper takes a table, fields and `rff`, with `:limit` as an option"
      (let [table  (t2/select-one :model/Table :id (mt/id :venues))
            fields [(t2/select-one :model/Field :id (mt/id :venues :name))]]
        (is (= 3 (count (table-rows-sample/table-rows-sample table fields (constantly conj) {:limit 3}))))
        (is (= 100 (count (table-rows-sample/table-rows-sample table fields (constantly conj)))))))))
