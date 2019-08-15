(ns metabase.test.transforms
  (:require [metabase.transforms.specs :as t.specs]))

(def test-transform-spec
  "A test transform spec written against our test DB."
  (-> {:name     "Test transform"
       :requires "Venues"
       :provides "VenuesEnhanced"
       :steps    {"CategoriesStats" {:source      "Venues"
                                     :aggregation {"AvgPrice" [:avg [:dimension "PRICE"]]
                                                   "MinPrice" [:min [:dimension "PRICE"]]
                                                   "MaxPrice" [:max [:dimension "PRICE"]]}
                                     :breakout    "FK"}
                  "VenuesEnhanced"  {:source      "Venues"
                                     :expressions {"RelativePrice" [:/ [:dimension "PRICE"]
                                                                    [:dimension "CategoriesStats.AvgPrice"]]}
                                     :joins       [{:source    "CategoriesStats"
                                                    :condition [:= [:dimension "FK"]
                                                                [:dimension "CategoriesStats.FK"]]}]
                                     :limit       3}}}
      (#'t.specs/add-metadata-to-steps)
      (#'t.specs/transform-spec-parser)))

(defmacro with-test-transform-specs
  "Evaluate `body` in a context where `transforms.specs/transform-specs` have been swapped for `test-transform-specs`"
  [& body]
  `(with-redefs [t.specs/transform-specs (delay [test-transform-spec])]
     ~@body))
