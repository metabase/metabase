(ns metabase.sync.analyze.table-rows-sample-contract-test
  "The surface that a driver's override of [[driver/table-rows-sample]] relies on. A third-party driver can override
  the method in the two ways the built-in drivers do: through the shared helper, as Mongo does, or with its own
  reduction, as BigQuery does. These tests fail if sync stops calling the override, changes its arguments, reads the
  metadata map the driver gives to `rff`, or wraps what the reduction returns."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private calls
  "The arguments of each call to the overrides below."
  (atom []))

(driver/register! ::override-through-helper, :parent :h2)

;; The Mongo way: the shared helper, with options of its own merged with the ones sync gives.
(defmethod driver/table-rows-sample ::override-through-helper
  [driver table fields rff opts]
  (swap! calls conj {:driver driver :table-id (:id table) :field-ids (mapv :id fields) :opts opts})
  (table-rows-sample/table-rows-sample table fields rff (merge {:limit table-rows-sample/nested-field-sample-limit}
                                                               opts)))

(driver/register! ::override-with-own-reduction, :parent :h2)

(def ^:private own-rows
  "The rows the override below returns: two rows of the same values, in the order of `fields`."
  2)

;; The BigQuery way: rows read without the query processor, reduced with what `rff` returns for a metadata map that
;; is not the query processor's.
(defmethod driver/table-rows-sample ::override-with-own-reduction
  [driver table fields rff opts]
  (swap! calls conj {:driver driver :table-id (:id table) :field-ids (mapv :id fields) :opts opts})
  (let [rf  (rff {:cols fields})
        row (mapv (fn [{base-type :base_type}]
                    (if (isa? base-type :type/Number) 1 "x"))
                  fields)]
    (transduce identity rf (repeat own-rows row))))

(defn- fingerprint-with-driver!
  "Fingerprint the `venues` Fields of a copy of test-data whose engine is `driver`, returning the stats of the step
  and the fingerprint it saved for `venues.name`."
  [driver]
  (reset! calls [])
  (mt/with-temp-copy-of-db
    (t2/update! :model/Database :id (mt/id) {:engine driver})
    (let [table (t2/select-one :model/Table :id (mt/id :venues))
          stats (binding [sync.fingerprint/*refingerprint?* true]
                  (sync.fingerprint/fingerprint-table! table))]
      {:stats        stats
       :table-id     (:id table)
       :name-fingerprint (t2/select-one-fn :fingerprint :model/Field :id (mt/id :venues :name))})))

(deftest sync-calls-the-override-with-the-same-arguments-test
  (mt/test-driver :h2
    (doseq [driver [::override-through-helper ::override-with-own-reduction]]
      (testing (str driver)
        (let [{:keys [table-id stats]} (fingerprint-with-driver! driver)
              [call :as all]           @calls]
          (testing "sync calls the override once for the table"
            (is (= 1 (count all)))
            (is (= driver (:driver call)))
            (is (= table-id (:table-id call))))
          (testing "with the Fields that need a fingerprint"
            (is (seq (:field-ids call)))
            (is (= (:fingerprints-attempted stats) (count (:field-ids call)))))
          (testing "and with no option but the truncation size"
            (is (= {:truncation-size 1234} (:opts call)))))))))

(deftest sync-ignores-the-metadata-map-and-uses-what-the-reduction-returns-test
  (mt/test-driver :h2
    (testing "an override that gives `rff` its own metadata map and its own rows still gets its Fields fingerprinted"
      (let [{:keys [stats name-fingerprint]} (fingerprint-with-driver! ::override-with-own-reduction)]
        (is (pos? (:updated-fingerprints stats)))
        (is (zero? (:failed-fingerprints stats)))
        (testing "from exactly the rows it returned"
          (is (= {:distinct-count 1, :nil% 0.0}
                 (:global name-fingerprint))))))
    (testing "an override through the shared helper reads the table"
      (let [{:keys [stats name-fingerprint]} (fingerprint-with-driver! ::override-through-helper)]
        (is (pos? (:updated-fingerprints stats)))
        (is (< 1 (get-in name-fingerprint [:global :distinct-count])))))))

(deftest shared-helper-surface-test
  (testing "the helper and the vars that overrides use stay where they are"
    (is (= 10000 table-rows-sample/max-sample-rows))
    (is (= 500 table-rows-sample/nested-field-sample-limit))
    (is (fn? table-rows-sample/table-rows-sample)))
  (mt/test-driver :h2
    (testing "the helper takes `:limit` and marks its query with the `:table-rows-sample` context"
      (let [table  (t2/select-one :model/Table :id (mt/id :venues))
            fields [(t2/select-one :model/Field :id (mt/id :venues :name))]
            rows   (table-rows-sample/table-rows-sample table fields (constantly conj) {:limit 3})]
        (is (= 3 (count rows)))
        (is (= :table-rows-sample
               (get-in (let [mp (mt/metadata-provider)]
                         (#'table-rows-sample/table-rows-sample-query
                          mp
                          (lib.metadata/table mp (mt/id :venues))
                          [(lib.metadata/field mp (mt/id :venues :name))]
                          {:limit 3}))
                       [:info :context])))))))
