(ns metabase.metabot.generated-dashboard
  "Materializes a Metabot-generated dashboard — a title, optional description, and
  positioned tiles carrying resolved legacy queries — into real content: the
  dashboard row, one dashboard question per tile, and the dashcards at their stored
  grid positions. Shared by the `save_entity` tool and the manual-save API so both
  paths create identical dashboards."
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.metabot.db :as metabot.db]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- place-tile!
  [dashboard-id conversation-id {:keys [name dataset-query display visualization-settings
                                        row col size-x size-y chart-id card-id]}]
  (let [card (when-not card-id
               (queries/create-card!
                {:name                   name
                 :dataset_query          dataset-query
                 :display                display
                 :visualization_settings (or visualization-settings {})
                 :dashboard_id           dashboard-id}
                {:id api/*current-user-id*}
                true
                false))]
    (metabot.db/insert-dashcard!
     {:dashboard_id dashboard-id
      :card_id      (or card-id (:id card))
      :row          row
      :col          col
      :size_x       size-x
      :size_y       size-y})
    (when (and card conversation-id chart-id)
      (metabot.db/link-card-to-conversation! (:id card) conversation-id chart-id))
    card))

(defn- check-tile-permissions! [{:keys [card-id dataset-query]}]
  (if card-id
    (let [card (api/read-check :model/Card card-id)]
      (api/check (nil? (:dashboard_id card))
                 [400 (tru "Question {0} belongs to another dashboard and cannot be placed on this one." card-id)]))
    (query-perms/check-run-permissions-for-query dataset-query)))

(defn- already-saved [conversation-id generated-id]
  (when (and conversation-id generated-id)
    (when-let [dash (metabot.db/saved-dashboard-for-conversation conversation-id generated-id)]
      {:dashboard dash :cards []})))

(defn- create! [{:keys [name description collection-id tiles conversation-id generated-id]}]
  (run! check-tile-permissions! tiles)
  (api/create-check :model/Dashboard {:collection_id collection-id})
  (let [[dash cards] (t2/with-transaction [_conn]
                       (let [dash (metabot.db/insert-dashboard!
                                   {:name          name
                                    :description   description
                                    :parameters    []
                                    :creator_id    api/*current-user-id*
                                    :collection_id collection-id})]
                         (when (and conversation-id generated-id)
                           (metabot.db/link-dashboard-to-conversation! (:id dash) conversation-id generated-id))
                         [dash (vec (keep #(place-tile! (:id dash) conversation-id %) tiles))]))]
    (events/publish-event! :event/dashboard-create {:object dash :user-id api/*current-user-id*})
    (doseq [card cards]
      (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*}))
    {:dashboard dash :cards cards}))

(defn materialize!
  "Create the dashboard `name`/`description` in `collection-id` (nil for the root
  collection) with one dashcard per tile, at the tile's `:row`/`:col`/`:size-x`/
  `:size-y` grid position. A tile with a `:card-id` places that existing saved
  question as-is; otherwise its `:name`, legacy `:dataset-query`, `:display`
  keyword and optional `:visualization-settings` become a new dashboard question, stamped with the conversation + chart
  origin when `conversation-id` and `:chart-id` are known; the dashboard itself is
  stamped with `conversation-id` + `generated-id` (the id `create_dashboard` gave it). Saving the same generated
  dashboard again returns the dashboard already saved from the conversation instead of creating a second one.
  Checks query/card and collection permissions first, publishes the create events after the transaction
  commits, and returns `{:dashboard :cards}` (the newly created cards only)."
  [{:keys [conversation-id generated-id] :as args}]
  (or (already-saved conversation-id generated-id)
      (create! args)))
