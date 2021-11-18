(ns metabase.pulse.render.body
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [hiccup.core :refer [h]]
            [medley.core :as m]
            [metabase.models.card :as cards]
            [metabase.public-settings :as public-settings]
            [metabase.pulse :as pulse]
            [metabase.pulse.render.color :as color]
            [metabase.pulse.render.common :as common]
            [metabase.pulse.render.datetime :as datetime]
            [metabase.pulse.render.image-bundle :as image-bundle]
            [metabase.pulse.render.js-svg :as js-svg]
            [metabase.pulse.render.sparkline :as sparkline]
            [metabase.pulse.render.style :as style]
            [metabase.pulse.render.table :as table]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.types :as types]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]])
  (:import [java.text DecimalFormat DecimalFormatSymbols]))

(def ^:private error-rendered-info
  "Default rendered-info map when there is an error displaying a card. Is a delay due to the call to `trs`."
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

(def cols-limit
  "Maximum number of columns to render in a Pulse image. Set to infinity, so that columns are not truncated.
  TODO: we should eventually remove the column limiting logic if it's not used anywhere."
  ##Inf)

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Helper Fns                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn show-in-table?
  "Should this column be shown in a rendered table in a Pulse?"
  [{:keys [semantic_type visibility_type] :as column}]
  (and (not (isa? semantic_type :type/Description))
       (not (contains? #{:details-only :retired :sensitive} visibility_type))))

(defn- count-displayed-columns
  "Return a count of the number of columns to be included in a table display"
  [cols]
  (count (filter show-in-table? cols)))


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
    #(datetime/format-temporal-str timezone-id % col)

    ;; todo integer columns with a unit
    (or (isa? (:effective_type col) :type/Number)
        (isa? (:base_type col) :type/Number))
    (common/number-formatter col visualization-settings)

    :else
    str))

;;; --------------------------------------------------- Rendering ----------------------------------------------------

(def ^:dynamic *render-img-fn*
  "The function that should be used for rendering image bytes. Defaults to `render-img-data-uri`."
  image-bundle/render-img-data-uri)

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
  (let [column-settings (some->> (get-in card [:visualization_settings :column_settings])
                                 (m/map-keys (comp vec json/parse-string name)))]
    (name (or (when-let [fr (:field_ref col)]
                (get-in column-settings [["ref" (mapv #(if (keyword? %) (name %) %) fr)] :column_title]))
              (get-in column-settings [["name" (:name col)] :column_title])
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
                  (common/->NumericWrapper col-name)
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
                  :let [[formatter row-cell] (if (:remapped_to maybe-remapped-col)
                                               (let [remapped-index (get remapping-lookup (:name maybe-remapped-col))]
                                                [(nth formatters remapped-index)
                                                 (nth row remapped-index)])
                                               [fmt-fn maybe-remapped-row-cell])]]
              (fmt-fn row-cell))})))

(s/defn ^:private prep-for-html-rendering
  "Convert the query results (`cols` and `rows`) into a formatted seq of rows (list of strings) that can be rendered as
  HTML"
  ([timezone-id :- (s/maybe s/Str) card data column-limit]
   (prep-for-html-rendering timezone-id card data column-limit {}))
  ([timezone-id :- (s/maybe s/Str) card {:keys [cols rows viz-settings]} column-limit
    {:keys [bar-column min-value max-value] :as data-attributes}]
   (let [remapping-lookup (create-remapping-lookup cols)
         limited-cols (take column-limit cols)]
     (cons
      (query-results->header-row remapping-lookup card limited-cols bar-column)
      (query-results->row-seq timezone-id remapping-lookup limited-cols
                              (take rows-limit rows)
                              viz-settings
                              data-attributes)))))

(defn- strong-limit-text [number]
  [:strong {:style (style/style {:color style/color-gray-3})} (h (common/format-number number))])

(defn- render-truncation-warning
  [col-limit col-count row-limit row-count]
  (let [over-row-limit (> row-count row-limit)
        over-col-limit (> col-count col-limit)]
    (when (or over-row-limit over-col-limit)
      [:div {:style (style/style {:padding-top :16px})}
       (cond

         (and over-row-limit over-col-limit)
         [:div {:style (style/style {:color          style/color-gray-2
                                     :padding-bottom :10px})}
          "Showing " (strong-limit-text row-limit)
          " of "     (strong-limit-text row-count)
          " rows and " (strong-limit-text col-limit)
          " of "     (strong-limit-text col-count)
          " columns."]

         over-row-limit
         [:div {:style (style/style {:color          style/color-gray-2
                                     :padding-bottom :10px})}
          "Showing " (strong-limit-text row-limit)
          " of "     (strong-limit-text row-count)
          " rows."]

         over-col-limit
         [:div {:style (style/style {:color          style/color-gray-2
                                     :padding-bottom :10px})}
          "Showing " (strong-limit-text col-limit)
          " of "     (strong-limit-text col-count)
          " columns."])])))

(defn- attached-results-text
  "Returns hiccup structures to indicate truncated results are available as an attachment"
  [render-type cols cols-limit rows rows-limit]
  (when (and (not= :inline render-type)
             (or (< cols-limit (count-displayed-columns cols))
                 (< rows-limit (count rows))))
    [:div {:style (style/style {:color         style/color-gray-2
                                :margin-bottom :16px})}
     (trs "More results have been included as a file attachment")]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     render                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti render
  "Render a Pulse as `chart-type` (e.g. `:bar`, `:scalar`, etc.) and `render-type` (either `:inline` or `:attachment`)."
  {:arglists '([chart-type render-type timezone-id card data])}
  (fn [chart-type _ _ _ _] chart-type))

(s/defmethod render :table :- common/RenderedPulseCard
  [_ render-type timezone-id :- (s/maybe s/Str) card {:keys [cols rows] :as data}]
  (let [table-body [:div
                    (table/render-table
                     (color/make-color-selector data (:visualization_settings card))
                     (mapv :name (:cols data))
                     (prep-for-html-rendering timezone-id card data cols-limit))
                    (render-truncation-warning cols-limit (count-displayed-columns cols) rows-limit (count rows))]]
    {:attachments
     nil

     :content
     (if-let [results-attached (attached-results-text render-type cols cols-limit rows rows-limit)]
       (list results-attached table-body)
       (list table-body))}))

(def ^:private default-date-styles
  {:year "YYYY"
   :quarter "[Q]Q - YYYY"
   :minute-of-hour "m"
   :day-of-week "dddd"
   :day-of-month "D"
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
   "dddd, MMMM D, YYYY" {:week "MMMM D, YYYY"
                         :month "MMMM, YYYY"}})

(defn- ->js-viz
  "Include viz settings for js.

  - there are some date overrides done from lib/formatting.js
  - chop off and underscore the nasty keys in our map
  - backfill currency to the default of USD if not present"
  [x-col y-col {::mb.viz/keys [column-settings] :as _viz-settings}]
  (letfn [(settings [col] (or (get column-settings {::mb.viz/field-id (:id col)})
                              (get column-settings {::mb.viz/column-name (:name col)})))
          (update-date-style [date-style unit]
            (let [unit (or unit :default)]
              (or (get-in override-date-styles [date-style unit])
                  (get-in default-date-styles [unit])
                  date-style)))
          (backfill-currency [{:keys [number_style currency] :as settings}]
            (cond-> settings
              (and (= number_style "currency") (nil? currency))
              (assoc :currency "USD")))
          (for-js [col-settings col]
            (-> (m/map-keys (fn [k] (-> k name (str/replace #"-" "_") keyword)) col-settings)
                (backfill-currency)
                (u/update-when :date_style update-date-style (:unit col))))]
    (let [x-col-settings (settings x-col)
          y-col-settings (settings y-col)]
      (cond-> {:colors (public-settings/application-colors)}
        x-col-settings
        (assoc :x (for-js x-col-settings x-col))
        y-col-settings
        (assoc :y (for-js y-col-settings y-col))))))

(defn- x-and-y-axis-label-info
  "Generate the X and Y axis labels passed in as the `labels` argument
  to [[metabase.pulse.render.js-svg/timelineseries-bar]] and other similar functions for rendering charts with X and Y
  axes. Respects custom display names in `viz-settings`; otherwise uses `x-col` and `y-col` display names."
  [x-col y-col viz-settings]
  {:bottom (or (:graph.x_axis.title_text viz-settings)
               (:display_name x-col))
   :left   (or (:graph.y_axis.title_text viz-settings)
               (:display_name y-col))})

(s/defmethod render :bar :- common/RenderedPulseCard
  [_ render-type _timezone-id :- (s/maybe s/Str) card {:keys [cols rows viz-settings] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (common/graphing-column-row-fns card data)
        rows                        (map (juxt x-axis-rowfn y-axis-rowfn)
                                         (common/non-nil-rows x-axis-rowfn y-axis-rowfn rows))
        [x-col y-col]               ((juxt x-axis-rowfn y-axis-rowfn) cols)
        labels                      (x-and-y-axis-label-info x-col y-col viz-settings)
        image-bundle                (image-bundle/make-image-bundle
                                     render-type
                                     (if (isa? (-> cols x-axis-rowfn :effective_type) :type/Temporal)
                                       (js-svg/timelineseries-bar rows labels
                                                                  (->js-viz x-col y-col viz-settings))
                                       (js-svg/categorical-bar rows labels
                                                               (->js-viz x-col y-col viz-settings))))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

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

(s/defmethod render :categorical/donut :- common/RenderedPulseCard
  [_ render-type _timezone-id :- (s/maybe s/Str) card {:keys [rows] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (common/graphing-column-row-fns card data)
        rows                        (map (juxt (comp str x-axis-rowfn) y-axis-rowfn)
                                         (common/non-nil-rows x-axis-rowfn y-axis-rowfn rows))
        slice-threshold             (or (get-in card [:visualization_settings :pie.slice_threshold])
                                        2.5)
        {:keys [rows percentages]}  (donut-info slice-threshold rows)
        legend-colors               (zipmap (map first rows) (cycle colors))
        image-bundle                (image-bundle/make-image-bundle
                                     render-type
                                     (js-svg/categorical-donut rows legend-colors))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]
      (into [:div {:style (style/style {:clear :both :width "540px" :color "#4C5773"})}]
            (for [label (map first rows)]
              [:div {:style (style/style {:float       :left :margin-right "12px"
                                          :font-family "Lato, sans-serif"
                                          :font-size   "24px"})}
               [:span {:style (style/style {:color (legend-colors label)})}
                "•"]
               [:span {:style (style/style {:margin-left "6px"})}
                label]
               [:span {:style (style/style {:margin-left "6px"})}
                (percentages label)]]))]}))

(s/defmethod render :multiple
  [_ render-type timezone-id card {:keys [cols rows viz-settings] :as data}]
  (let [multi-res (pulse/execute-multi card)
        bob       (println multires)]
  {:attachments nil :content nil}))

(s/defmethod render :scalar :- common/RenderedPulseCard
  [_ _ timezone-id _card {:keys [cols rows viz-settings] :as data}]
  (let [col             (first cols)
        value           (format-cell timezone-id (ffirst rows) (first cols) viz-settings)]
    {:attachments
     nil

     :content
     [:div {:style (style/style (style/scalar-style))}
      (h value)]
     :render/text (str value)}))

(s/defmethod render :smartscalar :- common/RenderedPulseCard
  [_ _ timezone-id _card {:keys [cols _rows insights viz-settings]}]
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
              adj             (if (pos? last-change) (tru "Up") (tru "Down"))]
          {:attachments nil
           :content     [:div
                         [:div {:style (style/style (style/scalar-style))}
                          (h value)]
                         [:p {:style (style/style {:color         style/color-text-medium
                                                   :font-size     :16px
                                                   :font-weight   700
                                                   :padding-right :16px})}
                          adj " " (percentage last-change) "."
                          " Was " previous " last " (format-unit unit)]]
           :render/text (str value "\n"
                             adj " " (percentage last-change) "."
                             " Was " previous " last " (format-unit unit))})
        @error-rendered-info))))

(s/defmethod render :sparkline :- common/RenderedPulseCard
  [_ render-type timezone-id card {:keys [_rows cols viz-settings] :as data}]
  (let [[x-axis-rowfn
         y-axis-rowfn] (common/graphing-column-row-fns card data)
        [x-col y-col]  ((juxt x-axis-rowfn y-axis-rowfn) cols)
        rows           (sparkline/cleaned-rows timezone-id card data)
        last-rows      (reverse (take-last 2 rows))
        values         (for [row last-rows]
                         (some-> row y-axis-rowfn common/format-number))
        labels         (datetime/format-temporal-string-pair timezone-id
                                                             (map x-axis-rowfn last-rows)
                                                             (x-axis-rowfn cols))
        render-fn      (if (isa? (-> cols x-axis-rowfn :effective_type) :type/Temporal)
                         js-svg/timelineseries-line
                         js-svg/categorical-line)
        image-bundle   (image-bundle/make-image-bundle
                        render-type
                        (render-fn (mapv (juxt x-axis-rowfn y-axis-rowfn) rows)
                                   (x-and-y-axis-label-info x-col y-col viz-settings)
                                   (->js-viz x-col y-col viz-settings)))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block
                                  :width   :100%})
             :src   (:image-src image-bundle)}]
      [:table
       [:tr
        [:td {:style (style/style {:color         style/color-text-dark
                                   :font-size     :24px
                                   :font-weight   700
                                   :padding-right :16px})}
         (first values)]
        [:td {:style (style/style {:color       style/color-gray-3
                                   :font-size   :24px
                                   :font-weight 700})}
         (second values)]]
       [:tr
        [:td {:style (style/style {:color         style/color-text-dark
                                   :font-size     :16px
                                   :font-weight   700
                                   :padding-right :16px})}
         (first labels)]
        [:td {:style (style/style {:color     style/color-gray-3
                                   :font-size :16px})}
         (second labels)]]]]}))

(s/defmethod render :waterfall :- common/RenderedPulseCard
  [_ render-type timezone-id card {:keys [rows cols viz-settings] :as data}]
  (let [[x-axis-rowfn
         y-axis-rowfn] (common/graphing-column-row-fns card data)
        [x-col y-col]  ((juxt x-axis-rowfn y-axis-rowfn) cols)
        rows           (map (juxt x-axis-rowfn y-axis-rowfn)
                            (common/non-nil-rows x-axis-rowfn y-axis-rowfn rows))
        last-rows      (reverse (take-last 2 rows))
        values         (for [row last-rows]
                         (some-> row y-axis-rowfn common/format-number))
        labels         (x-and-y-axis-label-info x-col y-col viz-settings)
        render-fn      (if (isa? (-> cols x-axis-rowfn :effective_type) :type/Temporal)
                         js-svg/timelineseries-waterfall
                         js-svg/categorical-waterfall)
        image-bundle   (image-bundle/make-image-bundle
                        render-type
                        (render-fn rows
                                   labels
                                   (->js-viz x-col y-col viz-settings)))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))


(s/defmethod render :empty :- common/RenderedPulseCard
  [_ render-type _ _ _]
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
       (trs "No results")]]}))

(s/defmethod render :attached :- common/RenderedPulseCard
  [_ render-type _ _ _]
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
  [_ _ _ _ _]
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

(s/defmethod render :error :- common/RenderedPulseCard
  [_ _ _ _ _]
  @error-rendered-info)
