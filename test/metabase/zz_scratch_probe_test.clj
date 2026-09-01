(ns metabase.zz-scratch-probe-test
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.field :as parameters.field]
   [metabase.test :as mt]))

(deftest probe-fk-value-set-divergence-test
  (mt/with-test-user :crowberto
    (let [fid (mt/id :venues :category_id)
          unconstrained (parameters.field/search-values-from-field-id fid nil)
          constrained   (chain-filter/chain-filter fid [{:field-id (mt/id :venues :price)
                                                         :op := :options nil :value [1 2 3 4]}])]
      (println "UNCONSTRAINED count=" (count (:values unconstrained))
               "first3=" (vec (take 3 (:values unconstrained)))
               "has_more=" (:has_more_values unconstrained)
               "field_id=" (:field_id unconstrained))
      (println "CONSTRAINED   count=" (count (:values constrained))
               "first3=" (vec (take 3 (:values constrained)))
               "has_more=" (:has_more_values constrained)
               "field_id=" (:field_id constrained))
      (is true))))
