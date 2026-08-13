(ns metabase.pivot.js-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.pivot.js :as pivot.js]))

(deftest ^:parallel columns-without-pivot-group-preserves-namespaced-keys-test
  (testing "Namespaced keys like lib/breakout? survive the JS->CLJS->JS round-trip (#70358)"
    (let [input    #js [#js {"name"          "CREATED_AT"
                             "lib/breakout?" true}
                        #js {"name" "pivot-grouping"}]
          result   (pivot.js/columns-without-pivot-group input)
          col      (first result)]
      (is (= 1 (.-length result)))
      (is (= "CREATED_AT" (unchecked-get col "name")))
      (is (true? (unchecked-get col "lib/breakout?"))
          "namespaced key lib/breakout? should be preserved through CLJS conversion"))))
