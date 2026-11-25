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

(driver/register! ::bad-shape, :parent :h2)

(defmethod driver/database-supports? [::bad-shape :table-random-sample]
  [driver _feature _database]
  (= driver ::bad-shape))

(defmethod driver/table-random-sample ::bad-shape
  [driver _table _fields _rff _opts]
  (swap! better-calls conj {:driver driver})
  {:method :block :runs 7.5 :result []})

(driver/register! ::erroring, :parent :h2)

(defmethod driver/database-supports? [::erroring :table-random-sample]
  [driver _feature _database]
  (= driver ::erroring))

(defmethod driver/table-random-sample ::erroring
  [_driver _table _fields _rff _opts]
  (throw (AssertionError. "a bug, not a failed sample")))

(driver/register! ::empty-better, :parent :h2)

(defmethod driver/database-supports? [::empty-better :table-random-sample]
  [driver _feature _database]
  (= driver ::empty-better))

(defmethod driver/table-random-sample ::empty-better
  [_driver _table _fields rff _opts]
  (let [rf (rff nil)]
    {:method :block :result (rf (rf))}))

;; A driver that declines the better sample for every table, and leaves the first rows to sync.
(driver/register! ::declining, :parent :h2)

(defmethod driver/database-supports? [::declining :table-random-sample]
  [driver _feature _database]
  (= driver ::declining))

(defmethod driver/table-random-sample ::declining
  [driver _table _fields _rff _opts]
  (swap! better-calls conj {:driver driver})
  {:method :first-rows})

;; A parent that declares the flag for its children too, which the rules say not to do.
(driver/register! ::flag-for-all, :parent :h2)

(defmethod driver/database-supports? [::flag-for-all :table-random-sample]
  [_driver _feature _database]
  true)

(defmethod driver/table-random-sample ::flag-for-all
  [driver _table _fields _rff _opts]
  (swap! better-calls conj {:driver driver})
  {:method :block :result []})

(driver/register! ::flag-for-all-child, :parent ::flag-for-all)

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

(deftest a-child-without-its-own-method-keeps-table-rows-sample-test
  (mt/test-driver :h2
    (testing "a child gets no better sample from its parent's method, even when the parent declares the flag for it"
      (is (= [:unspecified :unspecified] (sample-with-driver ::flag-for-all-child :row-count 1000000)))
      (is (= [] @better-calls)))))

(deftest a-wrong-or-fatal-better-sample-test
  (mt/test-driver :h2
    (testing "a better sample of the wrong shape gives the first rows, and is not tried again in the run"
      (is (= [:unspecified :unspecified] (sample-with-driver ::bad-shape :row-count 1000000)))
      (is (= 1 (count @better-calls))))
    (testing "an Error is not a failed sample: it fails the step"
      (is (thrown-with-msg? AssertionError #"a bug"
                            (sample-with-driver ::erroring :row-count 1000000))))))

(deftest an-empty-better-sample-falls-back-to-first-rows-test
  (mt/test-driver :h2
    (testing "a better sample with no rows gives no fingerprints, so the step reads the first rows instead"
      (mt/with-temp-copy-of-db
        (t2/update! :model/Database :id (mt/id) {:engine ::empty-better})
        (t2/update! :model/Table :id (mt/id :venues) {:estimated_row_count 1000000})
        (binding [sync.fingerprint/*refingerprint?* true]
          (sync.fingerprint/fingerprint-table! (t2/select-one :model/Table :id (mt/id :venues))))
        (is (=? {:fingerprint        {:global {:distinct-count pos-int?}}
                 :fingerprint_origin {:method :unspecified}}
                (t2/select-one [:model/Field :fingerprint :fingerprint_origin] :id (mt/id :venues :name))))))))

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

(deftest a-driver-can-decline-the-better-sample-test
  (mt/test-driver :h2
    (testing "a driver that returns {:method :first-rows} with no result leaves the first rows to sync"
      (testing "sync reads them, records :first-rows, and asks the driver again for the next table"
        (is (= [:first-rows :first-rows] (sample-with-driver ::declining :row-count 1000000)))
        (is (= 2 (count @better-calls)))))))
