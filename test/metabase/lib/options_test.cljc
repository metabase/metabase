(ns metabase.lib.options-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.options :as lib.options]))

(deftest ^:parallel default-mbql-options-test
  (testing `lib.options/options
    (is (= nil
           (lib.options/options [:mbql-clause 1])))
    (is (= {:x 1}
           (lib.options/options [:mbql-clause {:x 1} 1]))))
  (testing `lib.options/with-options
    (is (= [:mbql-clause {:x 2} 1]
           (lib.options/with-options [:mbql-clause 1] {:x 2})
           (lib.options/with-options [:mbql-clause {:x 1, :y 2} 1] {:x 2})))))

(deftest ^:parallel default-map-options-test
  (testing `lib.options/options
    (is (= nil
             (lib.options/options {:lib/type :map})))
    (is (= {:x 1}
             (lib.options/options {:lib/type :map, :lib/options {:x 1}}))))
  (testing `lib.options/with-options
    (is (= {:lib/type :map, :lib/options {:x 2}}
             (lib.options/with-options {:lib/type :map, :lib/options {:x 1}} {:x 2})
             (lib.options/with-options {:lib/type :map, :lib/options {:x 1, :y 2}} {:x 2})))))
