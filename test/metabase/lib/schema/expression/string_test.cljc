(ns metabase.lib.schema.expression.string-test
  (:require
   [clojure.test :refer [are deftest]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema]))

(comment metabase.lib.schema/keep-me)

(deftest ^:parallel concat-test
  (are [clause] (not (me/humanize (mc/explain :mbql.clause/concat clause)))
    [:concat {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"} "1" "2"]
    [:concat {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"} "1" "2" "3"]

    [:concat
     {:lib/uuid "47cac41f-6240-4623-9a73-448addfdc735"}
     [:field {:lib/uuid "e47d33bc-c89c-48af-bffe-842c815f930b"} 1]
     "2"]))
