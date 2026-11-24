(ns metabase.util.malli.closed-schemas-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli :as mu]
   [metabase.util.malli.closed-schemas :as mu.closed-schemas]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel findings-test
  (are [schema kinds] (= kinds (mapv :kind (mu.closed-schemas/findings schema)))
    [:map [:a :int]]                        []
    [:map-of :keyword :int]                 []
    [:maybe map?]                           []
    [:and any? [:fn map?]]                  []
    [:map {:closed false} [:a :int]]        [:open-map]
    [:map [:a :any]]                        [:any]
    [:map-of :string :some]                 [:any]
    [:map [:a [:sequential [:maybe any?]]]] [:any]))

(mr/def ::cycle.head
  [:map [:tail {:optional true} [:ref ::cycle.tail]] [:bag :any]])

(mr/def ::cycle.tail
  [:map [:head {:optional true} [:ref ::cycle.head]]])

(mr/def ::cycle.user
  [:map [:tail ::cycle.tail]])

(mr/def ::redefined.child
  [:map [:a :int]])

(mr/def ::redefined.parent
  [:map [:child ::redefined.child]])

(defn- kinds [schema]
  (mapv :kind (mu.closed-schemas/findings schema)))

(deftest findings-do-not-depend-on-earlier-walks-test
  (testing "a schema reached after a cycle was cut short"
    (mu.closed-schemas/forget-results!)
    (is (= [:any] (kinds [:map [:head ::cycle.head] [:user ::cycle.user]])))
    (is (= [:any] (kinds ::cycle.user))))
  (testing "a schema whose child is registered again"
    (is (= [] (kinds ::redefined.parent)))
    (try
      (mr/def ::redefined.child [:map [:a :any]])
      (is (= [:any] (kinds ::redefined.parent)))
      (finally
        (mr/def ::redefined.child [:map [:a :int]])))))

(deftest check-args-test
  (binding [mu.closed-schemas/*enabled* true]
    (is (nil? (mu.closed-schemas/check-args! `f [[:cat :int [:map [:a :int]]]])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"The arguments of metabase.util.malli.closed-schemas-test/f reach schemas that accept anything"
                          (mu.closed-schemas/check-args! `f [[:cat :int] [:cat [:map [:a :any]]]])))))

(defn- eval-error-message [form]
  (try
    (eval form)
    nil
    (catch Throwable e
      (ex-message (or (ex-cause e) e)))))

(deftest mu-defn-checks-its-args-test
  (binding [mu.closed-schemas/*enabled* true]
    (testing "an :any argument fails when the function is defined"
      (is (re-find #"reach schemas that accept anything"
                   (str (eval-error-message `(mu/defn ~'any-arg [~'x :- :any] ~'x))))))
    (testing "and so does an argument without a schema"
      (is (re-find #"reach schemas that accept anything"
                   (str (eval-error-message `(mu/defn ~'unannotated [~'x] ~'x))))))
    (testing "a map argument passes, open or not"
      (is (nil? (eval-error-message `(mu/defn ~'map-arg [~'m :- [:map [:a :int]]] ~'m)))))
    (testing "a return schema is not checked"
      (is (nil? (eval-error-message `(mu/defn ~'open-return :- :any
                                       [~'m :- [:map [:a :int]]]
                                       ~'m)))))))
