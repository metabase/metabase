(ns metabase.queries.models.card.dependencies
  "Manual indexes that track which cards depend on which cards and tables."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(methodical/defmethod t2/table-name :model/Card->Table [_model] :report_card_table_deps)
(methodical/defmethod t2/table-name :model/Card->Card  [_model] :report_card_card_deps)

(doseq [model [:model/Card->Table :model/Card->Card]]
  (derive model :metabase/model)
  (derive model ::t2.disallow/update))

;;; ----------------------------------------------- API functions -----------------------------------------------------
(mu/defn cards-depending-on-table :- [:maybe [:set ::lib.schema.id/card]]
  "Given the ID of a table, returns the set of IDs of all cards which are known to depend on it.

  Returns nil if there are none."
  [table-id :- ::lib.schema.id/table]
  (t2/select-fn-set :card_id :model/Card->Table :table_id table-id))

(mu/defn cards-depending-on-card :- [:maybe [:set ::lib.schema.id/card]]
  "Given the ID of a card, returns the set of IDs of all cards which are known to depend on it.

  Returns nil if there are none."
  [upstream-card-id :- ::lib.schema.id/card]
  (t2/select-fn-set :downstream_card_id :model/Card->Card :upstream_card_id upstream-card-id))

(mr/def ::card-dependencies
  [:map
   [:cards  [:set ::lib.schema.id/card]]
   [:tables [:set ::lib.schema.id/table]]])

(defn- update-dependencies*!
  "Helper function used for updating both flavours of dependencies."
  [model downstream-col downstream-card-id upstream-col desired-upstream-ids]
  (let [current-upstream-ids (t2/select-fn-set upstream-col model
                                               downstream-col downstream-card-id)
        superfluous-deps (and current-upstream-ids
                              (not-empty (set/difference current-upstream-ids desired-upstream-ids)))
        missing-deps (not-empty (if current-upstream-ids
                                  (set/difference desired-upstream-ids current-upstream-ids)
                                  desired-upstream-ids))]
    (when (seq superfluous-deps)
      (t2/delete! model downstream-col downstream-card-id upstream-col [:in superfluous-deps]))
    (when (seq missing-deps)
      (t2/insert! model (into [] (for [missing missing-deps]
                                   {downstream-col downstream-card-id
                                    upstream-col   missing}))))
    (-> nil
        (m/assoc-some :removed-deps superfluous-deps)
        (m/assoc-some :added-deps missing-deps))))

(mu/defn- update-dependencies-on-cards! :- [:maybe [:map
                                                    [:removed-deps {:optional true} [:set ::lib.schema.id/card]]
                                                    [:added-deps {:optional true} [:set ::lib.schema.id/card]]]]
  "Removes any superfluous `:model/Card->Card` rows linking the downstream card to upstream cards it no longer depends
  on. Inserts any missing `:model/Card->Card` rows for cards it does depend on but which are not currently indexed.

  Expects to be called within a transaction!"
  [downstream-card-id   :- ::lib.schema.id/card
   desired-upstream-ids :- [:set ::lib.schema.id/card]]
  (update-dependencies*! :model/Card->Card
                         :downstream_card_id downstream-card-id
                         :upstream_card_id   desired-upstream-ids))

(mu/defn- update-dependencies-on-tables! :- [:maybe [:map
                                                     [:removed-deps {:optional true} [:set ::lib.schema.id/table]]
                                                     [:added-deps {:optional true} [:set ::lib.schema.id/table]]]]
  "Removes any superfluous `:model/Card->Card` rows linking the downstream card to upstream cards it no longer depends
  on. Inserts any missing `:model/Card->Card` rows for cards it does depend on but which are not currently indexed.

  Expects to be called within a transaction!"
  [downstream-card-id   :- ::lib.schema.id/card
   desired-upstream-ids :- [:set ::lib.schema.id/table]]
  (update-dependencies*! :model/Card->Table
                         :card_id  downstream-card-id
                         :table_id desired-upstream-ids))

(defn update-dependencies-for-card!
  "Given a card, look at its `:dataset_query` and make the `:model/Card->Card` and `:model/Card->Table` rows match
  up with this new card. Note that the `card` must have an `:id`!

  Runs any [[t2/delete!]]s or [[t2/update!]]s in a single transaction.  In fact, this needs to run in a transaction
  where dataset_query is updated.  Running in the ::card-event handler is not good.

  Returns nil."
  [{id    :id
    query :dataset_query
    :as _card}]
  (when (and id query)
    (let [all-sources (lib.util/collect-source-tables query)
          table-ids   (into #{} (filter number?) all-sources)
          card-ids    (into #{} (keep lib.util/legacy-string-table-id->card-id) all-sources)]
      (t2/with-transaction [_conn]
        (merge-with set/union
                    (update-dependencies-on-cards! id card-ids)
                    (update-dependencies-on-tables! id table-ids))))))

(derive :event/card-create ::card-event)
(derive :event/card-update ::card-event)
(methodical/defmethod events/publish-event! ::card-event
  [_topic {card    :object
           changes :changes}]
  ;; Only `:event/card-update` events have the `:changes`; if that key is missing then it's an `:event/card-create`.
  (when (or (nil? changes)                       ; `:event/card-create` has no `:changes`, and always updates deps.
            (contains? changes :dataset_query))  ; `:event/card-update` updates deps iff the `:dataset_query` changed.
    (update-dependencies-for-card! card)))

;; XXX: START HERE: Test the update-dependencies-for-card! functionality.
