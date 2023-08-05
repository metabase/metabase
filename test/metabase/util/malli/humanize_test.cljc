(ns metabase.util.malli.humanize-test
  (:require
   [clojure.test :refer [deftest is]]
   [malli.core :as mc]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.mbql.schema :as mbql.s]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal])))

  #?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me)))

(deftest ^:parallel flatten-error-test
  (is (= [[] [[nil nil "broken"]]]
         (#'mu.humanize/flatten-error [[0 2] "broken"]))))

(deftest ^:parallel combine-error-messages-test
  (#'mu.humanize/combine-error-messages
   [nil nil "invalid type"]
   [[[1] ":value clause"]]))

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
    ;; for comparison purposes
    (comment
      #_{:clj-kondo/ignore [:unresolved-namespace]}
      (is (= ["should be a string" "should be a number"]
             (malli.error/humanize error))))
    (is (= '["should be a string"
             (":value clause" [nil nil "invalid type"])
             "should be a number"]
           (mu.humanize/humanize error)))))

(mr/def ::absolute-datetime
  [:multi {:error/message "valid :absolute-datetime clause"
           :dispatch      identity}
   [::mc/default [:fn
                  {:error/message "not an :absolute-datetime clause"}
                  (constantly false)]]])

(deftest ^:parallel ref-test
  (let [error (mc/explain [:or
                           [:ref ::absolute-datetime]]
                          [:value "192.168.1.1" {:base_type :type/FK}])]
    (is (= '[("valid :absolute-datetime clause" "not an :absolute-datetime clause")]
           (mu.humanize/humanize error)))))

(deftest ^:parallel ref-test-2
  (is (= '[("valid :value clause" [nil nil {:base_type "Not a valid base type: :type/FK"}])]
         (mu.humanize/humanize (mc/explain [:or mbql.s/value] [:value "192.168.1.1" {:base_type :type/FK}])))))

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
    ;; for comparison purposes
    (comment
      #_{:clj-kondo/ignore [:unresolved-namespace]}
      (is (= {:a {:b {:c ["should be a string"]}}}
             (me/humanize error))))
    ;; TODO -- I can't figure out how to make this output without wrapping things in a vector :(
    (is (= ['("map with :a"
              {:a
               ("map with :b"
                {:b
                 ("map with :c"
                  {:c "should be a string"})})})]
           (mu.humanize/humanize error)))))

(deftest ^:parallel map-test-2
  (is (=? {:lib/type ["missing required key"]}
          (mu.humanize/humanize (mc/explain ::lib.schema.join/join {:stages 1})))))

(deftest ^:parallel map-test-3
  ;; not sure why these errors are repeated.
  (is (=? {:stages [{:joins [{:stages [{:lib/type ["missing required key"
                                                   "invalid dispatch value"
                                                   "missing required key"
                                                   "invalid dispatch value"]}]}]}]}
          (mu.humanize/humanize (mc/explain ::lib.schema/query {:stages [{:lib/type :mbql.stage/mbql
                                                                          :joins    [{:lib/type :mbql/join
                                                                                      :stages   [{}]}]}]})))))
