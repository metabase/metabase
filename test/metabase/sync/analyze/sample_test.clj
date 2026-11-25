(ns metabase.sync.analyze.sample-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.analyze.sample :as sample]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private better-calls
  "The drivers whose better sample was asked for."
  (atom []))

(driver/register! ::better, :parent :h2)

(defmethod driver/database-supports? [::better :table-random-sample]
  [driver _feature _database]
  (= driver ::better))

(defmethod driver/table-random-sample ::better
  [driver table fields rff opts]
  (swap! better-calls conj {:driver driver :opts opts})
  {:method   :block
   :runs     7
   :fraction 0.5
   :result   (table-rows-sample/table-rows-sample table fields rff (select-keys opts [:truncation-size]))})

;; A child of a driver with a better sample, which does not declare the feature for itself.
(driver/register! ::better-child, :parent ::better)

(driver/register! ::failing, :parent :h2)

(defmethod driver/database-supports? [::failing :table-random-sample]
  [driver _feature _database]
  (= driver ::failing))

(defmethod driver/table-random-sample ::failing
  [driver _table _fields _rff _opts]
  (swap! better-calls conj {:driver driver})
  (throw (ex-info "no sample for you" {})))

(driver/register! ::slow, :parent :h2)

(defmethod driver/database-supports? [::slow :table-random-sample]
  [driver _feature _database]
  (= driver ::slow))

(defmethod driver/table-random-sample ::slow
  [driver _table _fields _rff _opts]
  (swap! better-calls conj {:driver driver})
  (Thread/sleep 3000)
  {:method :block :result []})

(defn- sample-with-driver
  "Sample `venues` and `checkins` of a copy of test-data whose engine is `driver`, in one sync run, returning the
  `:method` of each sample."
  [driver & {:keys [row-count]}]
  (reset! better-calls [])
  (mt/with-temp-copy-of-db
    (t2/update! :model/Database :id (mt/id) {:engine driver})
    (sample/do-with-better-sample-run
     (fn []
       (mapv (fn [table-key]
               (let [table  (cond-> (t2/select-one :model/Table :id (mt/id table-key))
                              row-count (assoc :estimated_row_count row-count))
                     fields (t2/select :model/Field :table_id (:id table) :active true)]
                 (:method (sample/sample table fields (constantly conj) {:truncation-size 1234}))))
             [:venues :checkins])))))

(deftest a-driver-with-the-feature-gives-the-sample-test
  (mt/test-driver :h2
    (testing "a driver that supports :table-random-sample for itself gives the sample"
      (is (= [:block :block] (sample-with-driver ::better :row-count 1000000)))
      (testing "with the sample size, the row count estimate and the truncation size"
        (is (= {:rows 10000 :row-count 1000000 :truncation-size 1234} (:opts (first @better-calls))))))
    (testing "a table with no more rows than the sample reads its first rows, which are the whole table"
      (is (= [:unspecified :unspecified] (sample-with-driver ::better :row-count 100)))
      (is (= [] @better-calls)))
    (testing "a table with no row count estimate gets the better sample"
      (is (= [:block :block] (sample-with-driver ::better))))))

(deftest drivers-without-the-feature-keep-table-rows-sample-test
  (mt/test-driver :h2
    (testing "a driver without the feature reads with table-rows-sample, as before"
      (is (= [:unspecified :unspecified] (sample-with-driver :h2 :row-count 1000000))))
    (testing "a child of a driver with the feature does not inherit it, and keeps its own table-rows-sample"
      (is (= [:unspecified :unspecified] (sample-with-driver ::better-child :row-count 1000000)))
      (is (= [] @better-calls)))))

(deftest a-failing-better-sample-falls-back-for-the-rest-of-the-run-test
  (mt/test-driver :h2
    (testing "a better sample that throws gives the first rows, and is not tried again in the run"
      (is (= [:unspecified :unspecified] (sample-with-driver ::failing :row-count 1000000)))
      (is (= 1 (count @better-calls))))
    (testing "a better sample that takes too long gives the first rows, and is not tried again in the run"
      (mt/with-temporary-setting-values [fingerprint-sample-timeout-seconds 1]
        (is (= [:unspecified :unspecified] (sample-with-driver ::slow :row-count 1000000)))
        (is (= 1 (count @better-calls)))))))

(deftest fingerprint-records-the-sample-method-test
  (mt/test-driver :h2
    (testing "the fingerprint step stores the method of the sample in the origin of each fingerprint"
      (mt/with-temp-copy-of-db
        (t2/update! :model/Database :id (mt/id) {:engine ::better})
        (t2/update! :model/Table :id (mt/id :venues) {:estimated_row_count 1000000})
        (binding [sync.fingerprint/*refingerprint?* true]
          (sync.fingerprint/fingerprint-table! (t2/select-one :model/Table :id (mt/id :venues))))
        (is (=? {:source :sample :method :block :runs 7 :fraction 0.5 :row-count 1000000}
                (t2/select-one-fn :fingerprint_origin :model/Field :id (mt/id :venues :name))))))))
