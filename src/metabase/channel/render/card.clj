(ns metabase.channel.render.card
  (:require
   [hiccup.core :refer [h]]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.image-bundle :as image-bundle]
   [metabase.channel.render.png :as png]
   [metabase.channel.render.style :as style]
   [metabase.channel.render.util :as render.util]
   [metabase.channel.urls :as urls]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.markdown :as markdown]
   [toucan2.core :as t2]))

;;; I gave these keys below namespaces to make them easier to find usages for but didn't use `metabase.channel.render` so
;;; we can keep this as an internal namespace you don't need to know about outside of the module.
(mr/def ::options
  "Options for Pulse (i.e. Alert/Dashboard Subscription) rendering."
  [:map
   [:channel.render/include-buttons?           {:description "default: false", :optional true} :boolean]
   [:channel.render/include-title?             {:description "default: false", :optional true} :boolean]
   [:channel.render/include-description?       {:description "default: false", :optional true} :boolean]
   [:channel.render/disable-links?             {:description "default: false", :optional true} :boolean]
   [:channel.render/include-inline-parameters? {:description "default: false", :optional true} :boolean]
   [:channel.render/padding-x                  {:description "default: 0, horizontal pixels around image", :optional true} [:maybe :int]]
   [:channel.render/padding-y                  {:description "default: 0, vertical pixels around image", :optional true} [:maybe :int]]])

(mr/def ::adhoc-card
  "Schema for an ad-hoc (unsaved) card."
  [:map
   [:display :keyword]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:name {:optional true} [:maybe :string]]])

(defn- card-href
  [card]
  (when-let [card-id (u/id card)]
    (h (urls/card-url card-id))))

(mu/defn- make-title-if-needed :- [:maybe ::body/RenderedPartCard]
  [render-type card dashcard options :- [:maybe ::options]]
  (when (:channel.render/include-title? options)
    (let [card-name    (or (-> dashcard :visualization_settings :visualization :settings :card.title)
                           (-> dashcard :visualization_settings :card.title)
                           (-> card :name))
          image-bundle (when (:channel.render/include-buttons? options)
                         (image-bundle/external-link-image-bundle render-type))
          title-href   (if dashcard
                         (urls/dashcard-url dashcard)
                         (card-href card))]
      {:attachments (when image-bundle
                      (image-bundle/image-bundle->attachment image-bundle))
       :content     [:table {:style (style/style {:margin-bottom   :2px
                                                  :border-collapse :collapse
                                                  :width           :100%})}
                     [:tbody
                      [:tr
                       [:td {:style (style/style {:padding :0
                                                  :margin  :0})}
                        [:a (cond-> {:style  (style/style (style/header-style))
                                     :target "_blank"
                                     :rel    "noopener noreferrer"}
                              (not (:channel.render/disable-links? options))
                              (assoc :href title-href))
                         (h card-name)]]
                       [:td {:style (style/style {:text-align :right})}
                        (when (:channel.render/include-buttons? options)
                          [:img {:style (style/style {:width :16px})
                                 :width 16
                                 :src   (:image-src image-bundle)}])]]]]})))

(mu/defn- make-description-if-needed :- [:maybe ::body/RenderedPartCard]
  [dashcard card options :- [:maybe ::options]]
  (when (:channel.render/include-description? options)
    (when-let [description (or (get-in dashcard [:visualization_settings :card.description])
                               (:description card))]
      {:attachments {}
       :content [:div {:style (style/style {:color style/color-text-medium
                                            :font-size :12px
                                            :margin-bottom :8px})}
                 (markdown/process-markdown description :html)]})))

(defn- has-lat-lng-columns?
  "True when the result has both a Latitude and a Longitude column (a coordinate-based map)."
  [cols]
  (and (render.util/any-col-of-type? cols :type/Latitude)
       (render.util/any-col-of-type? cols :type/Longitude)))

