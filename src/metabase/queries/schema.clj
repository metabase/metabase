(ns metabase.queries.schema
  (:require
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(p/import-vars
 [lib.schema.metadata
  card-types])

(mr/def ::card-type
  [:ref ::lib.schema.metadata/card.type])

(mr/def ::query
  [:multi
   {:dispatch (fn [x]
                (cond
                  (not (map? x)) ::not-map
                  (empty? x)     ::empty-map
                  :else          ::non-empty-map))}
   [::not-map       :map]
   [::empty-map     [:= {:description "empty map"} {}]]
   [::non-empty-map [:and
                     [:map
                      [:database ::lib.schema.id/database]]
                     [:multi
                      {:dispatch (fn [x]
                                   (if (:lib/type x)
                                     ::mbql5
                                     ::legacy))}
                      [::mbql5  ::lib.schema/query]
                      [::legacy ::mbql.s/Query]]]]])

(mr/def ::card
  [:map
   [:id            {:optional true} ::lib.schema.id/card]
   [:database_id   {:optional true} ::lib.schema.id/database]
   [:type          {:optional true} [:ref ::lib.schema.metadata/card.type]]
   [:dataset_query {:optional true} [:ref ::query]]])
