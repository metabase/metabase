(ns metabase.queries.schema
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.regex :as u.regex]))

(def card-types
  "All acceptable card types.

  Previously (< 49), we only had 2 card types: question and model, which were differentiated using the boolean
  `dataset` column. Soon we'll have more card types (e.g: metric) and we will longer be able to use a boolean column
  to differentiate between all types. So we've added a new `type` column for this purpose.

  Migrating all the code to use `report_card.type` will be quite an effort, we decided that we'll migrate it
  gradually."
  #{:model :question :metric})

(mr/def ::card-type
  (into [:enum {:decode/json keyword
                :api/regex   (u.regex/re-or (map name card-types))}]
        card-types))
