(ns metabase.query-permissions.row-restriction
  "Removing the fingerprints of Cards whose rows are narrowed for the current user, judged by the Tables each Card's
  query reads. This lives here rather than in `permissions` because telling which Tables those are takes the query
  processor."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.db :as query-permissions.db]
   [metabase.query-permissions.impl :as query-permissions.impl]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::card
  [:map {:closed false, ::mr/deliberately-open true, :description "a Card, with as many of its columns as its endpoint serves"}])

(mu/defn- cards-row-restricted? :- [:map-of ::lib.schema.id/card [:maybe :boolean]]
  "A map of the ID of each of `cards` to whether running it would be row-restricted for the current user, or to nil
  when that can't be told (see [[query-permissions.impl/query-row-restriction]]). A Card's `:dataset_query` is used
  when it has one, and loaded otherwise."
  [cards :- [:sequential [:map {:closed false, ::mr/deliberately-open true, :description "a Card"}
                          [:id ::lib.schema.id/card]]]]
  (let [unloaded (into #{} (comp (remove :dataset_query) (map :id)) cards)
        loaded   (when (seq unloaded)
                   (query-permissions.db/card-id->dataset-query unloaded))]
    (lib-be/with-metadata-provider-cache
      (into {}
            (map (fn [{:keys [id dataset_query]}]
                   [id (try
                         (:row-restricted? (query-permissions.impl/query-row-restriction (or dataset_query (loaded id))))
                         (catch Exception e
                           (log/debugf e "Could not tell whether Card %d is row-restricted" id)
                           nil))]))
            cards))))

(mu/defn remove-row-restricted-card-fingerprints :- [:sequential [:maybe ::card]]
  "`cards` without the `:fingerprint` of their `:result_metadata` columns when running the Card would be
  row-restricted for the current user, judged by the Tables its query reads. So an MBQL Card over open Tables keeps
  them even in a database with a sandboxed Table. A Card for which that can't be told (a native query at any depth,
  no `:id`, or a failure) is judged by its whole database. See [[perms/remove-row-restricted-card-fingerprints-with]].

  This preprocesses each Card in a restricted database, so it is for a Card's own endpoints, where the frontend uses
  the fingerprints. Lists use [[perms/remove-row-restricted-card-fingerprints-by-database]]."
  [cards :- [:maybe [:sequential [:maybe ::card]]]]
  (perms/remove-row-restricted-card-fingerprints-with
   cards
   (fn [candidates]
     (if-let [with-ids (seq (filter (comp pos-int? :id) candidates))]
       (cards-row-restricted? (vec with-ids))
       {}))))

(defn remove-row-restricted-fingerprints-from-card
  "[[remove-row-restricted-card-fingerprints]] for the single `card`, which may be nil."
  [card]
  (first (remove-row-restricted-card-fingerprints [card])))
