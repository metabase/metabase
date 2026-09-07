(ns metabase.metabot.tools.create-dashboard
  "Tool that assembles previously-generated charts/queries into a dashboard definition.

  The dashboard is NOT persisted anywhere — like generated charts it lives only in
  agent memory (`shared/current-dashboards-state`) until the user asks to save it,
  at which point `save_entity` materializes it into a real dashboard. The model
  provides the tile order and optional coarse size hints; tiles are sized from their
  display type's defaults and placed with the shared dashboard autoplacer."
  (:require
   [clojure.string :as str]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.shared :as shared]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- agent-error! [msg]
  (throw (ex-info msg {:agent-error? true :status-code 400})))

(defn- readable-card [card-id]
  (let [card (t2/select-one :model/Card :id card-id :archived false)]
    (when-not (and card (mi/can-read? card))
      (agent-error!
       (tru "No saved question found with id `{0}` that you can read. Find questions with `search` first."
            card-id)))
    card))

(defn- validate-tile! [{chart-id :chart_id query-id :query_id card-id :card_id :as tile}]
  (when-not (= 1 (count (filter some? [chart-id query-id card-id])))
    (agent-error!
     (tru "Each tile must reference exactly one of `chart_id`, `query_id`, or `card_id`. Tile `{0}` does not."
          (:title tile))))
  (when card-id
    (readable-card card-id))
  (when (and chart-id (not (contains? (shared/current-charts-state) chart-id)))
    (agent-error!
     (tru "No generated chart found with id `{0}`. Available charts: [{1}]."
          chart-id
          (str/join ", " (keys (shared/current-charts-state))))))
  (when (and query-id (not (contains? (shared/current-queries-state) query-id)))
    (agent-error!
     (tru "No query found with id `{0}`. Available queries: [{1}]."
          query-id
          (str/join ", " (keys (shared/current-queries-state)))))))

(def ^:private tile-schema
  [:map {:closed true}
   [:chart_id {:optional true} [:maybe :string]]
   [:query_id {:optional true} [:maybe :string]]
   [:card_id {:optional true} [:maybe :int]]
   [:title [:string {:min 1}]]
   [:size {:optional true} [:maybe (into [:enum] (keys autoplace/size-hints))]]])

(def ^:private create-dashboard-schema
  [:map {:closed true}
   [:name [:string {:min 1}]]
   [:description {:optional true} [:maybe :string]]
   [:tiles [:vector {:min 1} tile-schema]]])

(defn- resolve-generated-chart [chart-id]
  (or (shared/resolve-generated-chart chart-id)
      (agent-error!
       (tru "The chart `{0}` has no resolvable query; recreate it before adding it to a dashboard."
            chart-id))))

(defn- resolve-tile
  [{chart-id :chart_id query-id :query_id card-id :card_id :keys [title size]}]
  (let [tile (cond
               card-id
               (let [card (readable-card card-id)]
                 {:title                  title
                  :display                (name (:display card))
                  :query                  (links/->legacy-mbql (:dataset_query card))
                  :visualization_settings (:visualization_settings card)
                  :card_id                card-id})

               chart-id
               (let [{:keys [query display]} (resolve-generated-chart chart-id)]
                 {:title    title
                  :display  (name display)
                  :query    (links/->legacy-mbql query)
                  :chart_id chart-id})

               :else
               {:title    title
                :display  "table"
                :query    (links/->legacy-mbql (get (shared/current-queries-state) query-id))
                :query_id query-id})]
    (assoc tile :size size)))

(defn- place-tiles
  "Give each resolved tile its grid position, in order, using the shared autoplacer:
  sized by the tile's display-type default unless a coarse `:size` hint was given."
  [tiles]
  (first
   (reduce (fn [[placed positions] {:keys [display size] :as tile}]
             (let [position (autoplace/get-position-for-new-dashcard positions (keyword display) size)]
               [(conj placed (merge (dissoc tile :size) (select-keys position [:row :col :size_x :size_y])))
                (conj positions position)]))
           [[] []]
           tiles)))

(defn- tile->state [{chart-id :chart_id query-id :query_id card-id :card_id :as tile}]
  (cond-> (select-keys tile [:title :row :col :size_x :size_y])
    chart-id (assoc :chart_id chart-id)
    query-id (assoc :query_id query-id)
    card-id  (assoc :card_id card-id)))

(defn- tile->definition [tile]
  (dissoc tile :query_id))

(mu/defn ^{:tool-name "create_dashboard"
           :scope     scope/agent-dashboard-create}
  create-dashboard-tool
  "Create a dashboard from charts and queries you already created in this conversation.

  Provide `tiles` in the exact order they should appear on the dashboard — the layout
  fills the grid top-left to bottom-right following your order. Each tile references
  exactly one of a `chart_id` (from `create_chart`), a `query_id` (from a query tool),
  or a `card_id` (the numeric id of an existing saved question, model, or metric you
  found with `search` or `read_resource`), and has a short human-friendly `title`.
  Saved questions are added as-is and stay linked to the original; charts and queries
  from this conversation become new questions when the dashboard is saved.

  Tiles are sized automatically from their chart type (e.g. a single number is small,
  a table is tall) and placed on the 24-column grid in your order. Optionally give a
  tile a coarse `size` hint when it deserves more room: `wide` (18 columns), `tall`
  (9 columns, 12 rows), or `full` (the whole width). You cannot control exact
  positions.

  You CANNOT edit a dashboard after creating it, so choose carefully what to include
  and get the order and sizing right in this single call.

  The dashboard is NOT saved anywhere yet — like charts, it exists only in this
  conversation until the user asks to save it; then call `save_entity` with the
  dashboard id this tool returns. Do not invent a URL for it; the dashboard is shown
  to the user in the conversation automatically."
  [{:keys [tiles description] dashboard-name :name} :- create-dashboard-schema]
  (try
    (run! validate-tile! tiles)
    (let [dashboard-id (str (random-uuid))
          positioned   (place-tiles (mapv resolve-tile tiles))
          dashboard    (cond-> {:dashboard_id dashboard-id
                                :name         dashboard-name
                                :tiles        (mapv tile->state positioned)}
                         description (assoc :description description))]
      (when shared/*memory-atom*
        (swap! shared/*memory-atom* memory/set-dashboard dashboard-id dashboard))
      {:output            (str "<result>\nCreated dashboard \"" dashboard-name "\" with "
                               (count tiles) " tiles. Its id is `" dashboard-id "`.\n</result>\n"
                               "<instructions>\nThe dashboard is displayed to the user. It is "
                               "not saved anywhere yet — offer to save it with `save_entity` "
                               "when the user asks. Do not fabricate a link to it.\n</instructions>")
       :structured-output (assoc dashboard :result-type :dashboard)
       :data-parts        [(streaming/generated-dashboard-part
                            {:id          dashboard-id
                             :title       dashboard-name
                             :description description
                             :tiles       (mapv tile->definition positioned)})]})
    (catch Exception e
      (log/errorf "Error creating dashboard: %s" (ex-message e))
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create dashboard: " (or (ex-message e) "Unknown error"))}))))
