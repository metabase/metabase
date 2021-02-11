(ns metabase.models.field-test
  "Tests for specific behavior related to the Field model."
  (:require [expectations :refer :all]
            [metabase.sync.analyze.classifiers.name :as name]))


;;; infer-field-semantic-type
(expect :type/PK       (#'name/semantic-type-for-name-and-base-type "id"      :type/Integer))
;; other pattern matches based on type/regex (remember, base_type matters in matching!)
(expect :type/Score    (#'name/semantic-type-for-name-and-base-type "rating"  :type/Integer))
(expect nil            (#'name/semantic-type-for-name-and-base-type "rating"  :type/Boolean))
(expect :type/Country  (#'name/semantic-type-for-name-and-base-type "country" :type/Text))
(expect nil            (#'name/semantic-type-for-name-and-base-type "country" :type/Integer))
