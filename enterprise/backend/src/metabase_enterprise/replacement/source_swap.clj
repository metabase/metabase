(ns metabase-enterprise.replacement.source-swap
  (:require
   [metabase-enterprise.replacement.swap.mbql :as swap.mbql]
   [metabase-enterprise.replacement.swap.native :as swap.native]
   [metabase-enterprise.replacement.swap.viz :as swap.viz]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::source-ref
  "A reference to a card or table, e.g. [:card 123] or [:table 45].

   Called 'source-ref' because these are things that can be a query's :source-card or
   :source-table. This is distinct from 'entity keys' in the dependency system —
   dashboards, transforms, etc. can *depend on* sources (and appear in `usages` output)
   but cannot themselves *be* sources."
  [:tuple
   [:enum :card :table]
   pos-int?])

(defn- update-query [query old-source new-source id-updates]
  (cond-> query
    (lib/any-native-stage? query)
    (swap.native/update-native-stages old-source new-source id-updates)

    (not (lib/native-only-query? query))
    (swap.mbql/update-mbql-stages old-source new-source id-updates)))

(defn- update-entity [entity-type entity-id old-source new-source]
  (case entity-type
    :card (let [card (t2/select-one :model/Card :id entity-id)]
            (when-let [query (:dataset_query card)]
              (let [new-query (-> query swap.mbql/normalize-query (update-query old-source new-source {}))
                    updated   (assoc card :dataset_query new-query)]
                (t2/update! :model/Card entity-id {:dataset_query new-query})
                (swap.viz/update-dashcards-column-settings! entity-id new-query old-source new-source)
                ;; TODO: not sure we really want this code to have to know about dependency tracking
                ;; TODO: publishing this event twice per update seems bad
                (events/publish-event! :event/card-dependency-backfill
                                       {:object updated}))))
    ;; TODO (eric 2026-02-13): Convert field refs in query.
    :transform (let [transform (t2/select-one :model/Transform :id entity-id)]
                 (when-let [query (get-in transform [:source :query])]
                   (let [new-query (-> query swap.mbql/normalize-query (update-query old-source new-source {}))]
                     (when (not= query new-query)
                       (t2/update! :model/Transform entity-id
                                   {:source (assoc (:source transform) :query new-query)})))))
    nil))

(mu/defn swap-source
  "Replace all usages of `old-source` with `new-source` across all dependent entities.

   Both arguments are [type id] pairs like [:card 123] or [:table 45].

   Example:
     (swap-source [:card 123] [:card 789])

   This finds all entities that depend on the old source and updates their queries
   to reference the new source instead.

   Returns {:swapped [...]} with the list of entities that were updated."
  [old-source :- ::source-ref
   new-source :- ::source-ref]
  (let [found-usages (usages/usages old-source)]
    (t2/with-transaction [_conn]
      (doseq [[entity-type entity-id] found-usages]
        (update-entity entity-type entity-id old-source new-source)))
    {:swapped (vec found-usages)}))

(defn swap-native-card-source!
  "Updates a single card's native query, replacing references to `old-card-id`
   with `new-card-id` in both the query text and template tags. Persists the
   change and publishes a dependency-backfill event."
  [card-id old-card-id new-card-id]
  (update-entity :card card-id [:card old-card-id] [:card new-card-id]))
