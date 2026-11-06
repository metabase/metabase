(ns metabase.lib.schema.analysis
  "The `:analysis` key of a query: the form its stages were built from. The stages are the query, and nothing in the
  query processor reads this. Every setting is a value, and the columns are the ones chosen when the analysis was
  made, so a change to a default or to the event table's roles can't change what a saved analysis says it is."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(mr/def ::columns
  "The event table's columns the analysis reads, by role."
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:timestamp ::common/non-blank-string]
   [:person    ::common/non-blank-string]
   [:session   [:maybe ::common/non-blank-string]]])

(mr/def ::date-range
  "The events an analysis reads. A relative range stays relative in the stages, so a saved analysis keeps rolling."
  [:multi {:dispatch :type, :decode/normalize common/normalize-map-no-kebab-case}
   ["relative" [:map {:closed true}
                [:type  [:= "relative"]]
                [:value [:int {:max 0}]]
                [:unit  [:enum "day" "week" "month" "quarter" "year"]]]]
   ["absolute" [:map {:closed true}
                [:type  [:= "absolute"]]
                [:start ::common/non-blank-string]
                [:end   ::common/non-blank-string]]]])

(mr/def ::filter
  "A filter clause on the event table, as the query builder's filter tools make it."
  [:ref ::expression/boolean])

(mr/def ::event
  "Which events count."
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:name    ::common/non-blank-string]
   [:filters [:sequential {:min 1} ::filter]]])

(mr/def ::habit.settings
  "Every setting of a habit analysis."
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:date_range ::date-range]
   [:grain      [:enum "person" "session"]]
   [:sub_period [:enum "day" "week"]]
   [:active     [:maybe ::event]]
   [:filters    [:sequential ::filter]]])

(mr/def ::analysis
  "The form a query's stages were built from, and the version of the compiler that built them."
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:version          [:= 1]]
   [:compiler_version pos-int?]
   [:kind             [:enum "habit"]]
   [:columns          [:ref ::columns]]
   [:settings         [:ref ::habit.settings]]])
