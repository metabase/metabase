(ns metabase.feature-extraction.core-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.core :as fe]))

(expect
  {:limit (var-get #'fe/max-sample-size)}
  (#'fe/extract-query-opts {:max-cost {:query :sample}}))

(expect
  [100.22
   100.0
   100.2
   0.2
   0.22
   0.221
   0.00224]
  (map (partial #'fe/trim-decimals 2) [100.2234454656
                                       100
                                       100.2
                                       0.2
                                       0.22
                                       0.221145657
                                       0.00224354565]))
