(ns metabase.pulse.render.body
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [medley.core :as m]
   [metabase.models.timeline-event :as timeline-event]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.render.color :as color]
   [metabase.pulse.render.common :as common]
   [metabase.pulse.render.datetime :as datetime]
   [metabase.pulse.render.image-bundle :as image-bundle]
   [metabase.pulse.render.js-svg :as js-svg]
   [metabase.pulse.render.style :as style]
   [metabase.pulse.render.table :as table]
   [metabase.pulse.util :as pu]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (java.text DecimalFormat DecimalFormatSymbols)))

(set! *warn-on-reflection* true)

(def ^:private card-error-rendered-info
  "Default rendered-info map when there is an error running a card on the card run.
  Is a delay due to the call to `trs`."
  (delay {:attachments
          nil

          :content
          [:div {:style (style/style
                         (style/font-style)
                         {:color       style/color-error
                          :font-weight 700
                          :padding     :16px})}
           (trs "There was a problem with this question.")]}))

(def ^:private error-rendered-info
  "Default rendered-info map when there is an error displaying a card on the static viz side.
  Is a delay due to the call to `trs`."
  (delay {:attachments
          nil

          :content
          [:div {:style (style/style
                         (style/font-style)
                         {:color       style/color-error
                          :font-weight 700
                          :padding     :16px})}
           (trs "An error occurred while displaying this card.")]}))

