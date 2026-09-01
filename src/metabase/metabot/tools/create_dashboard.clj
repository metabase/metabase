(ns metabase.metabot.tools.create-dashboard
  "Tool that assembles previously-generated charts/queries into a dashboard definition.

  The dashboard is NOT persisted anywhere — like generated charts it lives only in
  agent memory (`shared/current-dashboards-state`) until the user asks to save it,
  at which point `save_entity` materializes it into a real dashboard. The model
  provides the tile order and relative size hints; [[layout-tiles]] computes the
  concrete grid placement."
  (:require
   [clojure.string :as str]
   [metabase.dashboards.constants :as dashboard.constants]
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

(def ^:private grid-width dashboard.constants/grid-width)

(def ^:private min-tile-width 4)
(def ^:private max-tile-height 12)
(def ^:private min-tile-height 3)

(defn- clamp [n lo hi]
  (-> n (max lo) (min hi)))

(defn- group-into-rows [tiles]
  (reduce (fn [rows tile]
            (let [tile    (-> tile
                              (update :width clamp min-tile-width grid-width)
                              (update :height clamp min-tile-height max-tile-height))
                  current (peek rows)
                  used    (transduce (map :width) + 0 current)]
              (if (and (seq current) (> (+ used (:width tile)) grid-width))
                (conj rows [tile])
                (conj (pop rows) (conj current tile)))))
          [[]]
          tiles))

(defn- stretch-row [row]
  (let [total (transduce (map :width) + 0 row)
        extra (- grid-width total)
        grow  (map #(quot (* extra (:width %)) total) row)
        left  (- extra (reduce + grow))]
    (mapv (fn [tile g extra-col]
            (update tile :width + g extra-col))
          row
          grow
          (concat (repeat left 1) (repeat 0)))))

(defn layout-tiles
  "Compute concrete dashboard-grid positions for ordered tiles with `:width`/`:height`
  size hints. Tiles fill rows left-to-right in the given order; a tile that doesn't
  fit the current row starts a new one, and each row is stretched so its tiles span
  the full grid width while preserving their relative widths. Returns the tiles in
  order with `:row`, `:col`, `:size_x`, and `:size_y` added."
  [tiles]
  (loop [rows (group-into-rows tiles)
         y    0
         out  []]
    (if-let [row (seq (first rows))]
      (let [stretched  (stretch-row row)
            row-height (long (transduce (map :height) max 0 stretched))
            placed     (first
                        (reduce (fn [[acc x] tile]
                                  [(conj acc (assoc tile
                                                    :row y
                                                    :col x
                                                    :size_x (:width tile)
                                                    :size_y (:height tile)))
                                   (+ x (:width tile))])
                                [[] 0]
                                stretched))]
        (recur (rest rows)
               (+ y row-height)
               (into out placed)))
      out)))

(defn- agent-error! [msg]
  (throw (ex-info msg {:agent-error? true :status-code 400})))

(defn- readable-card [card-id]
  (let [card (t2/select-one :model/Card :id card-id :archived false)]
    (when-not (and card (mi/can-read? card))
      (agent-error!
       (tru "No saved question found with id `{0}` that you can read. Find questions with `search` first."
            card-id)))
    card))

(defn- validate-tile! [{:keys [chart_id query_id card_id] :as tile}]
  (when-not (= 1 (count (filter some? [chart_id query_id card_id])))
    (agent-error!
     (tru "Each tile must reference exactly one of `chart_id`, `query_id`, or `card_id`. Tile `{0}` does not."
          (:title tile))))
  (when card_id
    (readable-card card_id))
  (when (and chart_id (not (contains? (shared/current-charts-state) chart_id)))
    (agent-error!
     (tru "No generated chart found with id `{0}`. Available charts: [{1}]."
          chart_id
          (str/join ", " (keys (shared/current-charts-state))))))
  (when (and query_id (not (contains? (shared/current-queries-state) query_id)))
    (agent-error!
     (tru "No query found with id `{0}`. Available queries: [{1}]."
          query_id
          (str/join ", " (keys (shared/current-queries-state)))))))

(def ^:private tile-schema
  [:map {:closed true}
   [:chart_id {:optional true} [:maybe :string]]
   [:query_id {:optional true} [:maybe :string]]
   [:card_id {:optional true} [:maybe :int]]
   [:title [:string {:min 1}]]
   [:width [:int {:min 1 :max 24}]]
   [:height [:int {:min 1 :max 20}]]])

(def ^:private create-dashboard-schema
  [:map {:closed true}
   [:name [:string {:min 1}]]
   [:description {:optional true} [:maybe :string]]
   [:tiles [:vector {:min 1} tile-schema]]])

(defn- tile->state [{:keys [chart_id query_id card_id title row col size_x size_y]}]
  (cond-> {:title title :row row :col col :size_x size_x :size_y size_y}
    chart_id (assoc :chart_id chart_id)
    query_id (assoc :query_id query_id)
    card_id  (assoc :card_id card_id)))

(defn- tile->definition [{:keys [chart_id query_id card_id title row col size_x size_y]}]
  (let [position {:row row :col col :size_x size_x :size_y size_y}]
    (if card_id
      (let [card (readable-card card_id)]
        (merge {:title   title
                :display (name (:display card))
                :query   (links/->legacy-mbql (:dataset_query card))
                :card_id card_id}
               position))
      (let [chart (when chart_id (get (shared/current-charts-state) chart_id))
            query (if chart
                    (or (first (:queries chart))
                        (get (shared/current-queries-state) (:query_id chart)))
                    (get (shared/current-queries-state) query_id))]
        (when-not query
          (agent-error!
           (tru "The chart `{0}` has no resolvable query; recreate it before adding it to a dashboard."
                (or chart_id query_id))))
        (merge (cond-> {:title   title
                        :display (or (some-> (get-in chart [:visualization_settings :chart_type]) name)
                                     (some-> (get-in chart [:chart_config :display_type]) name)
                                     "table")
                        :query   (links/->legacy-mbql query)}
                 chart_id (assoc :chart_id chart_id))
               position)))))

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

  For each tile, suggest a size with `width` (grid columns, out of 24 total) and
  `height` (grid rows). Sizes are relative hints expressing how much space a tile
  deserves — give the most important or most detailed charts more space (e.g. 12x6 for
  a key trend, 24x9 for a wide table, 6x3 for a single number). The final layout is
  computed automatically to fill the grid while preserving your order and relative
  sizes; you cannot control exact positions. Tiles you want side by side should have
  widths that sum to about 24 and similar heights.

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
          positioned   (layout-tiles tiles)
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
