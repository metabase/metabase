(ns metabase.feature-extraction.costs-test
  (:require [expectations :refer :all]
            [metabase.feature-extraction.costs :refer :all]))

(expect
  [true
   true
   true
   true
   false
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
   (-> {:query :joins} alow-joins? boolean)
   (-> nil full-scan? boolean)
   (-> nil alow-joins? boolean)
   (-> {:query :sample} full-scan? boolean)])
