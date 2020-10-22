(ns metabase.sync.analyze.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require [clojure.test :refer :all]
            [metabase
             [db :as mdb]
             [test :as mt]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [field :as field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.analyze.fingerprint :as fingerprint]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
            [metabase.sync.interface :as i]
            [metabase.test.data :as data]
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
            [:not (mdb/isa :special_type :type/PK)]
            [:= :special_type nil]]
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
            [:not (mdb/isa :special_type :type/PK)]
            [:= :special_type nil]]
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
              [:not (mdb/isa :special_type :type/PK)]
              [:= :special_type nil]]
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
              [:not (mdb/isa :special_type :type/PK)]
              [:= :special_type nil]]
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
             (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating))))))


;; Make sure that the above functions are used correctly to determine which Fields get (re-)fingerprinted
(defn- field-was-fingerprinted? {:style/indent 0} [fingerprint-versions field-properties]
  (let [fingerprinted? (atom false)]
    (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted fingerprint-versions
                  metadata-queries/table-rows-sample                           (constantly [[1] [2] [3] [4] [5]])
                  fingerprint/save-fingerprint!                                (fn [& _] (reset! fingerprinted? true))]
      (tt/with-temp* [Table [table]
                      Field [_ (assoc field-properties :table_id (u/get-id table))]]
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
             {:base_type :type/Text, :fingerprint_version 1, :visibility_type :sensitive})))))


(deftest fingerprint-table!-test
  (testing "the `fingerprint!` function is correctly updating the correct columns of Field"
    (tt/with-temp Field [field {:base_type           :type/Integer
                                :table_id            (data/id :venues)
                                :fingerprint         nil
                                :fingerprint_version 1
                                :last_analyzed       #t "2017-08-09T00:00:00"}]
      (with-redefs [i/latest-fingerprint-version       3
                    metadata-queries/table-rows-sample (constantly [[1] [2] [3] [4] [5]])
                    fingerprinters/fingerprinter       (constantly (fingerprinters/constant-fingerprinter {:experimental {:fake-fingerprint? true}}))]
        (is (= {:no-data-fingerprints 0, :failed-fingerprints    0,
                :updated-fingerprints 1, :fingerprints-attempted 1}
               (#'fingerprint/fingerprint-table! (Table (data/id :venues)) [field])))
        (is (= {:fingerprint         {:experimental {:fake-fingerprint? true}}
                :fingerprint_version 3
                :last_analyzed       nil}
               (into {} (db/select-one [Field :fingerprint :fingerprint_version :last_analyzed] :id (u/get-id field)))))))))

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
