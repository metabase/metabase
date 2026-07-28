(ns metabase.lib.schema.expression.string-test
  (:require
   [clojure.test :refer [are deftest testing]]
   [malli.error :as me]
   [metabase.lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.util.malli.registry :as mr]))

(comment metabase.lib.schema/keep-me)

(deftest ^:parallel concat-test
  (are [clause] (not (me/humanize (mr/explain :mbql.clause/concat clause)))
    [:concat {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"} "1" "2"]
    [:concat {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"} "1" "2" "3"]

    [:concat
     {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"}
     [:field {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930b"} 1]
     "2"]

    [:concat
     {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"}
     "concat simple nested expressions: "
     [:get-year
      {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930a"}
      [:field {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930b"} 1]]
     "Q"
     [:get-quarter {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930c"}
      [:field {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930d"} 2]]]

    [:concat
     {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"}
     "concat nested expressions of various types: "
     [:/
      {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930a"}
      3
      [:+
       {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930b"}
       1
       [:field {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930c"} 1]]]
     [:and
      {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930a"}
      [:or {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930b"} 1 2]
      3]
     [:sum
      {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930a"}
      [:field {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930b"} 2]]]))

(deftest ^:parallel split-part-position-must-be-positive-test
  (testing "split-part position must be a positive integer literal"
    (are [clause] (me/humanize (mr/explain :mbql.clause/split-part clause))
      [:split-part {:lib/uuid "00000000-0000-0000-0000-000000000000"} "a b" " " 0]
      [:split-part {:lib/uuid "00000000-0000-0000-0000-000000000000"} "a b" " " -1])
    (are [clause] (not (me/humanize (mr/explain :mbql.clause/split-part clause)))
      [:split-part {:lib/uuid "00000000-0000-0000-0000-000000000000"} "a b" " " 1]
      [:split-part {:lib/uuid "00000000-0000-0000-0000-000000000000"} "a b" " " 2])))

(deftest ^:parallel is-empty-not-empty-accept-string-expressions-test
  (testing "is-empty / not-empty accept string-typed expressions and string literals (#55687)"
    (are [clause] (mr/validate ::lib.schema.expression/boolean clause)
      [:is-empty  {:lib/uuid "00000000-0000-0000-0000-000000000000"} [:ltrim {:lib/uuid "00000000-0000-0000-0000-000000000001"} "AAA"]]
      [:is-empty  {:lib/uuid "00000000-0000-0000-0000-000000000000"} "AAA"]
      [:not-empty {:lib/uuid "00000000-0000-0000-0000-000000000000"} [:ltrim {:lib/uuid "00000000-0000-0000-0000-000000000001"} "AAA"]]
      [:not-empty {:lib/uuid "00000000-0000-0000-0000-000000000000"} "AAA"])))
