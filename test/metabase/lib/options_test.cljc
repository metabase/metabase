(ns metabase.lib.options-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.options :as lib.options]))

(deftest ^:parallel default-mbql-options-test
  (testing `lib.options/options
    (is (= nil
           (lib.options/options [:expression "x"])))
    (is (= {:lib/expression-name "x"}
           (lib.options/options [:expression {:lib/expression-name "x"} "x"]))))
  (testing `lib.options/with-options
    (is (= [:expression {:name "y"} "x"]
           (lib.options/with-options [:expression {:lib/expression-name "x"} "x"] {:name "y"})))))

(deftest ^:parallel default-map-options-test
  (testing `lib.options/options
    (is (= nil
           (lib.options/options {:lib/type :metadata/column, :name "x", :base-type :type/Text})))
    (is (= {:lib/expression-name "x"}
           (lib.options/options {:lib/type :metadata/column, :name "x", :base-type :type/Text
                                 :lib/options {:lib/expression-name "x"}}))))
  (testing `lib.options/with-options
    (is (= {:lib/type :metadata/column, :name "x", :base-type :type/Text, :lib/options {:lib/expression-name "y"}}
           (lib.options/with-options {:lib/type :metadata/column, :name "x", :base-type :type/Text
                                      :lib/options {:lib/expression-name "x"}}
             {:lib/expression-name "y"})))))
