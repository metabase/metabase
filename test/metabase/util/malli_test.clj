(ns metabase.util.malli-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.util.malli :as um]))

(deftest mu-defn-test
  (testing "invalid input"
    (um/defn bar [x :- [:map [:x int?] [:y int?]]] "42")
    (is (= [{:x ["missing required key"]
             :y ["missing required key"]}]
           (:humanized
            (try (bar {})
                 (catch Exception e (ex-data e)))))
        "when we pass bar an invalid shape um/defn throws")
    (ns-unmap *ns* 'bar))

  (testing "invalid output"
    (um/defn baz :- [:map [:x int?] [:y int?]] [] {:x "3"})
    (is (= {:x ["should be an int"]
            :y ["missing required key"]}
           (:humanized
            (try (baz)
                 (catch Exception e (ex-data e)))))
        "when baz returns an invalid form um/defn throws")
    (ns-unmap *ns* 'baz)))


(deftest describe-test
  (is (= "A keyword"
         (um/describe :keyword)))
  (is (= "A string"
         (um/describe :string)))
  (is (= "A string at least 3 long"
         (um/describe [:string {:min 3}])))
  (is (= "A string at most 3 long"
         (um/describe [:string {:max 3}])))
  (is (= "A string with length between 3 and 5"
         (um/describe [:string {:min 3 :max 5}])))
  (is (= "A ( string, or keyword )"
         (um/describe [:or :string :keyword])))
  (is (= "A map of positive integer to positive integer"
         (um/describe [:map-of int? pos-int?])))
  (is (= "A tuple of size 2 like: [ integer integer ]"
         (um/describe [:tuple :int :int])))
  (is (= "A ( integer, or value that is one of: 1 2 or 3 )"
         (um/describe [:or int? [:enum 1 2 3]])))
  (is (= "A ( integer, or string, or value that is one of: :rasta or :lucky )"
         (um/describe [:or int? string? [:enum :rasta :lucky]])))
  (is (= (str/join "\n"
                   ["A map with keys: ["
                    "    :a (optional) => integer "
                    "    :b => map with keys: ["
                    "        :c (optional) => integer "
                    "        :d => map with keys: ["
                    "            :e (optional) => integer "
                    "            :f => map with keys: ["
                    "                :g (optional) => integer "
                    "                ]"
                    "            ]"
                    "        ]"
                    "    ]"])
         (um/describe
          [:map
           [:a {:optional true} int?]
           [:b [:map
                [:c {:optional true} int?]
                [:d [:map
                     [:e {:optional true} int?]
                     [:f [:map
                          [:g {:optional true} int?]]]]]]]]))))
