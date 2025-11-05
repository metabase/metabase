(ns metabase.lib.schema.expression.string-test
  (:require
   [clojure.test :refer [are deftest]]
   [malli.error :as me]
   [metabase.lib.schema]
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
