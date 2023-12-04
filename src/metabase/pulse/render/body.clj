(ns metabase.pulse.render.body
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [medley.core :as m]
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
   [metabase.util.ui-logic :as ui-logic]
   [schema.core :as s])
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
  [timezone-id :- (s/maybe s/Str)
   remapping-lookup
   cols
   rows
   viz-settings
   {:keys [bar-column min-value max-value]}]
  (let [formatters (into []
                         (map #(get-format timezone-id % viz-settings))
                         cols)]
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
      (query-results->row-seq
       timezone-id
       remapping-lookup
       cols
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

(defn- ->ts-viz
  "Include viz settings for the typed settings, initially in XY charts.
  These are actually completely different than the previous settings format inasmuch:
  1. The labels are in the settings
  2. Colors are in the series, only the whitelabel colors are here
  3. Many fewer things are optional
  4. Must explicitly have yAxisPosition in all the series

  For further details look at frontend/src/metabase/static-viz/XYChart/types.ts"
  [x-col y-col labels {::mb.viz/keys [column-settings] :as viz-settings}]
  (let [default-format {:number_style   "decimal"
                        :currency       "USD"
                        :currency_style "symbol"}
        x-col-settings (or (settings-from-column x-col column-settings) {})
        y-col-settings (or (settings-from-column y-col column-settings) {})
        x-format       (merge
                        (if (isa? (:effective_type x-col) :type/Temporal)
                          {:date_style "MMMM D, YYYY"}
                          default-format)
                        x-col-settings)
        y-format       (merge
                        default-format
                        y-col-settings)
        default-x-type (if (isa? (:effective_type x-col) :type/Temporal)
                         "timeseries"
                         "ordinal")]
    (merge
     {:colors                 (public-settings/application-colors)
      :stacking               (if (:stackable.stack_type viz-settings) "stack" "none")
      :x                      {:type   (or (:graph.x_axis.scale viz-settings) default-x-type)
                               :format x-format}
      :y                      {:type   (or (:graph.y_axis.scale viz-settings) "linear")
                               :format y-format}
      :labels                 labels
      :visualization_settings (or viz-settings {})}
     (when (:graph.show_goal viz-settings)
       {:goal {:value (:graph.goal_value viz-settings)
               :label (or (:graph.goal_label viz-settings) (tru "Goal"))}}))))

(defn- set-default-stacked
  "Default stack type is stacked for area chart with more than one metric.
   So, if :stackable.stack_type is not specified, it's stacked.
   However, if key is explicitly set in :stackable.stack_type and is nil, that indicates not stacked."
  [viz-settings card]
  (let [stacked     (if (contains? viz-settings :stackable.stack_type)
                      (= (:stackable.stack_type viz-settings) "stacked")
                      (and
                       (= (:display card) :area)
                       (or
                        (> (count (:graph.metrics viz-settings)) 1)
                        (> (count (:graph.dimensions viz-settings)) 1))))]
    (if stacked
      (assoc viz-settings :stackable.stack_type "stacked")
      viz-settings)))

(defn- x-and-y-axis-label-info
  "Generate the X and Y axis labels passed in as the `labels` argument
  to [[metabase.pulse.render.js-svg/waterfall]] and other similar functions for rendering charts with X and Y
  axes. Respects custom display names in `viz-settings`; otherwise uses `x-col` and `y-col` display names."
  [x-col y-col viz-settings]
  {:bottom (or (:graph.x_axis.title_text viz-settings)
               (:display_name x-col))
   :left   (or (:graph.y_axis.title_text viz-settings)
               (:display_name y-col))})

(defn- labels-enabled?
  "Returns `true` if `:graph.x_axis.labels_enabled` (or y_axis) is `true`, not present, or nil.
  The only time labels are not enabled is when the key is explicitly set to false."
  [viz-settings axis-key]
  (boolean (get viz-settings axis-key true)))

(defn- combo-label-info
  "X and Y axis labels passed into the `labels` argument needs to be different
  for combos specifically (as opposed to multiples)"
  [x-cols y-cols viz-settings]
  {:bottom (when (labels-enabled? viz-settings :graph.x_axis.labels_enabled)
             (or (:graph.x_axis.title_text viz-settings)
                 (:display_name (first x-cols))))
   :left   (when (labels-enabled? viz-settings :graph.y_axis.labels_enabled)
             (or (:graph.y_axis.title_text viz-settings)
                 (:display_name (first y-cols))))
   :right  (when (labels-enabled? viz-settings :graph.y_axis.labels_enabled)
             (or (:graph.y_axis.title_text viz-settings)
                 (:display_name (second y-cols))))})

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

(defn- overlap
  "calculate the overlap, a value between 0 and 1, of the numerical ranges given by `vals-a` and `vals-b`.
  This overlap value can be checked against `axis-group-threshold` to determine when columns can reasonably share a y-axis.
  Consider two ranges, with min and max values:

   min-a = 0                                 max-a = 43
     *-----------------------------------------*
                                                      min-b = 52             max-b = 75
                                                        *----------------------*
  The overlap above is 0. The mirror case where col-b is entirely less than col-a also has 0 overlap.
  Otherwise, overlap is calculated as follows:

     min-a = 0                                 max-a = 43
     *-----------------------------------------*
     |     min-b = 8                           |             max-b = 59
     |       *---------------------------------|---------------*
     |       |                                 |               |
     |       |- overlap-width = (- 43 8) = 35 -|               |
     |                                                         |
     |--------- max-width = (- 59 0) = 59 ---------------------|

  overlap = (/ overlap-width max-width) = (/ 35 59) = 0.59

  Another scenario, with a similar result may look as follows:

     min-a = 0                                                 max-a = 59
     *---------------------------------------------------------*
     |     min-b = 8                         max-b = 43        |
     |       *---------------------------------*               |
     |       |                                 |               |
     |       |- overlap-width = (- 43 8) = 35 -|               |
     |                                                         |
     |--------- max-width = (- 59 0) = 59 ---------------------|

  overlap = (/ overlap-width max-width) = (/ 35 59) = 0.59"
  [vals-a vals-b]
  (let [[min-a max-a] (-> vals-a sort ((juxt first last)))
        [min-b max-b] (-> vals-b sort ((juxt first last)))
        [a b c d]     (sort [min-a min-b max-a max-b])
        max-width     (- d a)
        overlap-width (- c b)]
    (/ (double overlap-width) (double max-width))))

(defn- nearness
  "Calculate the 'nearness' score for ranges specified by `vals-a` and `vals-b`.

  The nearness score is the percent of the total range that the 'valid range' covers IF,
  the outer point's distance to the nearest range end covers less of the total range.
  for visual:  *     *--------------*  <---- the 'pt' on the left is close enough."
  [vals-a vals-b]
  (let [[min-a max-a]          (-> vals-a sort ((juxt first last)))
        [min-b max-b]          (-> vals-b sort ((juxt first last)))]
    (cond
      (or (= min-a max-a) (= min-b max-b))
      (let [pt                (if (= min-a max-a) min-a min-b)
            [r1 r2]           (if (= min-a max-a) [min-b max-b] [min-a max-a])
            total-range       (- (max pt r2) (min pt r1))
            valid-range-score (/ (- r2 r1) total-range)
            outer-pt-score    (/ (min (abs (- pt r1))
                                      (abs (- pt r2)))
                                 total-range)]
        (if (>= valid-range-score outer-pt-score)
          (double valid-range-score)
          0))

      :else 0)))

(defn- axis-group-score
  "Calculate the axis grouping threshold value for the ranges specified by `vals-a` and `vals-b`.
  The threshold is defined as 'percent overlap', when the ranges overlap, or 'nearness' otherwise."
  [vals-a vals-b]
  (let [[min-a max-a] (-> vals-a sort ((juxt first last)))
        [min-b max-b] (-> vals-b sort ((juxt first last)))]
    (cond
      ;; any nils in the ranges means we can't compare them.
      (some nil? (concat vals-a vals-b)) 0

      ;; if either range is just a single point, and it's inside the other range,
      ;; we consider it overlapped. Not likely in practice, but could happen.
      (and (= min-a max-a) (<= min-b min-a max-b)) 1
      (and (= min-b max-b) (<= min-a min-b max-a)) 1

      ;; ranges overlap, let's calculate the percent overlap
      (or (<= min-a min-b max-a)
          (<= min-a max-b max-a)) (overlap vals-a vals-b)

      ;; no overlap, let's calculate a nearness value to use instead
      :else (nearness vals-a vals-b))))

(def default-combo-chart-types
  "Default chart type seq of combo graphs (not multiple graphs)."
  (conj (repeat "bar")
        "line"))

(defn- attach-image-bundle
  [image-bundle]
  {:attachments
   (when image-bundle
     (image-bundle/image-bundle->attachment image-bundle))

   :content
   [:div
    [:img {:style (style/style {:display :block
                                :width   :100%})
           :src   (:image-src image-bundle)}]]})

(defn- multiple-scalar-series
  [joined-rows _x-cols _y-cols _viz-settings]
  [(for [[row-val] (map vector joined-rows)]
     {:cardName      (first row-val)
      :type          :bar
      :data          [row-val]
      :yAxisPosition "left"
      :column        nil})])

(defn- render-multiple-scalars
  "When multiple scalar cards are combined, they render as a bar chart"
  [render-type card dashcard {:keys [viz-settings] :as data}]
  (let [multi-res    (pu/execute-multi-card card dashcard)
        cards        (cons card (map :card multi-res))
        multi-data   (cons data (map #(get-in % [:result :data]) multi-res))
        x-rows       (map :name cards) ;; Bar labels
        y-rows       (mapcat :rows multi-data)
        x-cols       [{:base_type :type/Text
                       :effective_type :type/Text}]
        y-cols       (select-keys (first (:cols data)) [:base_type :effective_type])
        series-seqs  (multiple-scalar-series (mapv vector x-rows (flatten y-rows)) x-cols y-cols viz-settings)
        labels       (combo-label-info x-cols y-cols viz-settings)
        settings     (->ts-viz (first x-cols) (first y-cols) labels viz-settings)]
    (attach-image-bundle (image-bundle/make-image-bundle render-type (js-svg/combo-chart series-seqs settings)))))

(defn- series-setting [viz-settings outer-key inner-key]
  (get-in viz-settings [:series_settings (keyword outer-key) inner-key]))

(def ^:private axis-group-threshold 0.33)

(defn- group-axes-at-once
  [joined-rows viz-settings]
  (let [;; a double-x-axis 'joined-row' looks like:
        ;; [["val on x-axis"         "grouping-key"] [series-val]] eg:
        ;; [["2016-01-01T00:00:00Z"  "Doohickey"   ] [9031.5578 ]]

        ;; a single-x-axis 'joined-row' looks like:
        ;; [[grouping-key] [series-val-1 series-val-2 ...]]
        joined-rows-map    (if (= (count (ffirst joined-rows)) 2)
                             ;; double-x-axis
                             (-> (group-by (fn [[[_ x2] _]] x2) joined-rows)
                                 (update-vals #(mapcat last %)))
                             ;; single-x-axis
                             (->> (:graph.metrics viz-settings)
                                  (map-indexed (fn [idx k]
                                                 [k (mapv #(get (second %) idx) joined-rows)]))
                                  (into {})))
        ;; map of group-key -> :left :right or nil
        starting-positions (into {} (for [k (keys joined-rows-map)]
                                      [k (or (keyword (series-setting viz-settings k :axis)) :unassigned)]))
        ;; map of position (:left :right or :unassigned) -> vector of assigned groups
        positions          (-> (group-by second starting-positions)
                               (update-vals #(mapv first %)))
        unassigned?        (contains? positions :unassigned)
        stacked?           (boolean (:stackable.stack_type viz-settings))]
    (cond
      ;; if the chart is stacked, splitting the axes doesn't make sense, so we always put every series :left
      stacked? (into {} (map (fn [k] [k :left]) (keys joined-rows-map)))

      ;; chart is not stacked, and there are some :unassigned series, so we try to group them
      unassigned?
      (let [lefts         (or (:left positions) [(first (:unassigned positions))])
            rights        (or (:right positions) [])
            to-group      (remove (set (concat lefts rights)) (:unassigned positions))
            score-fn      (fn [series-vals]
                            (into {} (map (fn [k]
                                            [k (axis-group-score (get joined-rows-map k) series-vals)])
                                          (keys joined-rows-map))))
            ;; with the first series assigned :left, calculate scores between that series and all other series
            scores        (score-fn (get joined-rows-map (first lefts)))
            ;; group the series by comparing the score for that series against the group threshold
            all-positions (apply (partial merge-with concat)
                                 (conj
                                  (for [k to-group]
                                    (if (> (get scores k) axis-group-threshold)
                                      {:left [k]}
                                      {:right [k]}))
                                  (-> positions (dissoc :unassigned) (assoc :left lefts))))]
        (into {} (apply concat (for [[pos ks] all-positions]
                                 (map (fn [k] [k pos]) ks)))))

      ;; all series already have positions assigned
      ;; This comes from the user explicitly setting left or right on the series in the UI.
      :else positions)))

(defn- single-x-axis-combo-series
  "This munges rows and columns into series in the format that we want for combo staticviz for literal combo displaytype,
  for a single x-axis with multiple y-axis."
  [chart-type joined-rows _x-cols y-cols {:keys [viz-settings] :as _data} card-name]
  (let [positions (group-axes-at-once joined-rows viz-settings)]
    (for [[idx y-col] (map-indexed vector y-cols)]
      (let [y-col-key      (:name y-col)
            card-type      (or (series-setting viz-settings y-col-key :display)
                               chart-type
                               (nth default-combo-chart-types idx))
            selected-rows  (mapv #(vector (ffirst %) (nth (second %) idx)) joined-rows)
            y-axis-pos     (get positions y-col-key "left")]
        {:cardName      card-name
         :type          card-type
         :data          selected-rows
         :yAxisPosition y-axis-pos
         :column        y-col}))))

(defn- double-x-axis-combo-series
  "This munges rows and columns into series in the format that we want for combo staticviz for literal combo displaytype,
  for a double x-axis, which has pretty materially different semantics for that second dimension, with single y-axis only.

  This mimics default behavior in JS viz, which is to group by the second dimension and make every group-by-value a series.
  This can have really high cardinality of series but the JS viz will complain about more than 100 already"
  [chart-type joined-rows x-cols _y-cols {:keys [viz-settings] :as _data} card-name]
  (let [grouped-rows (group-by #(second (first %)) joined-rows)
        groups       (keys grouped-rows)
        positions    (group-axes-at-once joined-rows viz-settings)]
    (for [[idx group-key] (map-indexed vector groups)]
      (let [row-group          (get grouped-rows group-key)
            selected-row-group (mapv #(vector (ffirst %) (first (second %))) row-group)
            card-type          (or (series-setting viz-settings group-key :display)
                                   chart-type
                                   (nth default-combo-chart-types idx))
            y-axis-pos         (get positions group-key)]
        {:cardName      card-name
         :type          card-type
         :data          selected-row-group
         :yAxisPosition y-axis-pos
         :column        (second x-cols)
         :breakoutValue group-key}))))

(defn- axis-row-fns
  [card data]
  [(or (ui-logic/mult-x-axis-rowfn card data) #(vector (first %)))
   (or (ui-logic/mult-y-axis-rowfn card data) #(vector (second %)))])

(defn- card-result->series
  "Helper function for `render-multiple-lab-chart` that turns a card query result into a series-settings map in the shape expected by `js-svg/combo chart` (and the combo-chart js code)."
  [result]
  (let [card            (:card result)
        data            (get-in result [:result :data])
        display         (:display card)
        [x-fn y-fn]     (axis-row-fns card data)
        enforced-type   (if (= display :scalar) :bar display)
        card-name       (:name card)
        viz-settings    (:visualization_settings card)
        joined-rows     (map (juxt x-fn y-fn)
                             (common/row-preprocess x-fn y-fn (:rows data)))
        [x-cols y-cols] ((juxt x-fn y-fn) (get-in result [:result :data :cols]))
        combo-series-fn (if (= (count x-cols) 1) single-x-axis-combo-series double-x-axis-combo-series)]
    (combo-series-fn enforced-type joined-rows x-cols y-cols viz-settings card-name)))

(defn- render-multiple-lab-chart
  "When multiple non-scalar cards are combined, render them as a line, area, or bar chart"
  [render-type card dashcard {:keys [viz-settings] :as data}]
  (let [multi-res         (pu/execute-multi-card card dashcard)
        ;; multi-res gets the other results from the set of multis.
        ;; we shove cards and data here all together below for uniformity's sake
        viz-settings      (set-default-stacked viz-settings card)
        multi-data        (cons data (map #(get-in % [:result :data]) multi-res))
        col-seqs          (map :cols multi-data)
        [x-fn y-fn]       (axis-row-fns card data)
        [[x-col] [y-col]] ((juxt x-fn y-fn) (first col-seqs))
        labels            (x-and-y-axis-label-info x-col y-col viz-settings)
        settings          (->ts-viz x-col y-col labels viz-settings)
        series-seqs       (map card-result->series (cons {:card card :result {:data data}} multi-res))]
    (attach-image-bundle (image-bundle/make-image-bundle render-type (js-svg/combo-chart series-seqs settings)))))

(defn- lab-image-bundle
  "Generate an image-bundle for a Line Area Bar chart (LAB)

  Use the combo charts for every chart-type in line area bar because we get multiple chart series for cheaper this way."
  [chart-type render-type _timezone-id card {:keys [cols rows viz-settings] :as data}]
  (let [rows            (replace-nils rows)
        x-axis-rowfn    (or (ui-logic/mult-x-axis-rowfn card data) #(vector (first %)))
        y-axis-rowfn    (or (ui-logic/mult-y-axis-rowfn card data) #(vector (second %)))
        x-rows          (filter some? (map x-axis-rowfn rows))
        y-rows          (filter some? (map y-axis-rowfn rows))
        joined-rows     (mapv vector x-rows y-rows)
        viz-settings    (set-default-stacked viz-settings card)
        [x-cols y-cols] ((juxt x-axis-rowfn y-axis-rowfn) (vec cols))
        enforced-type   (if (= chart-type :combo)
                          nil
                          chart-type)
        card-name       (:name card)
        ;; NB: There's a hardcoded limit of arity 2 on x-axis, so there's only the 1-axis or 2-axis case
        series-seqs     [(if (= (count x-cols) 1)
                           (single-x-axis-combo-series enforced-type joined-rows x-cols y-cols data card-name)
                           (double-x-axis-combo-series enforced-type joined-rows x-cols y-cols data card-name))]
        labels          (combo-label-info x-cols y-cols viz-settings)
        settings        (->ts-viz (first x-cols) (first y-cols) labels viz-settings)]
    (image-bundle/make-image-bundle
     render-type
     (js-svg/combo-chart series-seqs settings))))

(s/defmethod render :multiple
  [_ render-type _timezone-id card dashcard data]
  ((if (= :scalar (:display card))
     render-multiple-scalars
     render-multiple-lab-chart)
   render-type card dashcard data))

(s/defmethod render :line :- common/RenderedPulseCard
  [_ render-type timezone-id card _dashcard data]
  (attach-image-bundle (lab-image-bundle :line render-type timezone-id card data)))

(s/defmethod render :area :- common/RenderedPulseCard
  [_ render-type timezone-id card _dashcard data]
  (attach-image-bundle (lab-image-bundle :area render-type timezone-id card data)))

(s/defmethod render :bar :- common/RenderedPulseCard
  [_chart-type render-type timezone-id :- (s/maybe s/Str) card _dashcard data]
  (attach-image-bundle (lab-image-bundle :bar render-type timezone-id card data)))

(s/defmethod render :combo :- common/RenderedPulseCard
  [_chart-type render-type timezone-id :- (s/maybe s/Str) card _dashcard data]
  (attach-image-bundle (lab-image-bundle :combo render-type timezone-id card data)))

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