(def rows-limit
  "Maximum number of rows to render in a Pulse image."
  10)

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Helper Fns                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn show-in-table?
  "Should this column be shown in a rendered table in a Pulse?"
  [{:keys [semantic_type visibility_type] :as _column}]
  (and (not (isa? semantic_type :type/Description))
       (not (contains? #{:details-only :retired :sensitive} visibility_type))))

;;; --------------------------------------------------- Formatting ---------------------------------------------------

(s/defn ^:private format-cell
  [timezone-id :- (s/maybe s/Str) value col visualization-settings]
  (cond
    (types/temporal-field? col)
    (datetime/format-temporal-str timezone-id value col)

    (number? value)
    (common/format-number value col visualization-settings)

    :else
    (str value)))

(s/defn ^:private get-format
  [timezone-id :- (s/maybe s/Str) col visualization-settings]
  (cond
    ;; for numbers, return a format function that has already computed the differences.
    ;; todo: do the same for temporal strings
    (types/temporal-field? col)
    #(datetime/format-temporal-str timezone-id % col visualization-settings)

    ;; todo integer columns with a unit
    (or (isa? (:effective_type col) :type/Number)
        (isa? (:base_type col) :type/Number))
    (common/number-formatter col visualization-settings)

    :else
    str))

;;; --------------------------------------------------- Rendering ----------------------------------------------------

(defn- create-remapping-lookup
  "Creates a map with from column names to a column index. This is used to figure out what a given column name or value
  should be replaced with"
  [cols]
  (into {}
        (for [[col-idx {:keys [remapped_from]}] (map vector (range) cols)
              :when remapped_from]
          [remapped_from col-idx])))

(defn- column-name
  "Returns first column name from a hierarchy of possible column names"
  [card col]
  (let [col-settings (-> (mb.viz/db->norm (:visualization_settings card))
                         ::mb.viz/column-settings
                         ;; field-ref keys can come in with additional stuff like :meta-data or unit maps,
                         ;; so we select only those keys we CAN use to match with by using select-keys
                         (update-keys #(select-keys % [::mb.viz/column-name ::mb.viz/field-id])))]
    (name (or (when-let [[_ id] (:field_ref col)]
                (get-in col-settings [{::mb.viz/field-id id} ::mb.viz/column-title]))
              (get-in col-settings [{::mb.viz/column-name (:name col)} ::mb.viz/column-title])
              (:display_name col)
              (:name col)))))

(defn- query-results->header-row
  "Returns a row structure with header info from `cols`. These values are strings that are ready to be rendered as HTML"
  [remapping-lookup card cols include-bar?]
  {:row       (for [maybe-remapped-col cols
                    :when              (show-in-table? maybe-remapped-col)
                    :let               [col (if (:remapped_to maybe-remapped-col)
                                              (nth cols (get remapping-lookup (:name maybe-remapped-col)))
                                              maybe-remapped-col)
                                        col-name (column-name card col)]
                    ;; If this column is remapped from another, it's already
                    ;; in the output and should be skipped
                    :when              (not (:remapped_from maybe-remapped-col))]
                (if (isa? ((some-fn :effective_type :base_type) col) :type/Number)
                  (common/map->NumericWrapper {:num-str col-name :num-value col-name})
                  col-name))
   :bar-width (when include-bar? 99)})

(defn- normalize-bar-value
  "Normalizes bar-value into a value between 0 and 100, where 0 corresponds to `min-value` and 100 to `max-value`"
  [bar-value min-value max-value]
  (float
   (/
    (* (- (double bar-value) min-value)
       100)
    (- max-value min-value))))

(s/defn ^:private query-results->row-seq
  "Returns a seq of stringified formatted rows that can be rendered into HTML"
  [timezone-id :- (s/maybe s/Str) remapping-lookup cols rows viz-settings {:keys [bar-column min-value max-value]}]
  (let [formatters (into [] (map #(get-format timezone-id % viz-settings)) cols)]
    (for [row rows]
      {:bar-width (some-> (and bar-column (bar-column row))
                          (normalize-bar-value min-value max-value))
       :row (for [[maybe-remapped-col maybe-remapped-row-cell fmt-fn] (map vector cols row formatters)
                  :when (and (not (:remapped_from maybe-remapped-col))
                             (show-in-table? maybe-remapped-col))
                  :let [[_formatter row-cell] (if (:remapped_to maybe-remapped-col)
                                                (let [remapped-index (get remapping-lookup (:name maybe-remapped-col))]
                                                  [(nth formatters remapped-index)
                                                   (nth row remapped-index)])
                                                [fmt-fn maybe-remapped-row-cell])]]
              (fmt-fn row-cell))})))

(s/defn ^:private prep-for-html-rendering
  "Convert the query results (`cols` and `rows`) into a formatted seq of rows (list of strings) that can be rendered as
  HTML"
  ([timezone-id :- (s/maybe s/Str) card data]
   (prep-for-html-rendering timezone-id card data {}))
  ([timezone-id :- (s/maybe s/Str) card {:keys [cols rows viz-settings]}
    {:keys [bar-column] :as data-attributes}]
   (let [remapping-lookup (create-remapping-lookup cols)]
     (cons
      (query-results->header-row remapping-lookup card cols bar-column)
      (query-results->row-seq timezone-id remapping-lookup cols
                              (take rows-limit rows)
                              viz-settings
                              data-attributes)))))

(defn- strong-limit-text [number]
  [:strong {:style (style/style {:color style/color-gray-3})} (h (common/format-number number))])

(defn- render-truncation-warning
  [row-limit row-count]
  (let [over-row-limit (> row-count row-limit)]
    (when over-row-limit
      [:div {:style (style/style {:padding-top :16px})}
       [:div {:style (style/style {:color          style/color-gray-2
                                   :padding-bottom :10px})}
        "Showing " (strong-limit-text row-limit)
        " of "     (strong-limit-text row-count)
        " rows."]])))

(defn- attached-results-text
  "Returns hiccup structures to indicate truncated results are available as an attachment"
  [render-type rows rows-limit]
  (when (and (not= :inline render-type)
             (< rows-limit (count rows)))
    [:div {:style (style/style {:color         style/color-gray-2
                                :margin-bottom :16px})}
     (trs "More results have been included as a file attachment")]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     render                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti render
  "Render a Pulse as `chart-type` (e.g. `:bar`, `:scalar`, etc.) and `render-type` (either `:inline` or `:attachment`)."
  {:arglists '([chart-type render-type timezone-id card dashcard data])}
  (fn [chart-type _ _ _ _ _] chart-type))

(defn- order-data [data viz-settings]
  (if (some? (::mb.viz/table-columns viz-settings))
    (let [[ordered-cols output-order] (qp.streaming/order-cols (:cols data) viz-settings)
          keep-filtered-idx           (fn [row] (if output-order
                                                  (let [row-v (into [] row)]
                                                    (for [i output-order] (row-v i)))
                                                  row))
          ordered-rows                (map keep-filtered-idx (:rows data))]
      [ordered-cols ordered-rows])
    [(:cols data) (:rows data)]))

(s/defmethod render :table :- common/RenderedPulseCard
  [_ render-type timezone-id :- (s/maybe s/Str) card _dashcard {:keys [rows viz-settings] :as data}]
  (let [[ordered-cols ordered-rows] (order-data data viz-settings)
        data                        (-> data
                                        (assoc :rows ordered-rows)
                                        (assoc :cols ordered-cols))
        table-body                  [:div
                                     (table/render-table
                                      (color/make-color-selector data viz-settings)
                                      (mapv :name ordered-cols)
                                      (prep-for-html-rendering timezone-id card data))
                                     (render-truncation-warning rows-limit (count rows))]]
    {:attachments
     nil

     :content
     (if-let [results-attached (attached-results-text render-type rows rows-limit)]
       (list results-attached table-body)
       (list table-body))}))

(def ^:private default-date-styles
  {:year "YYYY"
   :quarter "[Q]Q - YYYY"
   :minute-of-hour "m"
   :day-of-week "dddd"
   :day-of-month "d"
   :day-of-year "DDD"
   :week-of-year "wo"
   :month-of-year "MMMM"
   :quarter-of-year "[Q]Q"})

(def ^:private override-date-styles
  {"M/D/YYYY" {:month "M/YYYY"}
   "D/M/YYYY" {:month "M/YYYY"}
   "YYYY/M/D" {:month "YYYY/M"
               :quarter "YYYY - [Q]Q"}
   "MMMM D, YYYY" {:month "MMMM, YYYY"}
   "D MMMM, YYYY" {:month "MMMM, YYYY"}
   "dddd, MMMM D, YYYY" {:day "EEEE, MMMM d, YYYY"
                         :week "MMMM d, YYYY"
                         :month "MMMM, YYYY"}})

(defn- update-date-style
  [date-style unit {::mb.viz/keys [date-abbreviate date-separator]}]
  (let [unit (or unit :default)]
    (cond-> (or (get-in override-date-styles [date-style unit])
                (get default-date-styles unit)
                date-style)
      date-separator
      (str/replace #"/" date-separator)

      date-abbreviate
      (-> (str/replace #"MMMM" "MMM")
          (str/replace #"EEEE" "E")))))

(defn- backfill-currency
  [{:keys [number_style currency] :as settings}]
  (cond-> settings
    (and (= number_style "currency") (nil? currency))
    (assoc :currency "USD")))

(defn- update-col-for-js
  [col-settings col]
  (-> (m/map-keys (fn [k] (-> k name (str/replace #"-" "_") keyword)) col-settings)
      (backfill-currency)
      (u/update-if-exists :date_style update-date-style (:unit col) col-settings)))

(defn- settings-from-column
  [col column-settings]
  (-> (or (get column-settings {::mb.viz/field-id (:id col)})
          (get column-settings {::mb.viz/column-name (:name col)}))
      (update-col-for-js col)))

(defn- ->js-viz
  "Include viz settings for js.

  - there are some date overrides done from lib/formatting.js
  - chop off and underscore the nasty keys in our map
  - backfill currency to the default of USD if not present"
  [x-col y-col {::mb.viz/keys [column-settings] :as viz-settings}]
  (let [x-col-settings (settings-from-column x-col column-settings)
        y-col-settings (settings-from-column y-col column-settings)]
    (cond-> {:colors (public-settings/application-colors)
             :visualization_settings (or viz-settings {})}
      x-col-settings
      (assoc :x x-col-settings)
      y-col-settings
      (assoc :y y-col-settings))))

(defn- x-and-y-axis-label-info
  "Generate the X and Y axis labels passed in as the `labels` argument
  to [[metabase.pulse.render.js-svg/waterfall]] and other similar functions for rendering charts with X and Y
  axes. Respects custom display names in `viz-settings`; otherwise uses `x-col` and `y-col` display names."
  [x-col y-col viz-settings]
  {:bottom (or (:graph.x_axis.title_text viz-settings)
               (:display_name x-col))
   :left   (or (:graph.y_axis.title_text viz-settings)
               (:display_name y-col))})

(def ^:private colors
  "Colors to cycle through for charts. These are copied from https://stats.metabase.com/_internal/colors"
  ["#509EE3" "#88BF4D" "#A989C5" "#EF8C8C" "#F9D45C" "#F2A86F" "#98D9D9" "#7172AD" "#6450e3" "#4dbf5e"
   "#c589b9" "#efce8c" "#b5f95c" "#e35850" "#554dbf" "#bec589" "#8cefc6" "#5cc2f9" "#55e350" "#bf4d4f"
   "#89c3c5" "#be8cef" "#f95cd0" "#50e3ae" "#bf974d" "#899bc5" "#ef8cde" "#f95c67"])

(defn format-percentage
  "Format a percentage which includes site settings for locale. The first arg is a numeric value to format. The second
  is an optional string of decimal and grouping symbols to be used, ie \".,\". There will soon be a values.clj file
  that will handle this but this is here in the meantime."
  ([value]
   (format-percentage value (get-in (public-settings/custom-formatting) [:type/Number :number_separators])))
  ([value [decimal grouping]]
   (let [base "#,###.##%"
         fmt (if (or decimal grouping)
               (DecimalFormat. base (doto (DecimalFormatSymbols.)
                                      (cond-> decimal (.setDecimalSeparator decimal))
                                      (cond-> grouping (.setGroupingSeparator grouping))))
               (DecimalFormat. base))]
     (.format fmt value))))

(defn- donut-info
  "Process rows with a minimum slice threshold. Collapses any segments below the threshold given as a percentage (the
  value 25 for 25%) into a single category as \"Other\". "
  [threshold-percentage rows]
  (let [total                    (reduce + 0 (map second rows))
        threshold                (* total (/ threshold-percentage 100))
        {as-is true clump false} (group-by (comp #(> % threshold) second) rows)
        rows (cond-> as-is
               (seq clump)
               (conj [(tru "Other") (reduce (fnil + 0) 0 (map second clump))]))]
    {:rows        rows
     :percentages (into {}
                        (for [[label value] rows]
                          [label (if (zero? total)
                                   (tru "N/A")
                                   (format-percentage (/ value total)))]))}))

(defn- donut-legend
  [legend-entries]
  (letfn [(table-fn [entries]
            (into [:table {:style (style/style {:color       "#4C5773"
                                                :font-family "Lato, sans-serif"
                                                :font-size   "24px"
                                                :font-weight "bold"
                                                :box-sizing  "border-box"
                                                :white-space "nowrap"})}]
                  (for [{:keys [label percentage color]} entries]
                    [:tr {:style (style/style {:margin-right "12px"})}
                     [:td {:style (style/style {:color         color
                                                :padding-right "7px"
                                                :line-height   "0"})}
                      [:span {:style (style/style {:font-size   "2.875rem"
                                                   :line-height "0"
                                                   :position    "relative"
                                                   :top         "-4px"})} "•"]]
                     [:td {:style (style/style {:padding-right "30px"})}
                      label]
                     [:td percentage]])))]
    (if (< (count legend-entries) 8)
      (table-fn legend-entries)
      [:table (into [:tr]
                    (map (fn [some-entries]
                           [:td {:style (style/style {:padding-right  "20px"
                                                      :vertical-align "top"})}
                            (table-fn some-entries)])
                         (split-at (/ (count legend-entries) 2) legend-entries)))])))

(defn- replace-nils [rows]
  (mapv (fn [row]
          (if (nil? (first row))
            (assoc row 0 "(empty)")
            row))
        rows))

(s/defmethod render :categorical/donut :- common/RenderedPulseCard
  [_ render-type timezone-id :- (s/maybe s/Str) card _dashcard {:keys [rows cols viz-settings] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (common/graphing-column-row-fns card data)
        rows                        (map (juxt (comp str x-axis-rowfn) y-axis-rowfn)
                                         (common/row-preprocess x-axis-rowfn y-axis-rowfn (replace-nils rows)))
        slice-threshold             (or (get viz-settings :pie.slice_threshold)
                                        2.5)
        {:keys [rows percentages]}  (donut-info slice-threshold rows)
        legend-colors               (merge (zipmap (map first rows) (cycle colors))
                                           (update-keys (:pie.colors viz-settings) name))
        settings                    {:percent_visibility (:pie.percent_visibility viz-settings) :show_total (:pie.show_total viz-settings)}
        image-bundle                (image-bundle/make-image-bundle
                                     render-type
                                     (js-svg/categorical-donut rows legend-colors settings))
        {label-viz-settings :x}     (->js-viz (x-axis-rowfn cols) (y-axis-rowfn cols) viz-settings)]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]
      (donut-legend
       (mapv (fn [row]
               (let [label (first row)]
                 {:percentage (percentages (first row))
                  :color      (legend-colors (first row))
                  :label      (if (and (contains? label-viz-settings :date_style)
                                       (datetime/temporal-string? label))
                                (datetime/format-temporal-str
                                 timezone-id
                                 (first row)
                                 (x-axis-rowfn cols)
                                 viz-settings)
                                label)}))
             rows))]}))

(s/defmethod render :progress :- common/RenderedPulseCard
  [_ render-type _timezone-id _card _dashcard {:keys [cols rows viz-settings] :as _data}]
  (let [value        (ffirst rows)
        goal         (:progress.goal viz-settings)
        color        (:progress.color viz-settings)
        settings     (assoc
                      (->js-viz (first cols) (first cols) viz-settings)
                      :color color)
        ;; ->js-viz fills in our :x but we actually want that under :format key
        settings     (assoc settings :format (:x settings))
        image-bundle (image-bundle/make-image-bundle
                      render-type
                      (js-svg/progress value goal settings))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(defn dashcard-timeline-events
  "Look for a timeline and corresponding events associated with this dashcard."
  [{{:keys [collection_id] :as _card} :card}]
  (let [timelines (->> (t2/select :model/Timeline
                         :collection_id collection_id
                         :archived false))]
    (->> (t2/hydrate timelines :creator [:collection :can_write])
         (map #(timeline-event/include-events-singular % {:events/all? true})))))

(defn- add-dashcard-timeline-events
  "If there's a timeline associated with this card, add its events in."
  [card-with-data]
  (if-some [timeline-events (seq (dashcard-timeline-events card-with-data))]
    (assoc card-with-data :timeline_events timeline-events)
    card-with-data))

(s/defmethod render :isomorphic :- common/RenderedPulseCard
   [_
    render-type
    _timezone-id
    {card-viz-settings :visualization_settings :as card}
    {dashcard-viz-settings :visualization_settings :as dashcard}
    data]
  (let [combined-cards-results (pu/execute-multi-card card dashcard)
        cards-with-data        (map
                                   (comp
                                    add-dashcard-timeline-events
                                    (fn [c d] {:card c :data d}))
                                   (cons card (map :card combined-cards-results))
                                   (cons data (map #(get-in % [:result :data]) combined-cards-results)))
        dashcard-viz-settings  (or
                                   dashcard-viz-settings
                                   card-viz-settings)
        image-bundle           (image-bundle/make-image-bundle
                        render-type
                        (js-svg/isomorphic cards-with-data dashcard-viz-settings))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(s/defmethod render :gauge :- common/RenderedPulseCard
  [_chart-type render-type _timezone-id :- (s/maybe s/Str) card _dashcard data]
  (let [image-bundle (image-bundle/make-image-bundle
                      render-type
                      (js-svg/gauge card data))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(s/defmethod render :row :- common/RenderedPulseCard
  [_ render-type _timezone-id card _dashcard {:keys [rows cols] :as _data}]
  (let [viz-settings (get card :visualization_settings)
        data {:rows rows
              :cols cols}
        image-bundle   (image-bundle/make-image-bundle
                        render-type
                        (js-svg/row-chart viz-settings data))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(s/defmethod render :scalar :- common/RenderedPulseCard
  [_chart-type _render-type timezone-id _card _dashcard {:keys [cols rows viz-settings]}]
  (let [value (format-cell timezone-id (ffirst rows) (first cols) viz-settings)]
    {:attachments
     nil

     :content
     [:div {:style (style/style (style/scalar-style))}
      (h value)]
     :render/text (str value)}))

(s/defmethod render :smartscalar :- common/RenderedPulseCard
  [_chart-type _render-type timezone-id _card _dashcard {:keys [cols insights viz-settings]}]
  (letfn [(col-of-type [t c] (or (isa? (:effective_type c) t)
                                 ;; computed and agg columns don't have an effective type
                                 (isa? (:base_type c) t)))
          (where [f coll] (some #(when (f %) %) coll))
          (percentage [arg] (if (number? arg)
                              (format-percentage arg)
                              " - "))
          (format-unit [unit] (str/replace (name unit) "-" " "))]
    (let [[_time-col metric-col] (if (col-of-type :type/Temporal (first cols)) cols (reverse cols))

          {:keys [last-value previous-value unit last-change] :as _insight}
          (where (comp #{(:name metric-col)} :col) insights)]
      (if (and last-value previous-value unit last-change)
        (let [value           (format-cell timezone-id last-value metric-col viz-settings)
              previous        (format-cell timezone-id previous-value metric-col viz-settings)
              adj             (if (pos? last-change) (tru "Up") (tru "Down"))
              delta-statement (if (= last-value previous-value)
                                "No change"
                                (str adj " " (percentage last-change)))
              comparison-statement (str " vs. previous " (format-unit unit) ": " previous)]
          {:attachments nil
           :content     [:div
                         [:div {:style (style/style (style/scalar-style))}
                          (h value)]
                         [:p {:style (style/style {:color         style/color-text-medium
                                                   :font-size     :16px
                                                   :font-weight   700
                                                   :padding-right :16px})}
                          delta-statement
                          comparison-statement]]
           :render/text (str value "\n"
                             delta-statement
                             comparison-statement)})
        ;; In other words, defaults to plain scalar if we don't have actual changes
        {:attachments nil
         :content     [:div
                       [:div {:style (style/style (style/scalar-style))}
                        (h last-value)]
                       [:p {:style (style/style {:color         style/color-text-medium
                                                 :font-size     :16px
                                                 :font-weight   700
                                                 :padding-right :16px})}
                        (trs "Nothing to compare to.")]]
         :render/text (str (format-cell timezone-id last-value metric-col viz-settings)
                           "\n" (trs "Nothing to compare to."))}))))

(s/defmethod render :waterfall :- common/RenderedPulseCard
  [_ render-type _timezone-id card _dashcard {:keys [rows cols viz-settings] :as data}]
  (let [[x-axis-rowfn
         y-axis-rowfn] (common/graphing-column-row-fns card data)
        [x-col y-col]  ((juxt x-axis-rowfn y-axis-rowfn) cols)
        rows           (map (juxt x-axis-rowfn y-axis-rowfn)
                            (common/row-preprocess x-axis-rowfn y-axis-rowfn rows))
        labels         (x-and-y-axis-label-info x-col y-col viz-settings)
        waterfall-type (if (isa? (-> cols x-axis-rowfn :effective_type) :type/Temporal)
                         :timeseries
                         :categorical)
        show-total     (if (nil? (:waterfall.show_total viz-settings))
                         true
                         (:waterfall.show_total viz-settings))
        settings       (-> (->js-viz x-col y-col viz-settings)
                           (update :colors assoc
                                   :waterfallTotal (:waterfall.total_color viz-settings)
                                   :waterfallPositive (:waterfall.increase_color viz-settings)
                                   :waterfallNegative (:waterfall.decrease_color viz-settings))
                           (assoc :showTotal show-total)
                           (assoc :show_values (boolean (:graph.show_values viz-settings))))
        image-bundle   (image-bundle/make-image-bundle
                        render-type
                        (js-svg/waterfall rows
                                          labels
                                          settings
                                          waterfall-type))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(s/defmethod render :funnel :- common/RenderedPulseCard
  [_ render-type _timezone-id card _dashcard {:keys [rows cols viz-settings] :as data}]
  (let [[x-axis-rowfn
         y-axis-rowfn] (common/graphing-column-row-fns card data)
        rows           (map (juxt x-axis-rowfn y-axis-rowfn)
                            (common/row-preprocess x-axis-rowfn y-axis-rowfn rows))
        [x-col y-col]  cols
        settings       (as-> (->js-viz x-col y-col viz-settings) jsviz-settings
                         (assoc jsviz-settings :step    {:name   (:display_name x-col)
                                                         :format (:x jsviz-settings)}
                                :measure {:format (:y jsviz-settings)}))
        svg            (js-svg/funnel rows settings)
        image-bundle   (image-bundle/make-image-bundle render-type svg)]
    {:attachments
     (image-bundle/image-bundle->attachment image-bundle)

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))


(s/defmethod render :empty :- common/RenderedPulseCard
  [_ render-type _ _ _ _]
  (let [image-bundle (image-bundle/no-results-image-bundle render-type)]
    {:attachments
     (image-bundle/image-bundle->attachment image-bundle)

     :content
     [:div {:style (style/style {:text-align :center})}
      [:img {:style (style/style {:width :104px})
             :src   (:image-src image-bundle)}]
      [:div {:style (style/style
                     (style/font-style)
                     {:margin-top :8px
                      :color      style/color-gray-4})}
       (trs "No results")]]
     :render/text (trs "No results")}))

(s/defmethod render :attached :- common/RenderedPulseCard
  [_ render-type _ _ _ _]
  (let [image-bundle (image-bundle/attached-image-bundle render-type)]
    {:attachments
     (image-bundle/image-bundle->attachment image-bundle)

     :content
     [:div {:style (style/style {:text-align :center})}
      [:img {:style (style/style {:width :30px})
             :src   (:image-src image-bundle)}]
      [:div {:style (style/style
                     (style/font-style)
                     {:margin-top :8px
                      :color      style/color-gray-4})}
       (trs "This question has been included as a file attachment")]]}))

(s/defmethod render :unknown :- common/RenderedPulseCard
  [_ _ _ _ _ _]
  {:attachments
   nil

   :content
   [:div {:style (style/style
                  (style/font-style)
                  {:color       style/color-gold
                   :font-weight 700})}
    (trs "We were unable to display this Pulse.")
    [:br]
    (trs "Please view this card in Metabase.")]})

(s/defmethod render :card-error :- common/RenderedPulseCard
  [_ _ _ _ _ _]
  @card-error-rendered-info)

(s/defmethod render :render-error :- common/RenderedPulseCard
  [_ _ _ _ _ _]
  @error-rendered-info)
