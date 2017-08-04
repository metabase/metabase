(ns metabase.sync.analyze.fingerprint-test
  "Basic tests to make sure the fingerprint generatation code is doing something that makes sense."
  (:require [expectations :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.sync.analyze.fingerprint :as fingerprint]
            [metabase.test.data :as data]))

;; basic test for a numeric Field
(expect
  {:global {:distinct-count 4}
   :type   {:type/Number {:min 1, :max 4, :avg 2.03}}}
  (#'fingerprint/fingerprint (Field (data/id :venues :price))))

;; basic test for a Text Field
(expect
  {:global {:distinct-count 100}
   :type   {:type/Text {:percent-json 0.0, :percent-url 0.0, :percent-email 0.0, :average-length 15.63}}}
  (#'fingerprint/fingerprint (Field (data/id :venues :name))))

;; a non-integer numeric Field
(expect
  {:global {:distinct-count 94}
   :type   {:type/Number {:min 10.0646, :max 40.7794, :avg 35.50589199999998}}}
  (#'fingerprint/fingerprint (Field (data/id :venues :latitude))))

;; a datetime field
(expect
  {:global {:distinct-count 618}}
  (#'fingerprint/fingerprint (Field (data/id :checkins :date))))
