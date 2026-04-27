(ns metabase-enterprise.similarity.views.direct-dependency
  "Project every `:model/Dependency` row into `:model/SimilarEdge` with
   `:view :direct-dependency` and `:score 1.0`. Asymmetric — one row per source
   dependency row, preserving the original direction."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.similarity.scorer :as scorer]
   [toucan2.core :as t2]))

(defn- batch-projections
  "Reducible of `:model/SimilarEdge`-shaped maps over all `dependency` rows.
   Reads from the raw `dependency` table (rather than `:model/Dependency`) to
   keep this module decoupled from the dependencies module's exports."
  [now]
  (eduction
   (map (fn [{:keys [from_entity_type from_entity_id to_entity_type to_entity_id]}]
          {:from_entity_type  from_entity_type
           :from_entity_id    from_entity_id
           :to_entity_type    to_entity_type
           :to_entity_id      to_entity_id
           :view              :direct-dependency
           :score             1.0
           :contributing_data {:source "dependency" :metric nil}
           :last_computed_at  now}))
   (t2/reducible-query {:select [:from_entity_type :from_entity_id
                                 :to_entity_type :to_entity_id]
                        :from   [:dependency]})))

(defn- compute! [{:keys [batch-size] :or {batch-size 500}}]
  (let [now (t/offset-date-time)]
    (transduce (partition-all batch-size)
               (completing
                (fn [total batch]
                  (t2/insert! :model/SimilarEdge batch)
                  (+ total (count batch))))
               0
               (batch-projections now))))

(scorer/register-view! :direct-dependency
                       {:phase       :base
                        :typed-pairs :all-from-dependency
                        :compute!    compute!})
