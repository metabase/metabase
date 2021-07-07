(ns metabase.sync.analyze.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require [clojure.test :refer :all]
            [metabase.db.util :as mdb.u]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.sync.analyze.fingerprint :as fingerprint]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
            [metabase.sync.interface :as i]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   TESTS FOR WHICH FIELDS NEED FINGERPRINTING                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that our `base-types->descendants` function properly returns a set of descendants including parent type
(deftest base-type->descendats-test
  (is (= #{"type/URL" "type/ImageURL" "type/AvatarURL"}
         (#'fingerprint/base-types->descendants #{:type/URL})))
  (is (= #{"type/ImageURL" "type/AvatarURL"}
         (#'fingerprint/base-types->descendants #{:type/ImageURL :type/AvatarURL}))))


;; Make sure we generate the correct HoneySQL WHERE clause based on whatever is in
;; `fingerprint-version->types-that-should-be-re-fingerprinted`
(deftest honeysql-for-fields-that-need-fingerprint-updating-test
  (is (= {:where
          [:and
           [:= :active true]
           [:or
            [:not (mdb.u/isa :semantic_type :type/PK)]
            [:= :semantic_type nil]]
           [:not-in :visibility_type ["retired" "sensitive"]]
           [:not= :base_type "type/Structured"]
           [:or
            [:and
             [:< :fingerprint_version 1]
             [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]}
         (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted {1 #{:type/URL}}]
           (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))

  (is (= {:where
          [:and
           [:= :active true]
           [:or
            [:not (mdb.u/isa :semantic_type :type/PK)]
            [:= :semantic_type nil]]
           [:not-in :visibility_type ["retired" "sensitive"]]
           [:not= :base_type "type/Structured"]
           [:or
            [:and
             [:< :fingerprint_version 2]
             [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Currency" "type/Float"
                               "type/Share" "type/Income" "type/Price" "type/Discount" "type/GrossMargin" "type/Cost"}]]
            [:and
             [:< :fingerprint_version 1]
             [:in :base_type #{"type/ImageURL" "type/AvatarURL"}]]]]}
         (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted {1 #{:type/ImageURL :type/AvatarURL}
                                                                                     2 #{:type/Float}}]
           (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))
  (testing "our SQL generation code is clever enough to remove version checks when a newer version completely eclipses them"
    (is (= {:where
            [:and
             [:= :active true]
             [:or
              [:not (mdb.u/isa :semantic_type :type/PK)]
              [:= :semantic_type nil]]
             [:not-in :visibility_type ["retired" "sensitive"]]
             [:not= :base_type "type/Structured"]
             [:or
              [:and
               [:< :fingerprint_version 2]
               [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Currency" "type/Float"
                                 "type/Share" "type/Income" "type/Price" "type/Discount" "type/GrossMargin" "type/Cost"}]]
              ;; no type/Float stuff should be included for 1
              [:and
               [:< :fingerprint_version 1]
               [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]}
           (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted {1 #{:type/Float :type/URL}
                                                                                       2 #{:type/Float}}]
             (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating)))))
  (testing "our SQL generation code is also clever enough to completely skip completely eclipsed versions"
    (is (= {:where
            [:and
             [:= :active true]
             [:or
              [:not (mdb.u/isa :semantic_type :type/PK)]
              [:= :semantic_type nil]]
             [:not-in :visibility_type ["retired" "sensitive"]]
             [:not= :base_type "type/Structured"]
             [:or
              [:and
               [:< :fingerprint_version 4]
               [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Currency" "type/Float"
                                 "type/Share" "type/Income" "type/Price" "type/Discount" "type/GrossMargin" "type/Cost"}]]
              [:and
               [:< :fingerprint_version 3]
               [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]
              ;; version 2 can be eliminated completely since everything relevant there is included in 4
              ;; The only things that should go in 1 should be `:type/City` since `:type/Coordinate` is included in 4
              [:and
               [:< :fingerprint_version 1]
               [:in :base_type #{"type/City"}]]]]}
           (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted {1 #{:type/Coordinate :type/City}
                                                                                       2 #{:type/Coordinate}
                                                                                       3 #{:type/URL}
                                                                                       4 #{:type/Float}}]
             (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating)))))
  (testing "when refingerprinting doesn't check for versions"
    (is (= {:where [:and
                    [:= :active true]
                    [:or
                     [:not (mdb.u/isa :semantic_type :type/PK)]
                     [:= :semantic_type nil]]
                    [:not-in :visibility_type ["retired" "sensitive"]]
                    [:not= :base_type "type/Structured"]]}
           (binding [fingerprint/*refingerprint?* true]
             (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))))


;; Make sure that the above functions are used correctly to determine which Fields get (re-)fingerprinted
(defn- field-was-fingerprinted? {:style/indent 0} [fingerprint-versions field-properties]
  (let [fingerprinted? (atom false)]
    (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted fingerprint-versions
                  qp/process-query                                             (fn [_ {:keys [rff]}]
                                                                                 (transduce identity (rff :metadata) [[1] [2] [3] [4] [5]]))
                  fingerprint/save-fingerprint!                                (fn [& _] (reset! fingerprinted? true))]
      (tt/with-temp* [Table [table]
                      Field [_ (assoc field-properties :table_id (u/the-id table))]]
        [(fingerprint/fingerprint-fields! table)
         @fingerprinted?]))))

(def ^:private default-stat-map
  {:no-data-fingerprints 0, :failed-fingerprints 0, :updated-fingerprints 0, :fingerprints-attempted 0})

(def ^:private one-updated-map
  (merge default-stat-map {:updated-fingerprints 1, :fingerprints-attempted 1}))

;; Field is a subtype of newer fingerprint version
(deftest fingerprint-fields!-test
  (testing "field is a substype of newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?
             {2 #{:type/Float}}
             {:base_type :type/Decimal, :fingerprint_version 1}))))

  (testing "field is *not* a subtype of newer fingerprint version"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?
             {2 #{:type/Text}}
             {:base_type :type/Decimal, :fingerprint_version 1}))))

  (testing "Field is a subtype of one of several types for newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?
             {2 #{:type/Float :type/Text}}
             {:base_type :type/Decimal, :fingerprint_version 1}))))

  (testing "Field has same version as latest fingerprint version"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?
             {1 #{:type/Float}}
             {:base_type :type/Decimal, :fingerprint_version 1}))))

  (testing "field has newer version than latest fingerprint version (should never happen)"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?
             {1 #{:type/Float}}
             {:base_type :type/Decimal, :fingerprint_version 2}))))

  (testing "field has same exact type as newer fingerprint version"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?
             {2 #{:type/Float}}
             {:base_type :type/Float, :fingerprint_version 1}))))

  (testing "field is parent type of newer fingerprint version type"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?
             {2 #{:type/Decimal}}
             {:base_type :type/Float, :fingerprint_version 1}))))

  (testing "several new fingerprint versions exist"
    (is (= [one-updated-map true]
           (field-was-fingerprinted?
             {2 #{:type/Float}
              3 #{:type/Text}}
             {:base_type :type/Decimal, :fingerprint_version 1}))))

  (is (= [one-updated-map true]
         (field-was-fingerprinted?
           {2 #{:type/Text}
            3 #{:type/Float}}
           {:base_type :type/Decimal, :fingerprint_version 1})))

  (testing "field is sensitive"
    (is (= [default-stat-map false]
           (field-was-fingerprinted?
             {1 #{:type/Text}}
             {:base_type :type/Text, :fingerprint_version 1, :visibility_type :sensitive}))))

  (testing "field is refingerprinted"
    (testing "not fingerprinted because fingerprint version is up to date"
      (is (= [default-stat-map false]
             (field-was-fingerprinted?
               {1 #{:type/Text}}
               {:base_type :type/Text, :fingerprint_version 1}))))
    (testing "is updated when we are refingerprinting"
      (is (= [one-updated-map true]
             (binding [fingerprint/*refingerprint?* true]
               (field-was-fingerprinted?
                 {1 #{:type/Text}}
                 {:base_type :type/Text, :fingerprint_version 1})))))))


(deftest fingerprint-table!-test
  (testing "the `fingerprint!` function is correctly updating the correct columns of Field"
    (tt/with-temp Field [field {:base_type           :type/Integer
                                :table_id            (data/id :venues)
                                :fingerprint         nil
                                :fingerprint_version 1
                                :last_analyzed       #t "2017-08-09T00:00:00"}]
      (with-redefs [i/latest-fingerprint-version       3
                    qp/process-query                   (fn [_ {:keys [rff]}]
                                                         (transduce identity (rff :metadata) [[1] [2] [3] [4] [5]]))
                    fingerprinters/fingerprinter       (constantly (fingerprinters/constant-fingerprinter {:experimental {:fake-fingerprint? true}}))]
        (is (= {:no-data-fingerprints 0, :failed-fingerprints    0,
                :updated-fingerprints 1, :fingerprints-attempted 1}
               (#'fingerprint/fingerprint-table! (Table (data/id :venues)) [field])))
        (is (= {:fingerprint         {:experimental {:fake-fingerprint? true}}
                :fingerprint_version 3
                :last_analyzed       nil}
               (into {} (db/select-one [Field :fingerprint :fingerprint_version :last_analyzed] :id (u/the-id field)))))))))

(deftest test-fingerprint-failure
  (testing "if fingerprinting fails, the exception should not propagate"
    (with-redefs [fingerprint/fingerprint-table! (fn [_ _] (throw (Exception. "expected")))]
      (is (= (fingerprint/empty-stats-map 0)
             (fingerprint/fingerprint-fields! (Table (data/id :venues))))))))

(deftest test-fingerprint-skipped-for-ga
  (testing "Google Analytics doesn't support fingerprinting fields"
    (let [fake-db (-> (data/db)
                      (assoc :engine :googleanalytics))]
      (with-redefs [fingerprint/fingerprint-table! (fn [_] (throw (Exception. "this should not be called!")))]
        (is (= (fingerprint/empty-stats-map 0)
               (fingerprint/fingerprint-fields-for-db! fake-db [(Table (data/id :venues))] (fn [_ _]))))))))

(deftest fingerprint-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Fingerprints should actually get saved with the correct values"
      (testing "Text fingerprints"
        (is (schema= {:global {:distinct-count (s/eq 100)
                               :nil%           (s/eq 0.0)}
                      :type   {:type/Text {:percent-json   (s/eq 0.0)
                                           :percent-url    (s/eq 0.0)
                                           :percent-email  (s/eq 0.0)
                                           :average-length (s/pred #(< 15 % 16) "between 15 and 16")
                                           :percent-state  (s/eq 0.0)}}}
                     (db/select-one-field :fingerprint Field :id (mt/id :venues :name))))))))

(deftest fingerprinting-test
  (testing "fingerprinting truncates text fields (see #13288)"
    (doseq [size [4 8 10]]
      (let [table (Table (mt/id :categories))
            field (Field (mt/id :categories :name))]
        (with-redefs [fingerprint/truncation-size size]
          (#'fingerprint/fingerprint-table! table [field])
          (let [field' (db/select-one [Field :fingerprint] :id (u/id field))
                fingerprinted-size (get-in field' [:fingerprint :type :type/Text :average-length])]
            (is (<= fingerprinted-size size))))))))

(deftest refingerprint-fields-for-db!-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "refingerprints up to a limit"
      (with-redefs [fingerprint/save-fingerprint! (constantly nil)
                    fingerprint/max-refingerprint-field-count 31] ;; prime number so we don't have exact matches
        (let [table (Table (mt/id :checkins))
              results (fingerprint/refingerprint-fields-for-db! (mt/db)
                                                                (repeat (* fingerprint/max-refingerprint-field-count 2) table)
                                                                (constantly nil))
              attempted (:fingerprints-attempted results)]
          ;; it can exceed the max field count as our resolution is after each table check it.
          (is (<= fingerprint/max-refingerprint-field-count attempted))
          ;; but it is bounded.
          (is (< attempted (+ fingerprint/max-refingerprint-field-count 10))))))))

(deftest fingerprint-schema-test
  (testing "allows for extra keywords"
    (let [base {:global
                {:distinct-count 2, :nil% 0.0}}]
      (doseq [path [[:type :type/Text]
                    [:type :type/Number]
                    [:type :type/DateTime]
                    [:global]
                    [:experimental]
                    [:top-level]
                    []]]
        (s/validate i/Fingerprint (assoc-in base (conj path :extra-key) (rand-nth [3 :extra-value 4.0 {:stuff :stuff}])))))))
