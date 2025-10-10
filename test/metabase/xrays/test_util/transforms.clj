(ns metabase.xrays.test-util.transforms
  (:require
   [clojure.test :refer [testing]]
   [metabase.xrays.transforms.specs :as tf.specs]))

(def test-transform-spec
  "A test transform spec written against our test DB."
  (-> {:name     "Test transform"
       :requires "Venues"
       :provides "VenuesEnhanced"
       :steps    {"CategoriesStats" {:source      "Venues"
                                     :aggregation {"AvgPrice" [:avg [:dimension "Category"]]
                                                   "MinPrice" [:min [:dimension "Category"]]
                                                   "MaxPrice" [:max [:dimension "Category"]]}
                                     :breakout    "FK"}
                  "VenuesEnhanced"  {:source      "Venues"
                                     :expressions {"RelativePrice" [:/ [:dimension "Category"]
                                                                    [:dimension "CategoriesStats.AvgPrice"]]}
                                     :joins       [{:source    "CategoriesStats"
                                                    :condition [:=
                                                                [:dimension "FK"]
                                                                [:dimension "CategoriesStats.FK"]]}]
                                     :limit       3}}}
      (#'tf.specs/add-metadata-to-steps)
      (#'tf.specs/coerce-to-transform-spec)))

(defmacro with-test-transform-specs!
  "Evaluate `body` in a context where `transforms.specs/transform-specs` have been swapped for `test-transform-specs`"
  [& body]
  `(testing "with-test-transform-specs\n"
     (with-redefs [tf.specs/transform-specs (delay [test-transform-spec])]
       ~@body)))
