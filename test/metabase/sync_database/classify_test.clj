(ns metabase.sync-database.classify-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer :all]
             [field-values :refer :all]]
            [metabase.sync-database.infer-special-type :refer [infer-field-special-type]]
            [metabase.sync-database.classify :refer :all]
            [metabase.test.util :as tu]))

(expect nil            (infer-field-special-type nil       nil))
(expect nil            (infer-field-special-type "id"      nil))
(expect nil            (infer-field-special-type nil       :type/Integer))
(expect :type/PK       (infer-field-special-type "id"      :type/Integer))
;; other pattern matches based on type/regex (remember, base_type matters in matching!)
(expect :type/Category (infer-field-special-type "rating"  :type/Integer))
(expect nil            (infer-field-special-type "rating"  :type/Boolean))
(expect :type/Country  (infer-field-special-type "country" :type/Text))
(expect nil            (infer-field-special-type "country" :type/Integer))

(def base-fingerprint
  {:base_type            :type/Text
   :is_pk                false
   :is_fk                false
   :cardinality          1
   :field_percent_urls   0
   :field_percent_json   0
   :field_percent_email  0
   :field_avg_length     1
   :field_id             1
   :table_id             1
   :name                 "type"
   :qualified_name       "PUBLIC.TEST"
   :visibility_type      :normal})

;; in the totally normal case :type/Category is a good default type
(expect
  {:id 7
   :special-type :type/Category}
  (test:category-type base-fingerprint {:id 7}))

;; no-preview property. This is set independently of special type
(expect
  {:id 7}
  (test:no-preview-display base-fingerprint {:id 7}))

;; it should be set if the fields are too long for humans to want to see.
(expect
  {:id 7, :preview-display false}
  (test:no-preview-display (assoc base-fingerprint :field_avg_length 1e6) {:id 7}))

;; :type/Category should not be applied to any password like fields
(expect
  {:id 7}
  (test:category-type (assoc base-fingerprint :visibility_type "sensitive") {:id 7}))

;; email is detected if the sample is 100% email addresses
(expect
  {:id 7}
  (test:email-special-type base-fingerprint  {:id 7}))

(expect
  {:id 7, :special-type :type/Email, :preview-display true}
  (test:email-special-type (assoc base-fingerprint :field_percent_email 100) {:id 7}))

;; json special types are just like email
(expect
  {:id 7}
  (test:json-special-type base-fingerprint  {:id 7}))

(expect
  {:id 7, :special-type :type/SerializedJSON, :preview-display false}
  (test:json-special-type (assoc base-fingerprint :field_percent_json 100) {:id 7}))


;; the "initial guess" for special types is based on the name, other choices depend on this one indirectly
(expect
  {:id 7, :special-type :type/Category}
  (test:initial-guess base-fingerprint  {:id 7}))


;; if primary key special types are not preserved query pipeline breaks in subtle ways
(expect
  {:id 7, :special-type :type/PK}
  (test:primary-key (assoc  base-fingerprint :is_pk true)  {:id 7}))

(expect
  {:id 7, :special-type :type/FK}
  (test:foreign-key (assoc  base-fingerprint :is_fk true)  {:id 7}))

;; and the special type in the fingerprint should overwrite the existing type is set.
;; this is a bit non-intuative though it describes the existing behavior at the time
;; this test was added.
(expect
  {:id 7, :special-type :type/PK}
  (test:primary-key (assoc  base-fingerprint :is_fk true)  {:id 7 :special-type :type/PK}))
