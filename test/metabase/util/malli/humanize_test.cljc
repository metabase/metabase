(ns metabase.util.malli.humanize-test
  (:require
   [clojure.test :refer [deftest are]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel merge-errors-test
  (are [x y expected] (= expected
                         (#'mu.humanize/merge-errors x y))

    '("a" "b")
    "c"
    '("a" "b" "c")

    {:stages [{:joins [{:stages [{:lib/type "a"}]}]}]}
    {:stages [{:joins [{:stages [{:lib/type "b"}]}]}]}
    {:stages [{:joins [{:stages [{:lib/type '("a" "b")}]}]}]}

    '("a" "b")
    [nil nil {:base_type "c"}]
    '("a" "b" [nil nil {:base_type "c"}])

    '("a" [nil nil {:base_type "c"}])
    "b"
    '("a" [nil nil {:base_type "c"}] "b")

    ;; not a list, but list-like
    {:stages [{:joins [{:stages [{:lib/type (cons "a" (list "b" "c"))}], :alias "d"}]}]}
    {:stages [{:joins [{:stages [{:lib/type "e"}]}]}]}
    {:stages [{:joins [{:stages [{:lib/type '("a" "b" "c" "e")}], :alias "d"}]}]}

    '("a" "b")
    '("c" "d")
    '("a" "b" "c" "d")

    ;; eliminate duplicates
    '("a" "b")
    '("b" "c")
    '("a" "b" "c")

    "a"
    "a"
    "a"))

(deftest ^:parallel basic-test
  (let [error (mc/explain
               [:or
                :int
                mbql.s/value]
               [:value "192.168.1.1" {:base_type :type/FK}])]
    (are [f expected] (= expected
                         (f error))
      ;; note the missing error for [[mbql.s/value]]
      me/humanize
      ["should be an integer"]

      mu.humanize/humanize
      ["should be an integer"
       [nil nil {:base_type "Not a valid base type: :type/FK"}]])))

(deftest ^:parallel basic-test-2
  (let [error (mc/explain
               [:map
                [:x [:or
                     :int
                     mbql.s/value]]]
               {:x [:value "192.168.1.1" {:base_type :type/FK}]})]
    (are [f expected] (= expected
                         (f error))
      ;; note the missing error for [[mbql.s/value]]
      me/humanize
      {:x ["should be an integer"]}

      mu.humanize/humanize
      {:x ["should be an integer"
           [nil nil {:base_type "Not a valid base type: :type/FK"}]]})))

(deftest ^:parallel or-test
  (let [error (mc/explain
               [:or
                :string
                [:tuple {:error/message ":value clause"}
                 [:= :value]
                 any?
                 :map]
                number?]
               [:value 1 nil])]
    (are [f expected] (= expected
                         (f error))
      me/humanize
      ["should be a string" "should be a number"]

      mu.humanize/humanize
      '["should be a string"
        #_(":value clause" [nil nil "invalid type"])
        [nil nil "invalid type"]
        "should be a number"])))

(mr/def ::absolute-datetime
  [:multi {:error/message "valid :absolute-datetime clause"
           :dispatch      identity}
   [::mc/default [:fn
                  {:error/message "not an :absolute-datetime clause"}
                  (constantly false)]]])

(deftest ^:parallel ref-test
  (are [f expected] (= expected
                       (f (mc/explain [:or
                                       [:ref ::absolute-datetime]]
                                      [:value "192.168.1.1" {:base_type :type/FK}])))
    me/humanize
    ["not an :absolute-datetime clause"]

    mu.humanize/humanize
    "not an :absolute-datetime clause"))

(deftest ^:parallel ref-test-2
  (are [f expected] (= expected
                       (f (mc/explain [:or mbql.s/value] [:value "192.168.1.1" {:base_type :type/FK}])))
    me/humanize
    [nil nil {:base_type ["Not a valid base type: :type/FK"]}]

    mu.humanize/humanize
    [nil nil {:base_type "Not a valid base type: :type/FK"}]))

(deftest ^:parallel map-test
  (let [error (mc/explain
               [:map
                {:error/message "map with :a"}
                [:a
                 [:map
                  {:error/message "map with :b"}
                  [:b
                   [:map
                    {:error/fn (constantly "map with :c")}
                    [:c string?]]]]]]
               {:a {:b {:c 1}}})]
    (are [f expected] (= expected
                         (f error))
      me/humanize
      {:a {:b {:c ["should be a string"]}}}

      mu.humanize/humanize
      {:a {:b {:c "should be a string"}}})))

(deftest ^:parallel map-test-2
  (let [error (mc/explain ::lib.schema.join/join {:stages 1})]
    (are [f expected] (=? expected
                          (f error))
      me/humanize
      {:lib/type ["missing required key"]}

      mu.humanize/humanize
      {:lib/type "missing required key"})))

(deftest ^:parallel map-test-3
  (let [error (mc/explain ::lib.schema/query {:lib/type :mbql/query
                                              :database 1
                                              :stages   [{:lib/type     :mbql.stage/mbql
                                                          :source-table 1
                                                          :joins        [{:lib/type    :mbql/join
                                                                          :lib/options {:lib/uuid (str (random-uuid))}
                                                                          :stages      [{}]
                                                                          :conditions  [true]}]}]})]
    (are [f expected] (= expected
                         (f error))
      ;; not sure why these errors are repeated.
      me/humanize
      {:stages [{:joins [{:stages [{:lib/type    ["missing required key"]
                                    :malli/error ["Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"
                                                  "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"]}]
                          :alias  ["missing required key"]}]}]}

      mu.humanize/humanize
      {:stages [{:joins [{:stages
                          [[{:lib/type "missing required key"} "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"]],
                          :alias "missing required key"}]}]})))
