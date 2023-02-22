(ns metabase.lib.options-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib.options :as lib.options])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib.options :as lib.options])]))

(t/deftest ^:parallel default-mbql-options-test
  (t/testing `lib.options/options
    (t/is (= nil
             (lib.options/options [:mbql-clause 1])))
    (t/is (= {:x 1}
             (lib.options/options [:mbql-clause {:x 1} 1]))))
  (t/testing `lib.options/with-options
    (t/is (= [:mbql-clause {:x 2} 1]
             (lib.options/with-options [:mbql-clause 1] {:x 2})
             (lib.options/with-options [:mbql-clause {:x 1, :y 2} 1] {:x 2})))))

(t/deftest ^:parallel default-map-options-test
  (t/testing `lib.options/options
    (t/is (= nil
             (lib.options/options {:lib/type :map})))
    (t/is (= {:x 1}
             (lib.options/options {:lib/type :map, :lib/options {:x 1}}))))
  (t/testing `lib.options/with-options
    (t/is (= {:lib/type :map, :lib/options {:x 2}}
             (lib.options/with-options {:lib/type :map, :lib/options {:x 1}} {:x 2})
             (lib.options/with-options {:lib/type :map, :lib/options {:x 1, :y 2}} {:x 2})))))
