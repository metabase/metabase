(ns ^:mb/once metabase.util.malli-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util.malli :as mu]
   [metabase.util.malli.describe :as umd]))

(deftest mu-defn-test
  (testing "invalid input"
    (mu/defn bar [x :- [:map [:x int?] [:y int?]]] (str x))
    (is (= [{:x ["missing required key"]
             :y ["missing required key"]}]
           (:humanized
            (try (bar {})
                 (catch Exception e (ex-data e)))))
        "when we pass bar an invalid shape um/defn throws")
    (ns-unmap *ns* 'bar))

  (testing "invalid output"
    (mu/defn baz :- [:map [:x int?] [:y int?]] [] {:x "3"})
    (is (= {:x ["should be an int"]
            :y ["missing required key"]}
           (:humanized
            (try (baz)
                 (catch Exception e (ex-data e)))))
        "when baz returns an invalid form um/defn throws")
    (ns-unmap *ns* 'baz)))

(deftest with-api-error-message
  (let [less-than-four-fxn (fn [x] (< x 4))]
    (testing "outer schema"
      (let [special-lt-4-schema (mu/with-api-error-message
                                  [:fn less-than-four-fxn]
                                  "Special Number that has to be less than four")]
        (is (= [:fn {:description "Special Number that has to be less than four",
                     :error/message "Special Number that has to be less than four"}
                less-than-four-fxn]
               (mc/form special-lt-4-schema)))

        (is (= ["Special Number that has to be less than four"]
               (me/humanize (mc/explain special-lt-4-schema 8))))

        (is (= "Special Number that has to be less than four"
               (umd/describe special-lt-4-schema)))))
    (testing "inner schema"
      (let [special-lt-4-schema [:map [:ltf-key (mu/with-api-error-message
                                                  [:fn less-than-four-fxn]
                                                  "Special Number that has to be less than four")]]]
        (is (= [:map
                [:ltf-key [:fn {:description "Special Number that has to be less than four",
                                :error/message "Special Number that has to be less than four"}
                           less-than-four-fxn]]]
               (mc/form special-lt-4-schema)))

        (is (= {:ltf-key ["missing required key"]}
               (me/humanize (mc/explain special-lt-4-schema {}))))

        (is (= {:ltf-key ["Special Number that has to be less than four"]}
               (me/humanize (mc/explain special-lt-4-schema {:ltf-key 8}))))

        (is (= "map where {:ltf-key -> <Special Number that has to be less than four>}"
               (umd/describe special-lt-4-schema)))))))