(defn- binned-lat-lng-columns?
  "True when both a Latitude and a Longitude column are binned (a grid map, per the frontend default)."
  [cols]
  (and (some #(and (render.util/col-of-type? % :type/Latitude) (get-in % [:binning_info :bin_width])) cols)
       (some #(and (render.util/col-of-type? % :type/Longitude) (get-in % [:binning_info :bin_width])) cols)))

(defn- effective-map-type
  "Resolve the effective `map.type` the way the frontend's getDefault does: an explicit setting, else
  inferred from the display type and columns. A `:map` with lat/long columns (or explicit lat/long column
  settings) is a coordinate map — NOT a region map — even if the result also has a State/Country column;
  it's a grid map when those lat/long columns are binned, otherwise a pin map. Returns
  \"pin\" / \"grid\" / \"region\" / \"heat\"."
  [display-type card maybe-dashcard {:keys [cols]}]
  (let [viz-settings (render.util/merged-viz-settings card maybe-dashcard)
        setting      (partial render.util/viz-setting viz-settings)]
    (or (setting "map.type")
        (case display-type
          :pin_map           "pin"
          (:state :country)  "region"
          (if (or (and (setting "map.latitude_column")
                       (setting "map.longitude_column"))
                  (has-lat-lng-columns? cols))
            (if (binned-lat-lng-columns? cols)
              "grid"
              "pin")
            "region")))))

(defn- map-chart-type
  "The static-viz chart type a map card renders as — `:region_map`, `:pin_map`, or `:grid_map` — or nil
  when the card isn't a map, or is one we can't render statically yet (heat maps, region maps whose region
  isn't defined). Mirrors the frontend's map-type defaulting, computing [[effective-map-type]] once for
  all three outcomes."
  [display-type card maybe-dashcard data]
  (if (= :pin_map display-type)
    :pin_map
    (when (#{:map :state :country} display-type)
      (case (effective-map-type display-type card maybe-dashcard data)
        "pin"    (when (= :map display-type)
                   :pin_map)
        "grid"   (when (= :map display-type)
                   :grid_map)
        ;; a region map is only renderable when its region key names GeoJSON we know about — built-in, or
        ;; a user-defined custom map (the latter is fetched at render time)
        "region" (when (body/region-map-region-key display-type card maybe-dashcard data)
                   :region_map)
        nil))))

(defn detect-pulse-chart-type
  "Determine the pulse (visualization) type of a `card`, e.g. `:scalar` or `:bar`."
  [{display-type :display card-name :name :as card} maybe-dashcard {:keys [cols rows] :as data}]
  (let [col-sample-count  (delay (count (take 3 cols)))
        row-sample-count  (delay (count (take 2 rows)))
        display-type      (or (render.util/visualizer-display-type maybe-dashcard) display-type)
        map-type          (map-chart-type display-type card maybe-dashcard data)]
    (letfn [(chart-type [tyype reason & args]
              (log/tracef "Detected chart type %s for Card %s because %s"
                          tyype (pr-str card-name) (apply format reason args))
              tyype)]
      (cond
        (or (empty? rows)
            ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
            (= [[nil]] (-> data :rows)))
        (chart-type :empty "there are no rows in results")

        map-type
        (chart-type map-type "card is a map renderable as %s" (name map-type))

        (#{:state :country} display-type)
        (chart-type nil "display-type is %s" display-type)

        (and (some? maybe-dashcard)
             (= false (render.util/is-visualizer-dashcard? maybe-dashcard))
             (pos? (count (dashboard-card/dashcard->multi-cards maybe-dashcard))))
        (chart-type :javascript_visualization "result has multiple card semantics, a multiple chart")

        ;; for scalar/smartscalar, the display-type might actually be :line, so we can't have line above
        (and (= false (render.util/is-visualizer-dashcard? maybe-dashcard))
             (not (contains? #{:progress :gauge :object} display-type))
             (= @col-sample-count @row-sample-count 1))
        (chart-type :scalar "result has one row and one column")

        (#{:scalar
           :gauge
           :table
           :object
           :funnel} display-type)
        (chart-type display-type "display-type is %s" display-type)

        (#{:smartscalar
           :progress
           :sankey
           :treemap
           :scalar
           :pie
           :scatter
           :boxplot
           :waterfall
           :row
           :line
           :area
           :bar
           :combo} display-type)
        (chart-type :javascript_visualization "display-type is javascript_visualization")

        (= :pivot display-type)
        (chart-type :pivot "display-type is pivot")

        :else
        (chart-type :table "no other chart types match")))))

(defn- is-attached?
  [card]
  ((some-fn :include_csv :include_xls) card))

(mu/defn- render-pulse-card-body :- ::body/RenderedPartCard
  [render-type
   timezone-id :- [:maybe :string]
   card
   dashcard
   {:keys [data error] :as results}]
  (try
    (when error
      (throw (ex-info (tru "Card has errors: {0}" error) (assoc results :card-error true))))
    (let [chart-type (or (detect-pulse-chart-type card dashcard data)
                         (when (is-attached? card)
                           :attached)
                         :unknown)]
      (log/debugf "Rendering pulse card with chart-type %s and render-type %s" chart-type render-type)
      (body/render chart-type render-type timezone-id card dashcard data))
    (catch Throwable e
      (let [data (ex-data e)]
        (cond
          (:render/too-large? data)
          (do
            (log/error "Pulse card query error: results too large")
            (body/render :card-error/results-too-large nil nil nil nil data))

          (:card-error data)
          (do
            (log/error e "Pulse card query error")
            (body/render :card-error nil nil nil nil nil))
          :else (do
                  (log/error e "Pulse card render error")
                  (body/render :render-error nil nil nil nil nil)))))))

(mu/defn error-rendered-part :- ::body/RenderedPartCard
  "The placeholder rendered-part shown when an individual card/part of a notification fails to
  render. Channels substitute this for a failed part so one failure degrades to an error box
  instead of breaking the whole alert/dashboard subscription."
  []
  (body/render :render-error nil nil nil nil nil))

(mu/defn render-pulse-card :- ::body/RenderedPartCard
  "Render a single `card` for a `Pulse` to Hiccup HTML. `result` is the QP results. Returns a map with keys

  - attachments
  - content (a hiccup form suitable for rendering on rich clients or rendering into an image)
  - render/text : raw text suitable for substituting on clients when text is preferable. (Currently slack uses this for
    scalar results where text is preferable to an image of a div of a single result."
  ([render-type timezone-id card dashcard results]
   (render-pulse-card render-type timezone-id card dashcard results nil))

  ([render-type
    timezone-id :- [:maybe :string]
    card
    dashcard
    results
    options     :- [:maybe ::options]]
   (let [{title             :content
          title-attachments :attachments} (make-title-if-needed render-type card dashcard options)
         {description :content}           (make-description-if-needed dashcard card options)
         {pulse-body       :content
          body-attachments :attachments
          text             :render/text}  (render-pulse-card-body render-type timezone-id card dashcard results)
         attachment-href                  (if dashcard
                                            (urls/dashcard-url dashcard)
                                            (card-href card))
         inline-parameters                (when (:channel.render/include-inline-parameters? options)
                                            (-> dashcard :visualization_settings :inline_parameters))]
     (cond-> {:attachments (merge title-attachments body-attachments)
              :content [:p
                        ;; Provide a horizontal scrollbar for tables that overflow container width.
                        ;; Surrounding <p> element prevents buggy behavior when dragging scrollbar.
                        [:div
                         [:a (cond-> {:target      "_blank"
                                      :rel         "noopener noreferrer"
                                      :style       (style/style
                                                    (style/section-style)
                                                    {:display         :block
                                                     :text-decoration :none})}
                               (not (:channel.render/disable-links? options))
                               (assoc :href attachment-href))
                          title
                          description
                          (when (seq inline-parameters)
                            [:div {:style (style/style {:padding-bottom :16px})}
                             (render.util/render-parameters inline-parameters)])
                          [:div {:class "pulse-body"
                                 :style (style/style {:overflow-x :auto ;; when content is wide enough, automatically show a horizontal scrollbar
                                                      :display :block
                                                      :margin  :16px})}
                           (if-let [more-results-message (body/attached-results-text render-type card)]
                             (conj more-results-message (list pulse-body))
                             pulse-body)]]]]}
       text (assoc :render/text text)))))

(mu/defn render-pulse-card-for-display
  "Same as `render-pulse-card` but isn't intended for an email, rather for previewing so there is no need for
  attachments"
  ([timezone-id card results]
   (render-pulse-card-for-display timezone-id card results nil))

  ([timezone-id card results options :- [:maybe ::options]]
   (:content (render-pulse-card :inline timezone-id card nil results options))))

(mu/defn render-pulse-section :- ::body/RenderedPartCard
  "Render a single Card section of a Pulse to a Hiccup form (representing HTML)."
  ([timezone-id part]
   (render-pulse-section timezone-id part {}))

  ([timezone-id
    {card :card, dashcard :dashcard, result :result, :as _part}
    options :- [:maybe ::options]]
   (log/with-context {:card_id (:id card)}
     (let [options                       (merge {:channel.render/include-title?       true
                                                 :channel.render/include-description? true
                                                 :channel.render/include-inline-parameters? true}
                                                options)
           {:keys [attachments content]} (render-pulse-card :attachment timezone-id card dashcard result options)]
       {:attachments attachments
        :content     [:div {:style (style/style {:margin-top    :20px
                                                 :margin-bottom :20px})}
                      content]}))))

(mu/defn render-pulse-card-to-png :- bytes?
  "Render a `pulse-card` as a PNG. `data` is the `:data` from a QP result."
  (^bytes [timezone-id pulse-card result width]
   (render-pulse-card-to-png timezone-id pulse-card result width nil))

  (^bytes [timezone-id :- [:maybe :string]
           pulse-card
           result
           width
           options :- [:maybe ::options]]
   (png/render-html-to-png (render-pulse-card :inline timezone-id pulse-card nil result options) width options)))

(mu/defn render-adhoc-card-to-png :- bytes?
  "Render an ad-hoc (unsaved) card to PNG."
  (^bytes [adhoc-card results width]
   (render-adhoc-card-to-png adhoc-card results width nil))

  (^bytes [adhoc-card :- ::adhoc-card
           results    :- [:map [:data :map]]
           width
           options    :- [:maybe ::options]]
   (let [timezone-id (qp.timezone/system-timezone-id)]
     (png/render-html-to-png
      (render-pulse-card :inline timezone-id adhoc-card nil results options)
      width
      options))))

(mu/defn render-pulse-card-to-base64 :- string?
  "Render a `pulse-card` as a PNG and return it as a base64 encoded string."
  ^String [timezone-id card dashcard result width]
  (-> (render-pulse-card :inline timezone-id card dashcard result)
      (png/render-html-to-png width)
      image-bundle/render-img-data-uri))

(mu/defn png-from-render-info :- bytes?
  "Create a PNG file (as a byte array) from rendering info."
  ^bytes [rendered-info :- ::body/RenderedPartCard width]
  ;; TODO huh? why do we need this indirection?
  (png/render-html-to-png rendered-info width))

(mu/defn defaulted-timezone :- :string
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card]
  (or (some->> card :database_id (t2/select-one :model/Database :id) qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))
