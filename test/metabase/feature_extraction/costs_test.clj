(ns metabase.feature-extraction.costs-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.costs :refer :all]))

(expect
  [true
   true
   true
   true
   true
   false
   true
   true
   true
   true
   true
   true
   false
   false]
  [(-> {:computation :linear} linear-computation? boolean)
   (-> {:computation :unbounded} unbounded-computation? boolean)
   (-> {:computation :yolo} unbounded-computation? boolean)
   (-> {:computation :yolo} yolo-computation? boolean)
   (-> {:computation :unbounded} linear-computation? boolean)
   (-> {:computation :unbounded} yolo-computation? boolean)
   (-> {:query :cache} cache-only? boolean)
   (-> {:query :sample} sample-only? boolean)
   (-> {:query :full-scan} full-scan? boolean)
   (-> {:query :joins} full-scan? boolean)
   (-> {:query :joins} allow-joins? boolean)
   (-> nil full-scan? boolean)
   (-> nil allow-joins? boolean)
   (-> {:query :sample} full-scan? boolean)])

(expect
  [true
   true
   false
   false]
  (let [xray-max-cost (constantly {:query       :full-scan
                                   :computation :linear})
        max-cost (apply-global-cost-cap {:computation :unbounded
                                         :query       :sample})]
    [(-> max-cost unbounded-computation?)
     (-> max-cost linear-computation?)
     (-> max-cost full-scan?)
     (-> max-cost allow-joins? )]))
