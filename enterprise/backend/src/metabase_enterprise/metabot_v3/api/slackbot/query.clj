(ns metabase-enterprise.metabot-v3.api.slackbot.query
  "Ad-hoc query execution and visualization for slackbot."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.render.core :as channel.render]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private render-base-height-px
  "Base height in pixels for rendered PNGs. Width is calculated from aspect ratio."
  640)

(def ^:private render-padding-x-px
  "Horizontal padding in pixels applied to rendered PNGs."
  32)

(def ^:private display-aspect-ratios
  "Non-default aspect ratios (width:height) for display types, derived from dashboard card size defaults.
   Most display types use the default 2:1 ratio."
  {:pie       3/2  ; 12:8
   :waterfall 7/3  ; 14:6
   :sankey    8/5}) ; 16:10

(def ^:private default-aspect-ratio
  "Default aspect ratio when display type not found."
  2/1)

(defn- render-dimensions
  "Calculate render dimensions for a display type based on aspect ratios.
   Keeps height consistent at render-base-height-px and scales width by aspect ratio."
  [display]
  (let [aspect-ratio (get display-aspect-ratios (keyword display) default-aspect-ratio)
        render-width (long (* render-base-height-px aspect-ratio))]
    {:width  render-width
     :height render-base-height-px}))

(defn- throw-on-failed-query!
  [results]
  (when (= :failed (:status results))
    (throw (ex-info (or (:error results) "Query execution failed")
                    (select-keys results [:error :status])))))

(defn execute-adhoc-query
  "Execute an ad-hoc MBQL query in the context of Slackbot and return results."
  [query]
  (qp/process-query
   (-> query
       qp/userland-query-with-default-constraints
       (update :info merge {:executed-by api/*current-user-id*
                            :context     :slackbot}))))

(defn- generate-adhoc-png
  "Render query results to PNG."
  [results display]
  (let [adhoc-card {:display                display
                    :visualization_settings {}}
        {:keys [width]} (render-dimensions display)]
    (channel.render/render-adhoc-card-to-png
     adhoc-card
     results
     width
     {:channel.render/padding-x render-padding-x-px})))

(def ^:private supported-png-display-types
  "Display types that should render as PNG images rather than Slack tables."
  #{:smartscalar :gauge :progress
    :bar :line :area :combo :row :pie
    :scatter :boxplot :waterfall :funnel :sankey})

(defn generate-adhoc-output
  "Generate output for an ad-hoc query based on display type.
   Returns a map with :type (:table or :image) and :content.
   Always executes the query directly.

   - Chart display types (bar, line, pie, etc.) render as PNG
   - Table display (or nil) renders as native Slack table blocks"
  [query & {:keys [display]
            :or   {display :table}}]
  (let [display (keyword display)
        results (execute-adhoc-query query)]
    (throw-on-failed-query! results)
    (if (and (contains? supported-png-display-types display)
             (seq (get-in results [:data :rows])))
      {:type    :image
       :content (generate-adhoc-png results display)}
      {:type    :table
       :content (channel.render/format-results-as-table-blocks results)}))

;;; ------------------------------------------ Saved Card Visualization ----------------------------------------------------

(defn pulse-card-query-results
  "Execute a query for a saved card, returning results suitable for rendering."
  {:arglists '([card])}
  [{query :dataset_query, card-id :id}]
  ;; Use the same approach as pulse API - this works for accessible cards
  (binding [qp.perms/*card-id* card-id]
    (qp/process-query
     (qp/userland-query
      (assoc query
             :middleware {:process-viz-settings? true
                          :js-int-to-string?     false})
      {:executed-by api/*current-user-id*
       :context     :pulse
       :card-id     card-id}))))

(defn- render-saved-card-png
  "Render a saved card (already fetched from DB) and pre-fetched results to PNG bytes."
  [card results]
  (let [{:keys [width]} (render-dimensions (:display card))
        options          {:channel.render/include-title? false
                          :channel.render/padding-x      render-padding-x-px
                          :channel.render/padding-y      0}]
    ;; TODO: should we use the user's timezone for this?
    (channel.render/render-pulse-card-to-png (channel.render/defaulted-timezone card)
                                             card
                                             results
                                             width
                                             options)))

(defn generate-card-output
  "Generate output for a saved card based on its display type.
   Returns a map with :type (:table or :image), :content, and :card-name.

   - `table` and display types not supported by static viz render as native Slack table blocks
   - static viz chart types render as PNG"
  [card-id]
  (let [card      (t2/select-one :model/Card :id card-id)
        _         (when-not card
                    (throw (ex-info "Card not found" {:card-id card-id :type :card-not-found})))
        card-name (:name card)
        results   (pulse-card-query-results card)]
    (throw-on-failed-query! results)
    (if (and (-> card :display keyword supported-png-display-types)
             (seq (get-in results [:data :rows])))
      {:type      :image
       :content   (render-saved-card-png card results)
       :card-name card-name}
      {:type      :table
       :content   (channel.render/format-results-as-table-blocks results)
       :card-name card-name})))
