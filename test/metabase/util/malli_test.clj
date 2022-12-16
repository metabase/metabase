(ns metabase.util.malli-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.util.malli :as um]))

(deftest mu-defn-test
  (testing "invalid input"
    (um/defn bar [x :- [:map [:x int?] [:y int?]]] (str x))
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

(defn- description [schema]
  (:description (um/describe schema)))

(deftest describe-test
  (is (= "A keyword"
         (description :keyword)))
  (is (= "A string"
         (description :string)))
  (is (= "A string at least 3 long"
         (description [:string {:min 3}])))
  (is (= "A string at most 3 long"
         (description [:string {:max 3}])))
  (is (= "A string with length between 3 and 5"
         (description [:string {:min 3 :max 5}])))
  (is (= "A ( string, or keyword )"
         (description [:or :string :keyword])))
  (is (= (str/join "\n" ["A map of ["
                         "    integer "
                         "    =>"
                         "    positive integer ]"])
         (description [:map-of int? pos-int?])))
  (is (= "A tuple of size 2 like: [ integer integer ]"
         (description [:tuple :int :int])))
  (is (= "A ( integer, or value that is one of: 1 2 or 3 )"
         (description [:or int? [:enum 1 2 3]])))
  (is (= "A ( integer, or string, or value that is one of: :rasta or :lucky )"
         (description [:or int? string? [:enum :rasta :lucky]])))
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
         (description
          [:map
           [:a {:optional true} int?]
           [:b [:map
                [:c {:optional true} int?]
                [:d [:map
                     [:e {:optional true} int?]
                     [:f [:map
                          [:g {:optional true} int?]]]]]]]]))))
