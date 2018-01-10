(ns metabase.sync.analyze.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require [expectations :refer :all]
            [metabase.models
             [field :as field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.analyze.fingerprint :as fingerprint]
            [metabase.sync.analyze.fingerprint.sample :as sample]
            [metabase.sync.interface :as i]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- fingerprint [field]
  (let [[[_ sample]] (sample/sample-fields (field/table field) [field])]
    (#'fingerprint/fingerprint field sample)))

;; basic test for a numeric Field
(expect
  {:global {:distinct-count 4}
   :type   {:type/Number {:min 1, :max 4, :avg 2.03}}}
  (fingerprint (Field (data/id :venues :price))))

;; basic test for a Text Field
(expect
  {:global {:distinct-count 100}
   :type   {:type/Text {:percent-json 0.0, :percent-url 0.0, :percent-email 0.0, :average-length 15.63}}}
  (fingerprint (Field (data/id :venues :name))))

;; a non-integer numeric Field
(expect
  {:global {:distinct-count 94}
   :type   {:type/Number {:min 10.0646, :max 40.7794, :avg 35.50589199999998}}}
  (fingerprint (Field (data/id :venues :latitude))))

;; a datetime field
(expect
  {:global {:distinct-count 618}}
  (fingerprint (Field (data/id :checkins :date))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   TESTS FOR WHICH FIELDS NEED FINGERPRINTING                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that our `base-types->descendants` function properly returns a set of descendants including parent type
(expect
  #{"type/URL" "type/ImageURL" "type/AvatarURL"}
  (#'fingerprint/base-types->descendants #{:type/URL}))

(expect
  #{"type/ImageURL" "type/AvatarURL"}
  (#'fingerprint/base-types->descendants #{:type/ImageURL :type/AvatarURL}))


;; Make sure we generate the correct HoneySQL WHERE clause based on whatever is in
;; `fingerprint-version->types-that-should-be-re-fingerprinted`
(expect
  {:where
   [:and
    [:= :active true]
    [:not= :visibility_type "retired"]
    [:or
     [:and
      [:< :fingerprint_version 1]
      [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]}
  (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted {1 #{:type/URL}}]
    (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating)))

(expect
  {:where
   [:and
    [:= :active true]
    [:not= :visibility_type "retired"]
    [:or
     [:and
      [:< :fingerprint_version 2]
      [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Float"}]]
     [:and
      [:< :fingerprint_version 1]
      [:in :base_type #{"type/ImageURL" "type/AvatarURL"}]]]]}
  (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted {1 #{:type/ImageURL :type/AvatarURL}
                                                                              2 #{:type/Float}}]
    (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating)))

;; Make sure that our SQL generation code is clever enough to remove version checks when a newer version completely
;; eclipses them
(expect
  {:where
   [:and
    [:= :active true]
    [:not= :visibility_type "retired"]
    [:or
     [:and
      [:< :fingerprint_version 2]
      [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Float"}]]
     ;; no type/Float stuff should be included for 1
     [:and
      [:< :fingerprint_version 1]
      [:in :base_type #{"type/URL" "type/ImageURL" "type/AvatarURL"}]]]]}
  (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted {1 #{:type/Float :type/URL}
                                                                              2 #{:type/Float}}]
    (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating)))

;; Make sure that our SQL generation code is also clever enough to completely skip completely eclipsed versions
(expect
  {:where
   [:and
    [:= :active true]
    [:not= :visibility_type "retired"]
    [:or
     [:and
      [:< :fingerprint_version 4]
      [:in :base_type #{"type/Decimal" "type/Latitude" "type/Longitude" "type/Coordinate" "type/Float"}]]
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
    (#'fingerprint/honeysql-for-fields-that-need-fingerprint-updating)))


;; Make sure that the above functions are used correctly to determine which Fields get (re-)fingerprinted
(defn- field-was-fingerprinted? {:style/indent 0} [fingerprint-versions field-properties]
  (let [fingerprinted? (atom false)
        fake-field     (field/map->FieldInstance {:name "Fake Field"})]
    (with-redefs [i/fingerprint-version->types-that-should-be-re-fingerprinted fingerprint-versions
                  sample/sample-fields                                         (constantly [[fake-field [1 2 3 4 5]]])
                  fingerprint/save-fingerprint!                                (fn [& _] (reset! fingerprinted? true))]
      (tt/with-temp* [Table [table]
                      Field [_ (assoc field-properties :table_id (u/get-id table))]]
        (fingerprint/fingerprint-fields! table))
      @fingerprinted?)))

;; Field is a subtype of newer fingerprint version
(expect
  (field-was-fingerprinted?
    {2 #{:type/Float}}
    {:base_type :type/Decimal, :fingerprint_version 1}))

;; field is *not* a subtype of newer fingerprint version
(expect
  false
  (field-was-fingerprinted?
    {2 #{:type/Text}}
    {:base_type :type/Decimal, :fingerprint_version 1}))

;; Field is a subtype of one of several types for newer fingerprint version
(expect
  (field-was-fingerprinted?
    {2 #{:type/Float :type/Text}}
    {:base_type :type/Decimal, :fingerprint_version 1}))

;; Field has same version as latest fingerprint version
(expect
  false
  (field-was-fingerprinted?
    {1 #{:type/Float}}
    {:base_type :type/Decimal, :fingerprint_version 1}))

;; field has newer version than latest fingerprint version (should never happen)
(expect
  false
  (field-was-fingerprinted?
    {1 #{:type/Float}}
    {:base_type :type/Decimal, :fingerprint_version 2}))

;; field has same exact type as newer fingerprint version
(expect
  (field-was-fingerprinted?
    {2 #{:type/Float}}
    {:base_type :type/Float, :fingerprint_version 1}))

;; field is parent type of newer fingerprint version type
(expect
  false
  (field-was-fingerprinted?
    {2 #{:type/Decimal}}
    {:base_type :type/Float, :fingerprint_version 1}))

;; several new fingerprint versions exist
(expect
  (field-was-fingerprinted?
    {2 #{:type/Float}
     3 #{:type/Text}}
    {:base_type :type/Decimal, :fingerprint_version 1}))

(expect
  (field-was-fingerprinted?
    {2 #{:type/Text}
     3 #{:type/Float}}
    {:base_type :type/Decimal, :fingerprint_version 1}))


;; Make sure the `fingerprint!` function is correctly updating the correct columns of Field
(expect
  {:fingerprint         {:experimental {:fake-fingerprint? true}}
   :fingerprint_version 3
   :last_analyzed       nil}
  (tt/with-temp Field [field {:base_type           :type/Integer
                              :table_id            (data/id :venues)
                              :fingerprint         nil
                              :fingerprint_version 1
                              :last_analyzed       (u/->Timestamp "2017-08-09")}]
    (with-redefs [i/latest-fingerprint-version 3
                  sample/sample-fields         (constantly [[field [1 2 3 4 5]]])
                  fingerprint/fingerprint      (constantly {:experimental {:fake-fingerprint? true}})]
      (#'fingerprint/fingerprint-table! (Table (data/id :venues)) [field])
      (db/select-one [Field :fingerprint :fingerprint_version :last_analyzed] :id (u/get-id field)))))
