(ns metabase.metabot.generated-dashboard
  "Materializes a Metabot-generated dashboard — a title, optional description, and
  positioned tiles carrying resolved legacy queries — into real content: the
  dashboard row, one dashboard question per tile, and the dashcards at their stored
  grid positions. Shared by the `save_entity` tool and the manual-save API so both
  paths create identical dashboards."
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- place-tile!
  [dashboard-id conversation-id {:keys [name dataset_query display row col size_x size_y chart-id card-id]}]
  (let [card (when-not card-id
               (queries/create-card!
                {:name                   name
                 :dataset_query          dataset_query
                 :display                display
                 :visualization_settings {}
                 :dashboard_id           dashboard-id}
                {:id api/*current-user-id*}
                :delay-event
                false))]
    (t2/insert! :model/DashboardCard
                {:dashboard_id dashboard-id
                 :card_id      (or card-id (:id card))
                 :row          row
                 :col          col
                 :size_x       size_x
                 :size_y       size_y})
    (when (and card conversation-id chart-id)
      (t2/update! (t2/table-name :model/Card) (:id card)
                  {:metabot_conversation_id conversation-id
                   :metabot_chart_id        chart-id}))
    card))

(defn- check-tile-permissions! [{:keys [card-id dataset_query]}]
  (if card-id
    (api/read-check :model/Card card-id)
    (query-perms/check-run-permissions-for-query dataset_query)))

(defn materialize!
  "Create the dashboard `name`/`description` in `collection-id` (nil for the root
  collection) with one dashcard per tile, at the tile's `:row`/`:col`/`:size_x`/
  `:size_y` grid position. A tile with a `:card-id` places that existing saved
  question as-is; otherwise its `:name`, legacy `:dataset_query` and `:display`
  keyword become a new dashboard question, stamped with the conversation + chart
  origin when `conversation-id` and `:chart-id` are known. Checks query/card and
  collection permissions first, publishes the create events after the transaction
  commits, and returns `{:dashboard :cards}` (the newly created cards only)."
  [{:keys [name description collection-id tiles conversation-id]}]
  (run! check-tile-permissions! tiles)
  (api/create-check :model/Dashboard {:collection_id collection-id})
  (let [[dash cards] (t2/with-transaction [_conn]
                       (let [dash (first (t2/insert-returning-instances!
                                          :model/Dashboard
                                          {:name          name
                                           :description   description
                                           :parameters    []
                                           :creator_id    api/*current-user-id*
                                           :collection_id collection-id}))]
                         [dash (vec (keep #(place-tile! (:id dash) conversation-id %) tiles))]))]
    (events/publish-event! :event/dashboard-create {:object dash :user-id api/*current-user-id*})
    (doseq [card cards]
      (events/publish-event! :event/card-create {:object card :user-id api/*current-user-id*}))
    {:dashboard dash :cards cards}))
