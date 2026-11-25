(ns ^:mb/driver-tests metabase.sync.analyze.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.db :as analyze.db]
   [metabase.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.app-db.core :as app-db]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.analyze.test-util :as analyze.tu]
   [metabase.sync.interface :as i]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   [com.mchange.v2.resourcepool CannotAcquireResourceException]
   [java.net ConnectException]
   [java.sql SQLException SQLTimeoutException]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   TESTS FOR WHICH FIELDS NEED FINGERPRINTING                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that our `base-types->descendants` function properly returns a set of descendants including parent type
(deftest ^:parallel base-type->descendats-test
  (is (= #{"type/URL" "type/ImageURL" "type/AvatarURL"}
         (#'analyze.db/base-types->descendants #{:type/URL})))
  (is (= #{"type/ImageURL" "type/AvatarURL"}
         (#'analyze.db/base-types->descendants #{:type/ImageURL :type/AvatarURL}))))

(def ^:private skip-fingerprint-base-types
  (into #{"type/*"
          "type/Structured"
          "type/SerializedJSON"
          "type/JSON"
          "type/Dictionary"
          "type/Array"
          "type/Collection"
          "type/XML"
          "type/fingerprint-unsupported"}
        (comp (mapcat descendants)
              (map u/qualified-name))
        [:type/Collection
         :type/Structured
         :type/Large
         :type/fingerprint-unsupported]))

(deftest ^:parallel needs-fingerprint-update-clause-test
  (testing (str "Make sure we generate the correct HoneySQL WHERE clause based on whatever `version->base-types` "
                "is passed in")
    (is (= [:and
            [:= :active true]
            [:or
             [:not (app-db/isa :semantic_type :type/PK)]
             [:= :semantic_type nil]]
            [:not-in :visibility_type ["retired" "sensitive"]]
            [:not-in :base_type skip-fingerprint-base-types]
            [:or
             [:and
              [:< :fingerprint_version 1]
              [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]
           (#'analyze.db/needs-fingerprint-update-clause false {1 #{:type/URL}})))))

(deftest ^:parallel needs-fingerprint-update-clause-test-2
  (is (= [:and
          [:= :active true]
          [:or
           [:not (app-db/isa :semantic_type :type/PK)]
           [:= :semantic_type nil]]
          [:not-in :visibility_type ["retired" "sensitive"]]
          [:not-in :base_type skip-fingerprint-base-types]
          [:or
           [:and
            [:< :fingerprint_version 2]
            [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Currency" "type/Float"
                              "type/Share" "type/Income" "type/Price" "type/Discount" "type/GrossMargin" "type/Cost" "type/Percentage"}]]
           [:and
            [:< :fingerprint_version 1]
            [:in :base_type #{"type/ImageURL" "type/AvatarURL"}]]]]
         (#'analyze.db/needs-fingerprint-update-clause false {1 #{:type/ImageURL :type/AvatarURL}
                                                              2 #{:type/Float}}))))

(deftest ^:parallel needs-fingerprint-update-clause-test-3
  (testing "our SQL generation code is clever enough to remove version checks when a newer version completely eclipses them"
    (is (= [:and
            [:= :active true]
            [:or
             [:not (app-db/isa :semantic_type :type/PK)]
             [:= :semantic_type nil]]
            [:not-in :visibility_type ["retired" "sensitive"]]
            [:not-in :base_type skip-fingerprint-base-types]
            [:or
             [:and
              [:< :fingerprint_version 2]
              [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Currency" "type/Float"
                                "type/Share" "type/Income" "type/Price" "type/Discount" "type/GrossMargin" "type/Cost" "type/Percentage"}]]
             ;; no type/Float stuff should be included for 1
             [:and
              [:< :fingerprint_version 1]
              [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]
           (#'analyze.db/needs-fingerprint-update-clause false {1 #{:type/Float :type/URL}
                                                                2 #{:type/Float}})))))

(deftest ^:parallel needs-fingerprint-update-clause-test-4
  (testing "our SQL generation code is also clever enough to completely skip completely eclipsed versions"
    (is (= [:and
            [:= :active true]
            [:or
             [:not (app-db/isa :semantic_type :type/PK)]
             [:= :semantic_type nil]]
            [:not-in :visibility_type ["retired" "sensitive"]]
            [:not-in :base_type skip-fingerprint-base-types]
            [:or
             [:and
              [:< :fingerprint_version 4]
              [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Currency" "type/Float"
                                "type/Share" "type/Income" "type/Price" "type/Discount" "type/GrossMargin" "type/Cost" "type/Percentage"}]]
             [:and
              [:< :fingerprint_version 3]
              [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]
             ;; version 2 can be eliminated completely since everything relevant there is included in 4
             ;; The only things that should go in 1 should be `:type/City` since `:type/Coordinate` is included in 4
             [:and
              [:< :fingerprint_version 1]
              [:in :base_type #{"type/City"}]]]]
           (#'analyze.db/needs-fingerprint-update-clause false {1 #{:type/Coordinate :type/City}
                                                                2 #{:type/Coordinate}
                                                                3 #{:type/URL}
                                                                4 #{:type/Float}})))))

(deftest ^:parallel needs-fingerprint-update-clause-test-5
  (testing "when refingerprinting doesn't check for versions"
    (is (= [:and
            [:= :active true]
            [:or
             [:not (app-db/isa :semantic_type :type/PK)]
             [:= :semantic_type nil]]
            [:not-in :visibility_type ["retired" "sensitive"]]
            [:not-in :base_type skip-fingerprint-base-types]]
           (#'analyze.db/needs-fingerprint-update-clause true {1 #{:type/URL}})))))

;; Make sure that the above functions are used correctly to determine which Fields get (re-)fingerprinted
(defn- field-was-fingerprinted?! [fingerprint-versions field-properties]
  (let [fingerprinted? (atom false)]
    (binding [i/*fingerprint-version->types-that-should-be-re-fingerprinted* fingerprint-versions]
      (mt/with-dynamic-fn-redefs [qp/process-query              (fn process-query
                                                                  [_query rff]
                                                                  (transduce identity (rff :metadata) [[1] [2] [3] [4] [5]]))
                                  sync.fingerprint/save-fingerprints! (fn [rows _]
                                                                        (when (some :fingerprint rows)
                                                                          (reset! fingerprinted? true)))]
        (mt/with-temp [:model/Table table {}
                       :model/Field _     (assoc field-properties :table_id (u/the-id table))]
          [(sync.fingerprint/fingerprint-table! table)
           @fingerprinted?])))))

(def ^:private default-stat-map
  {:no-data-fingerprints 0, :failed-fingerprints 0, :updated-fingerprints 0, :fingerprints-attempted 0})

(def ^:private one-updated-map
  (merge default-stat-map {:updated-fingerprints 1, :fingerprints-attempted 1}))

(deftest fingerprint-table!-limits-fields-per-table-test
  (testing "fingerprints up to fingerprint-max-fields-per-table fields and skips the rest (avoids OOM on very wide tables)"
    (let [saved (atom 0)]
      (binding [i/*fingerprint-version->types-that-should-be-re-fingerprinted* {2 #{:type/Float}}]
        (mt/with-dynamic-fn-redefs [qp/process-query                   (fn [_query rff]
                                                                         (transduce identity (rff :metadata) [[1 1] [2 2] [3 3] [4 4] [5 5]]))
                                    sync.fingerprint/save-fingerprints! (fn [rows _] (swap! saved + (count (filter :fingerprint rows))))]
          (mt/with-temp [:model/Table table {}
                         :model/Field _ {:table_id (u/the-id table) :base_type :type/Decimal :fingerprint_version 1 :active true}
                         :model/Field _ {:table_id (u/the-id table) :base_type :type/Decimal :fingerprint_version 1 :active true}]
            (testing "limit of 1 -> only the first eligible field is fingerprinted, the rest skipped"
              (reset! saved 0)
              (mt/with-temporary-setting-values [fingerprint-max-fields-per-table 1]
                (sync.fingerprint/fingerprint-table! table)
                (is (= 1 @saved))))
            (testing "limit above the field count -> all eligible fields are fingerprinted"
              (reset! saved 0)
              (mt/with-temporary-setting-values [fingerprint-max-fields-per-table 10000]
                (sync.fingerprint/fingerprint-table! table)
                (is (= 2 @saved))))))))))

(deftest  fingerprint-table!-test
  (testing "field is a substype of newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-table!-test-2
  (testing "field is a substype of newer fingerprint version, but it is a subtype of :type/Structured"
    (doseq [base-type (descendants :type/Structured)]
      (is (= [default-stat-map false]
             (field-was-fingerprinted?!
              {2 #{:type/Structured}}
              {:base_type base-type, :fingerprint_version 1}))))))

(deftest fingerprint-table!-test-3
  (testing "field is *not* a subtype of newer fingerprint version"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {2 #{:type/Text}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-table!-test-4
  (testing "Field is a subtype of one of several types for newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float :type/Text}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-table!-test-5
  (testing "Field has same version as latest fingerprint version"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {1 #{:type/Float}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-table!-test-6
  (testing "field has newer version than latest fingerprint version (should never happen)"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {1 #{:type/Float}}
            {:base_type :type/Decimal, :fingerprint_version 2})))))

(deftest fingerprint-table!-test-7
  (testing "field has same exact type as newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float}}
            {:base_type :type/Float, :fingerprint_version 1})))))

(deftest fingerprint-table!-test-8
  (testing "field is parent type of newer fingerprint version type"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {2 #{:type/Decimal}}
            {:base_type :type/Float, :fingerprint_version 1})))))

(deftest fingerprint-table!-test-9
  (testing "several new fingerprint versions exist"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float}
             3 #{:type/Text}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-table!-test-10
  (is (= [one-updated-map true]
         (field-was-fingerprinted?!
          {2 #{:type/Text}
           3 #{:type/Float}}
          {:base_type :type/Decimal, :fingerprint_version 1}))))

(deftest fingerprint-table!-test-11
  (testing "field is sensitive"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {1 #{:type/Text}}
            {:base_type :type/Text, :fingerprint_version 1, :visibility_type :sensitive})))))

(deftest fingerprint-table!-test-12
  (testing "field is refingerprinted"
    (testing "not fingerprinted because fingerprint version is up to date"
      (is (= [default-stat-map false]
             (field-was-fingerprinted?!
              {1 #{:type/Text}}
              {:base_type :type/Text, :fingerprint_version 1}))))))

(deftest fingerprint-table!-test-13
  (testing "field is refingerprinted"
    (testing "not fingerprinted because fingerprint version is up to date"
      (is (= [default-stat-map false]
             (field-was-fingerprinted?!
              {1 #{:type/Text}}
              {:base_type :type/Text, :fingerprint_version 1}))))))

(deftest fingerprint-fields!-test
  (testing "the `fingerprint!` function is correctly updating the correct columns of Field"
    (mt/with-temp [:model/Field field {:base_type           :type/Integer
                                       :table_id            (data/id :venues)
                                       :fingerprint         nil
                                       :fingerprint_version 1
                                       :last_analyzed       #t "2017-08-09T00:00:00"}]
      (binding [i/*latest-fingerprint-version* 3]
        ;; fingerprinters/fingerprinter is a multimethod, so we can't use with-dynamic-fn-redefs
        (with-redefs [qp/process-query             (fn [_query rff]
                                                     (transduce identity (rff :metadata) [[1] [2] [3] [4] [5]]))
                      fingerprinters/fingerprinter (constantly (fingerprinters/constant-fingerprinter {:global {:distinct-count 5, :nil% 0.0}}))]
          (is (= {:no-data-fingerprints   0
                  :failed-fingerprints    0
                  :updated-fingerprints   1
                  :fingerprints-attempted 1}
                 (#'sync.fingerprint/fingerprint-fields! (t2/select-one :model/Table :id (data/id :venues)) [field])))
          (is (= {:fingerprint         {:global {:distinct-count 5, :nil% 0.0}}
                  :fingerprint_version 3
                  :last_analyzed       nil}
                 (into {} (t2/select-one [:model/Field :fingerprint :fingerprint_version :last_analyzed] :id (u/the-id field))))))))))

(deftest fingerprint-failure-test
  (testing "if fingerprinting fails, the exception should be caught and included in the stats map"
    (mt/test-drivers (mt/normal-drivers)
      (let [mock-ex (Exception. "expected")]
        (with-redefs [sync.fingerprint/sample-fingerprints (fn [_ _] (throw mock-ex))
                      sync.fingerprint/*refingerprint?* true]
          (is (= (assoc (sync.fingerprint/empty-stats-map 0)
                        :throwable mock-ex)
                 (sync.fingerprint/fingerprint-table! (t2/select-one :model/Table :id (data/id :venues))))))))))

(deftest fingerprint-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Fingerprints should actually get saved with the correct values"
      (testing "Text fingerprints"
        (sync.fingerprint/fingerprint-table! (t2/select-one :model/Table :id (data/id :venues)))
        (is (=? {:global {:distinct-count 100
                          :nil%           0.0}
                 :type   {:type/Text {:percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :average-length #(< 15 % 16)
                                      :percent-state  0.0}}}
                (t2/select-one-fn :fingerprint :model/Field :id (mt/id :venues :name))))))))

(deftest fingerprinting-test
  (testing "fingerprinting truncates text fields (see #13288)"
    (doseq [size [4 8 10]]
      (let [table (t2/select-one :model/Table :id (mt/id :categories))
            field (t2/select-one :model/Field :id (mt/id :categories :name))]
        (binding [sync.fingerprint/*truncation-size* size]
          (is (=? {:updated-fingerprints 1}
                  (#'sync.fingerprint/fingerprint-fields! table [field])))
          (let [field' (t2/select-one [:model/Field :fingerprint] :id (u/id field))
                fingerprinted-size (get-in field' [:fingerprint :type :type/Text :average-length])]
            (is fingerprinted-size)
            (is (<= fingerprinted-size size))))))))

(deftest refingerprint-fields-for-db!-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "refingerprints up to a limit"
      (with-redefs [sync.fingerprint/save-fingerprints! (constantly nil)
                    sync.fingerprint/max-refingerprint-field-count 31] ;; prime number so we don't have exact matches
        (let [results (sync.fingerprint/refingerprint-fields-for-db!
                       (lib.metadata/database (mt/metadata-provider))
                       (constantly nil))
              attempted (:fingerprints-attempted results)]
          ;; it can exceed the max field count as our resolution is after each table check it.
          (is (<= @#'sync.fingerprint/max-refingerprint-field-count attempted))
          (is (<= attempted
                  ;; but it is bounded! it's less than the max fingerprint count PLUS the number of fields in the
                  ;; biggest table in (mt/db).
                  (+ @#'sync.fingerprint/max-refingerprint-field-count
                     (:count (t2/query-one {:select [[:%count.* :count]]
                                            :from :metabase_field
                                            :join [[:metabase_table :table] [:= :table.id :table_id]]
                                            :where [:= :table.db_id (mt/id)]
                                            :group-by [:table_id]
                                            :order-by [[:count :desc]]
                                            :limit 1}))))))))))

(defn- fingerprint-version-after-failure!
  "Create a fresh text Field at fingerprint_version 0 (eligible for fingerprinting up to version 5), run
  `fingerprint-table!` with the sample/fingerprint step failing as configured, and return the Field's
  `fingerprint_version` afterwards. A version of 0 means the Field will be re-selected and retried on the next
  sync; a version of 5 (the bound latest) means fingerprinting gave up and will not retry."
  [redefs]
  (mt/with-temp [:model/Table table {:db_id (mt/id)}
                 :model/Field field {:table_id            (u/the-id table)
                                     :active              true
                                     :base_type           :type/Text
                                     :fingerprint         nil
                                     :fingerprint_version 0}]
    (binding [i/*latest-fingerprint-version*                                 5
              i/*fingerprint-version->types-that-should-be-re-fingerprinted* {5 #{:type/Text}}]
      (with-redefs-fn redefs
        (fn [] (sync.fingerprint/fingerprint-table! table))))
    (t2/select-one-fn :fingerprint_version :model/Field :id (u/the-id field))))

(defn- table-error-redefs
  "Sampling query throws `ex` — exercises the whole-table failure path in `fingerprint-table!`."
  [ex]
  {#'qp/process-query (fn [& _] (throw ex))})

(def ^:private field-error-redefs
  "Query returns rows but each Field's fingerprinter yields a Throwable — exercises the per-field failure path in
  `sample-fingerprints`."
  {#'qp/process-query             (fn [_query rff] (transduce identity (rff :metadata) [["a"] ["b"]]))
   #'fingerprinters/fingerprinter (constantly (fingerprinters/constant-fingerprinter (ex-info "fingerprinter boom" {})))})

(deftest retry-loop-on-failed-fingerprint-test
  (testing "GHY-3695: a Field whose fingerprint reliably fails must not be re-attempted on every sync"
    (testing "transient connection errors leave fingerprint_version untouched so the next sync retries"
      (is (= 0 (fingerprint-version-after-failure! (table-error-redefs (ConnectException. "connection refused")))))
      (is (= 0 (fingerprint-version-after-failure! (table-error-redefs (CannotAcquireResourceException. "pool exhausted"))))))
    (testing "query timeouts give up — a slow view stays slow, retrying just leaks another long query (GHY-3266)"
      (is (= 5 (fingerprint-version-after-failure! (table-error-redefs (SQLTimeoutException. "query timed out"))))))
    (testing "other query errors (permission denied, bad SQL, unsupported type) give up"
      (is (= 5 (fingerprint-version-after-failure! (table-error-redefs (SQLException. "permission denied"))))))
    (testing "per-field fingerprinter errors (unsupported coercion/dispatch) give up"
      (is (= 5 (fingerprint-version-after-failure! field-error-redefs))))))

(deftest abandon-failed-fingerprint-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "fingerprinting stops after the first table if we can't connect to the db"
      (let [tables-fingerprinted (atom 0)]
        (with-redefs [sync.fingerprint/sample-fingerprints (fn [_table _fields]
                                                             (swap! tables-fingerprinted inc)
                                                             (throw (CannotAcquireResourceException. "Unable to acquire resource")))
                      sync.fingerprint/*refingerprint?* true]
          (is (= (assoc (sync.fingerprint/empty-stats-map 0)
                        :failed-fingerprints 1)
                 (sync.fingerprint/fingerprint-fields-for-db! (lib.metadata/database (mt/metadata-provider)) (constantly nil))))
          (is (= 1 @tables-fingerprinted)))))))

(def ^:private stub-fingerprint
  {:global {:distinct-count 2, :nil% 0.0}})

(defn- stub-sample-fingerprints
  "Fingerprints of `fields` as [[sync.fingerprint/sample-fingerprints]] gives them, each the same, with no warehouse
  query."
  [_table fields]
  {:rows  (mapv #(assoc (sync.fingerprint/incomplete-analysis-kvs) :id (:id %) :fingerprint stub-fingerprint) fields)
   :stats (assoc (sync.fingerprint/empty-stats-map (count fields)) :updated-fingerprints (count fields))})

(defn- fingerprint-db!
  [database]
  (sync.fingerprint/fingerprint-fields-for-db! database (constantly nil)))

(deftest fingerprint-statement-count-test
  (mt/test-driver :h2
    (mt/with-dynamic-fn-redefs [sync.fingerprint/sample-fingerprints stub-sample-fingerprints]
      (testing "fingerprinting issues as many statements for 16 Tables as for 4"
        (testing "on first analysis"
          (let [[small large] (analyze.tu/statement-counts-by-tables (constantly {:fingerprint_version 0}) (constantly nil) fingerprint-db!)]
            (is (= small large))))
        (testing "when nothing needs fingerprinting"
          (let [[small large] (analyze.tu/statement-counts-by-tables (constantly {:fingerprint_version 0}) fingerprint-db! fingerprint-db!)]
            (is (= small large))))))))

(deftest fingerprint-save-failure-is-isolated-per-table-test
  (mt/test-driver :h2
    (testing "when saving the fingerprints of one Table fails, those of the other Tables are saved"
      (mt/with-temp [:model/Database db      {:engine :h2}
                     :model/Table    good    {:db_id (u/the-id db) :name "GOOD"}
                     :model/Table    bad     {:db_id (u/the-id db) :name "BAD"}
                     :model/Field    good-fd {:table_id (u/the-id good) :base_type :type/Text :fingerprint_version 0}
                     :model/Field    bad-fd  {:table_id (u/the-id bad) :base_type :type/Text :fingerprint_version 0}]
        (let [save! (mt/original-fn #'sync.fingerprint/save-fingerprints!)]
          (mt/with-dynamic-fn-redefs [sync.fingerprint/sample-fingerprints stub-sample-fingerprints
                                      sync.fingerprint/save-fingerprints!  (fn [rows fields]
                                                                             (when (some #(and (= (:id %) (u/the-id bad-fd)) (:fingerprint %)) rows)
                                                                               (throw (ex-info "save failed" {})))
                                                                             (save! rows fields))]
            (is (= {:no-data-fingerprints 0, :failed-fingerprints 1, :updated-fingerprints 1, :fingerprints-attempted 1}
                   (fingerprint-db! (driver.u/lib-database (u/the-id db)))))
            (is (= stub-fingerprint (t2/select-one-fn :fingerprint :model/Field :id (u/the-id good-fd))))
            (testing "and the Fields of the failed Table are not retried on every sync"
              (is (=? {:fingerprint         nil
                       :fingerprint_version i/*latest-fingerprint-version*}
                      (t2/select-one [:model/Field :fingerprint :fingerprint_version] :id (u/the-id bad-fd)))))))))))

(deftest fingerprint-save-error-is-not-retried-per-table-test
  (mt/test-driver :h2
    (testing "an Error of saving the fingerprints of all Tables is thrown without saving those of each Table"
      (mt/with-temp [:model/Database db      {:engine :h2}
                     :model/Table    table-1 {:db_id (u/the-id db) :name "T1"}
                     :model/Table    table-2 {:db_id (u/the-id db) :name "T2"}
                     :model/Field    _       {:table_id (u/the-id table-1) :base_type :type/Text :fingerprint_version 0}
                     :model/Field    _       {:table_id (u/the-id table-2) :base_type :type/Text :fingerprint_version 0}]
        (let [saves (atom 0)]
          (mt/with-dynamic-fn-redefs [sync.fingerprint/sample-fingerprints stub-sample-fingerprints
                                      sync.fingerprint/save-fingerprints!  (fn [_rows _fields]
                                                                             (swap! saves inc)
                                                                             (throw (StackOverflowError.)))]
            (is (thrown? StackOverflowError
                         (fingerprint-db! (driver.u/lib-database (u/the-id db))))))
          (is (= 1 @saves)))))))

(deftest fingerprint-records-its-origin-test
  (testing "each fingerprint sync saves records where it came from"
    (mt/with-temp-copy-of-db
      (t2/update! :model/Table :id (mt/id :venues) {:estimated_row_count 100})
      (mt/with-clock #t "2026-01-02T03:04:05Z"
        (binding [sync.fingerprint/*refingerprint?* true]
          (sync.fingerprint/fingerprint-table! (t2/select-one :model/Table :id (mt/id :venues)))))
      (let [origin (t2/select-one-fn :fingerprint_origin :model/Field :id (mt/id :venues :name))]
        (testing "a sample read with table-rows-sample, whose method sync cannot know"
          (is (=? {:source :sample, :method :unspecified} origin)))
        (testing "with the row count estimate of the table at that time"
          (is (= 100 (:row-count origin))))
        (testing "and the time, in UTC"
          (is (= "2026-01-02T03:04:05Z" (:collected-at origin))))))))

(deftest grown-table-ids-test
  (testing "a Table counts as grown when its estimate is at least twice the row count recorded with its fingerprints"
    (mt/with-temp [:model/Database db   {}
                   :model/Table    grew {:db_id (:id db) :estimated_row_count 250}
                   :model/Table    same {:db_id (:id db) :estimated_row_count 150}
                   :model/Table    none {:db_id (:id db) :estimated_row_count 250}
                   :model/Table    gone {:db_id (:id db) :estimated_row_count nil}
                   :model/Field    _    {:table_id (:id grew) :fingerprint_origin {:source :sample :row-count 100}}
                   :model/Field    _    {:table_id (:id grew) :fingerprint_origin {:source :sample :row-count 200}}
                   :model/Field    _    {:table_id (:id same) :fingerprint_origin {:source :sample :row-count 100}}
                   :model/Field    _    {:table_id (:id none) :fingerprint_origin {:source :sample :row-count nil}}
                   :model/Field    _    {:table_id (:id gone) :fingerprint_origin {:source :sample :row-count 100}}]
      (is (= #{(:id grew)}
             (analyze.db/grown-table-ids (mapv :id [grew same none gone]) 2))))))

(deftest grown-table-is-fingerprinted-again-test
  (testing "a Table that grew a lot since its fingerprints gets new ones, with its new row count in their origin"
    (mt/with-temp-copy-of-db
      (t2/update! :model/Table :id (mt/id :venues) {:estimated_row_count 100})
      (binding [sync.fingerprint/*refingerprint?* true]
        (sync.fingerprint/fingerprint-table! (t2/select-one :model/Table :id (mt/id :venues))))
      (let [table #(t2/select-one :model/Table :id (mt/id :venues))
            fp!   #(sync.fingerprint/fingerprint-table! (table))]
        (testing "no new fingerprints while the table has grown less than twice"
          (t2/update! :model/Table :id (mt/id :venues) {:estimated_row_count 150})
          (is (zero? (:updated-fingerprints (fp!)))))
        (testing "new fingerprints once it has grown twice"
          (t2/update! :model/Table :id (mt/id :venues) {:estimated_row_count 200})
          (is (pos? (:updated-fingerprints (fp!))))
          (is (= 200 (:row-count (t2/select-one-fn :fingerprint_origin :model/Field :id (mt/id :venues :name))))))
        (testing "and not again until it doubles from there"
          (t2/update! :model/Table :id (mt/id :venues) {:estimated_row_count 300})
          (is (zero? (:updated-fingerprints (fp!)))))))))
