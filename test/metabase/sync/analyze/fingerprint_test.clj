(ns metabase.sync.analyze.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.db.query :as mdb.query]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.sync.analyze.fingerprint :as sync.fingerprint]
   [metabase.sync.interface :as i]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   TESTS FOR WHICH FIELDS NEED FINGERPRINTING                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that our `base-types->descendants` function properly returns a set of descendants including parent type
(deftest ^:parallel base-type->descendats-test
  (is (= #{"type/URL" "type/ImageURL" "type/AvatarURL"}
         (#'sync.fingerprint/base-types->descendants #{:type/URL})))
  (is (= #{"type/ImageURL" "type/AvatarURL"}
         (#'sync.fingerprint/base-types->descendants #{:type/ImageURL :type/AvatarURL}))))

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

(deftest ^:parallel honeysql-for-fields-that-need-fingerprint-updating-test
  (testing (str "Make sure we generate the correct HoneySQL WHERE clause based on whatever is in "
                "`*fingerprint-version->types-that-should-be-re-fingerprinted*`")
    (is (= {:where
            [:and
             [:= :active true]
             [:or
              [:not (mdb.query/isa :semantic_type :type/PK)]
              [:= :semantic_type nil]]
             [:not-in :visibility_type ["retired" "sensitive"]]
             [:not-in :base_type skip-fingerprint-base-types]
             [:or
              [:and
               [:< :fingerprint_version 1]
               [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]}
           (binding [i/*fingerprint-version->types-that-should-be-re-fingerprinted* {1 #{:type/URL}}]
             (#'sync.fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))))

(deftest ^:parallel honeysql-for-fields-that-need-fingerprint-updating-test-2
  (is (= {:where
          [:and
           [:= :active true]
           [:or
            [:not (mdb.query/isa :semantic_type :type/PK)]
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
             [:in :base_type #{"type/ImageURL" "type/AvatarURL"}]]]]}
         (binding [i/*fingerprint-version->types-that-should-be-re-fingerprinted* {1 #{:type/ImageURL :type/AvatarURL}
                                                                                   2 #{:type/Float}}]
           (#'sync.fingerprint/honeysql-for-fields-that-need-fingerprint-updating)))))

(deftest ^:parallel honeysql-for-fields-that-need-fingerprint-updating-test-3
  (testing "our SQL generation code is clever enough to remove version checks when a newer version completely eclipses them"
    (is (= {:where
            [:and
             [:= :active true]
             [:or
              [:not (mdb.query/isa :semantic_type :type/PK)]
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
               [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]}
           (binding [i/*fingerprint-version->types-that-should-be-re-fingerprinted* {1 #{:type/Float :type/URL}
                                                                                     2 #{:type/Float}}]
             (#'sync.fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))))

(deftest ^:parallel honeysql-for-fields-that-need-fingerprint-updating-test-4
  (testing "our SQL generation code is also clever enough to completely skip completely eclipsed versions"
    (is (= {:where
            [:and
             [:= :active true]
             [:or
              [:not (mdb.query/isa :semantic_type :type/PK)]
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
               [:in :base_type #{"type/City"}]]]]}
           (binding [i/*fingerprint-version->types-that-should-be-re-fingerprinted* {1 #{:type/Coordinate :type/City}
                                                                                     2 #{:type/Coordinate}
                                                                                     3 #{:type/URL}
                                                                                     4 #{:type/Float}}]
             (#'sync.fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))))

(deftest ^:parallel honeysql-for-fields-that-need-fingerprint-updating-test-5
  (testing "when refingerprinting doesn't check for versions"
    (is (= {:where [:and
                    [:= :active true]
                    [:or
                     [:not (mdb.query/isa :semantic_type :type/PK)]
                     [:= :semantic_type nil]]
                    [:not-in :visibility_type ["retired" "sensitive"]]
                    [:not-in :base_type skip-fingerprint-base-types]]}
           (binding [sync.fingerprint/*refingerprint?* true]
             (#'sync.fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))))


;; Make sure that the above functions are used correctly to determine which Fields get (re-)fingerprinted
(defn- field-was-fingerprinted?! [fingerprint-versions field-properties]
  (let [fingerprinted? (atom false)]
    (binding [i/*fingerprint-version->types-that-should-be-re-fingerprinted* fingerprint-versions]
      (with-redefs [qp/process-query              (fn process-query
                                                    [_query rff]
                                                    (transduce identity (rff :metadata) [[1] [2] [3] [4] [5]]))
                    sync.fingerprint/save-fingerprint! (fn [& _] (reset! fingerprinted? true))]
        (t2.with-temp/with-temp [Table table {}
                                 Field _     (assoc field-properties :table_id (u/the-id table))]
          [(sync.fingerprint/fingerprint-fields! table)
           @fingerprinted?])))))

(def ^:private default-stat-map
  {:no-data-fingerprints 0, :failed-fingerprints 0, :updated-fingerprints 0, :fingerprints-attempted 0})

(def ^:private one-updated-map
  (merge default-stat-map {:updated-fingerprints 1, :fingerprints-attempted 1}))

(deftest  fingerprint-fields!-test
  (testing "field is a substype of newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-fields!-test-2
  (testing "field is a substype of newer fingerprint version, but it is a subtype of :type/Structured"
    (doseq [base-type (descendants :type/Structured)]
      (is (= [default-stat-map false]
             (field-was-fingerprinted?!
              {2 #{:type/Structured}}
              {:base_type base-type, :fingerprint_version 1}))))))

(deftest fingerprint-fields!-test-3
  (testing "field is *not* a subtype of newer fingerprint version"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {2 #{:type/Text}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-fields!-test-4
  (testing "Field is a subtype of one of several types for newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float :type/Text}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-fields!-test-5
  (testing "Field has same version as latest fingerprint version"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {1 #{:type/Float}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-fields!-test-6
  (testing "field has newer version than latest fingerprint version (should never happen)"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {1 #{:type/Float}}
            {:base_type :type/Decimal, :fingerprint_version 2})))))

(deftest fingerprint-fields!-test-7
  (testing "field has same exact type as newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float}}
            {:base_type :type/Float, :fingerprint_version 1})))))

(deftest fingerprint-fields!-test-8
  (testing "field is parent type of newer fingerprint version type"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {2 #{:type/Decimal}}
            {:base_type :type/Float, :fingerprint_version 1})))))

(deftest fingerprint-fields!-test-9
  (testing "several new fingerprint versions exist"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?!
            {2 #{:type/Float}
             3 #{:type/Text}}
            {:base_type :type/Decimal, :fingerprint_version 1})))))

(deftest fingerprint-fields!-test-10
  (is (= [one-updated-map true]
         (field-was-fingerprinted?!
          {2 #{:type/Text}
           3 #{:type/Float}}
          {:base_type :type/Decimal, :fingerprint_version 1}))))

(deftest fingerprint-fields!-test-11
  (testing "field is sensitive"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?!
            {1 #{:type/Text}}
            {:base_type :type/Text, :fingerprint_version 1, :visibility_type :sensitive})))))

(deftest fingerprint-fields!-test-12
  (testing "field is refingerprinted"
    (testing "not fingerprinted because fingerprint version is up to date"
      (is (= [default-stat-map false]
             (field-was-fingerprinted?!
              {1 #{:type/Text}}
              {:base_type :type/Text, :fingerprint_version 1}))))))

(deftest fingerprint-fields!-test-13
  (testing "field is refingerprinted"
    (testing "not fingerprinted because fingerprint version is up to date"
      (is (= [default-stat-map false]
             (field-was-fingerprinted?!
              {1 #{:type/Text}}
              {:base_type :type/Text, :fingerprint_version 1}))))))

(deftest fingerprint-table!-test
  (testing "the `fingerprint!` function is correctly updating the correct columns of Field"
    (t2.with-temp/with-temp [Field field {:base_type           :type/Integer
                                          :table_id            (data/id :venues)
                                          :fingerprint         nil
                                          :fingerprint_version 1
                                          :last_analyzed       #t "2017-08-09T00:00:00"}]
     (binding [i/*latest-fingerprint-version* 3]
       (with-redefs [qp/process-query             (fn [_query rff]
                                                    (transduce identity (rff :metadata) [[1] [2] [3] [4] [5]]))
                     fingerprinters/fingerprinter (constantly (fingerprinters/constant-fingerprinter {:experimental {:fake-fingerprint? true}}))]
         (is (= {:no-data-fingerprints   0
                 :failed-fingerprints    0
                 :updated-fingerprints   1
                 :fingerprints-attempted 1}
                (#'sync.fingerprint/fingerprint-table! (t2/select-one Table :id (data/id :venues)) [field])))
         (is (= {:fingerprint         {:experimental {:fake-fingerprint? true}}
                 :fingerprint_version 3
                 :last_analyzed       nil}
                (into {} (t2/select-one [Field :fingerprint :fingerprint_version :last_analyzed] :id (u/the-id field))))))))))

(deftest test-fingerprint-failure
  (testing "if fingerprinting fails, the exception should not propagate"
    (with-redefs [sync.fingerprint/fingerprint-table! (fn [_ _] (throw (Exception. "expected")))]
      (is (= (sync.fingerprint/empty-stats-map 0)
             (sync.fingerprint/fingerprint-fields! (t2/select-one Table :id (data/id :venues))))))))

(deftest fingerprint-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Fingerprints should actually get saved with the correct values"
      (testing "Text fingerprints"
        (sync.fingerprint/fingerprint-fields! (t2/select-one Table :id (data/id :venues)))
        (is (=? {:global {:distinct-count 100
                          :nil%           0.0}
                 :type   {:type/Text {:percent-json   0.0
                                      :percent-url    0.0
                                      :percent-email  0.0
                                      :average-length #(< 15 % 16)
                                      :percent-state  0.0}}}
                (t2/select-one-fn :fingerprint Field :id (mt/id :venues :name))))))))

(deftest fingerprinting-test
  (testing "fingerprinting truncates text fields (see #13288)"
    (doseq [size [4 8 10]]
      (let [table (t2/select-one Table :id (mt/id :categories))
            field (t2/select-one Field :id (mt/id :categories :name))]
        (binding [sync.fingerprint/*truncation-size* size]
          (is (=? {:updated-fingerprints 1}
                  (#'sync.fingerprint/fingerprint-table! table [field])))
          (let [field' (t2/select-one [Field :fingerprint] :id (u/id field))
                fingerprinted-size (get-in field' [:fingerprint :type :type/Text :average-length])]
            (is fingerprinted-size)
            (is (<= fingerprinted-size size))))))))

(deftest refingerprint-fields-for-db!-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "refingerprints up to a limit"
      (with-redefs [sync.fingerprint/save-fingerprint! (constantly nil)
                    sync.fingerprint/max-refingerprint-field-count 31] ;; prime number so we don't have exact matches
        (let [results (sync.fingerprint/refingerprint-fields-for-db!
                       (mt/db)
                       (constantly nil))
              attempted (:fingerprints-attempted results)]
          ;; it can exceed the max field count as our resolution is after each table check it.
          (is (<= @#'sync.fingerprint/max-refingerprint-field-count attempted))
          ;; but it is bounded.
          (is (< attempted (+ @#'sync.fingerprint/max-refingerprint-field-count 10))))))))
