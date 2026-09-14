(ns metabase.util.malli.closed-schemas-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli :as mu]
   [metabase.util.malli.closed-schemas :as mu.closed-schemas]))

(set! *warn-on-reflection* true)

(deftest ^:parallel findings-without-any-test
  (are [schema kinds] (= kinds (mapv :kind (mu.closed-schemas/findings schema {:any? false})))
    [:map {:closed true} [:a :any]]          []
    [:map-of :string :any]                   []
    [:map [:a :int]]                         [:open-map]
    [:maybe map?]                            [:open-map]
    [:map-of :keyword :int]                  [:keyword-keyed-map-of]
    [:map {:closed true} [:a [:map [:b :int]]]] [:open-map]))

(deftest check-args-test
  (binding [mu.closed-schemas/*enabled* true]
    (is (nil? (mu.closed-schemas/check-args! `f [[:cat :int [:map {:closed true} [:a :any]]]])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"The arguments of metabase.util.malli.closed-schemas-test/f reach maps that are not closed"
                          (mu.closed-schemas/check-args! `f [[:cat :int] [:cat [:map [:a :int]]]])))))

(defn- eval-error-message [form]
  (try
    (eval form)
    nil
    (catch Throwable e
      (ex-message (or (ex-cause e) e)))))

(deftest mu-defn-checks-its-args-test
  (binding [mu.closed-schemas/*enabled* true]
    (testing "an open map argument fails when the function is defined"
      (is (re-find #"reach maps that are not closed"
                   (str (eval-error-message `(mu/defn ~'open-arg [~'m :- [:map [:a :int]]] ~'m))))))
    (testing "and so does a destructured map without a schema"
      (is (re-find #"reach maps that are not closed"
                   (str (eval-error-message `(mu/defn ~'destructured [{:keys [~'a]}] ~'a))))))
    (testing "a return schema is not checked"
      (is (nil? (eval-error-message `(mu/defn ~'open-return :- [:map [:a :int]]
                                       [~'m :- [:map {:closed true} [:a :int]]]
                                       ~'m)))))))
