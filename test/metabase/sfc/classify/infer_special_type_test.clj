(ns metabase.sfc.classify.infer-special-type-test
  (:require [expectations :refer :all]
            [metabase.sfc.classify.infer-special-type :refer [infer-field-special-type]]))

(expect nil            (infer-field-special-type nil       nil))
(expect nil            (infer-field-special-type "id"      nil))
(expect nil            (infer-field-special-type nil       :type/Integer))
(expect :type/PK       (infer-field-special-type "id"      :type/Integer))
;; other pattern matches based on type/regex (remember, base_type matters in matching!)
(expect :type/Category (infer-field-special-type "rating"  :type/Integer))
(expect nil            (infer-field-special-type "rating"  :type/Boolean))
(expect :type/Country  (infer-field-special-type "country" :type/Text))
(expect nil            (infer-field-special-type "country" :type/Integer))
