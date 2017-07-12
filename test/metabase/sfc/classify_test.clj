(ns metabase.sfc.classify-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer :all]
             [field-values :refer :all]]
            [metabase.sfc.classify :as classify]
            [metabase.test.util :as tu]))

(def ^:private base-fingerprint
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
  (#'classify/test:category-type base-fingerprint {:id 7}))

;; no-preview property. This is set independently of special type
(expect
  {:id 7}
  (#'classify/test:no-preview-display base-fingerprint {:id 7}))

;; it should be set if the fields are too long for humans to want to see.
(expect
  {:id 7, :preview-display false}
  (#'classify/test:no-preview-display (assoc base-fingerprint :field_avg_length 1e6) {:id 7}))

;; :type/Category should not be applied to any password like fields
(expect
  {:id 7}
  (#'classify/test:category-type (assoc base-fingerprint :visibility_type "sensitive") {:id 7}))

;; email is detected if the sample is 100% email addresses
(expect
  {:id 7}
  (#'classify/test:email-special-type base-fingerprint  {:id 7}))

(expect
  {:id 7, :special-type :type/Email, :preview-display true}
  (#'classify/test:email-special-type (assoc base-fingerprint :field_percent_email 100) {:id 7}))

;; json special types are just like email
(expect
  {:id 7}
  (#'classify/test:json-special-type base-fingerprint  {:id 7}))

(expect
  {:id 7, :special-type :type/SerializedJSON, :preview-display false}
  (#'classify/test:json-special-type (assoc base-fingerprint :field_percent_json 100) {:id 7}))


;; the "initial guess" for special types is based on the name, other choices depend on this one indirectly
(expect
  {:id 7, :special-type :type/Category}
  (#'classify/test:initial-guess base-fingerprint  {:id 7}))


;; if primary key special types are not preserved query pipeline breaks in subtle ways
(expect
  {:id 7, :special-type :type/PK}
  (#'classify/test:primary-key (assoc  base-fingerprint :is_pk true)  {:id 7}))

(expect
  {:id 7, :special-type :type/FK}
  (#'classify/test:foreign-key (assoc  base-fingerprint :is_fk true)  {:id 7}))

;; and the special type in the fingerprint should overwrite the existing type is set.
;; this is a bit non-intuative though it describes the existing behavior at the time
;; this test was added.
(expect
  {:id 7, :special-type :type/PK}
  (#'classify/test:primary-key (assoc  base-fingerprint :is_fk true)  {:id 7 :special-type :type/PK}))
