(ns metabase.lib.schema.expression.window-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest are]]
   [metabase.lib.normalize :as lib.normalize]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel normalize-offset-test
  (are [x] (=? [:offset
                {:lib/uuid string?, :effective-type :type/Float}
                [:field
                 {:base-type :type/Float, :effective-type :type/Float, :lib/uuid string?}
                 1]
                -1]
               (lib.normalize/normalize x))
    [:offset
     {:effective-type "type/Float"}
     [:field
      {:base-type "type/Float", :effective-type "type/Float"}
      1]
     -1]

    ["offset"
     {"effective-type" "type/Float"}
     ["field"
      {"base-type" "type/Float", "effective-type" "type/Float"}
      1]
     -1]))
