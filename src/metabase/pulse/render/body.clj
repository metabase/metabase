(ns metabase.pulse.render.body
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [medley.core :as m]
   [metabase.formatter :as formatter]
   [metabase.models.timeline-event :as timeline-event]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.render.color :as color]
   [metabase.pulse.render.image-bundle :as image-bundle]
   [metabase.pulse.render.js-svg :as js-svg]
   [metabase.pulse.render.style :as style]
   [metabase.pulse.render.table :as table]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.common :as common]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.malli :as mu]
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

(mu/defn- format-cell
  [timezone-id :- [:maybe :string] value col visualization-settings]
  (cond
    (types/temporal-field? col)
    (formatter/format-temporal-str timezone-id value col)

    (number? value)
    (formatter/format-number value col visualization-settings)

    :else
    (str value)))

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
                  (formatter/map->NumericWrapper {:num-str col-name :num-value col-name})
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

(mu/defn- query-results->row-seq
  "Returns a seq of stringified formatted rows that can be rendered into HTML"
  [timezone-id :- [:maybe :string]
   remapping-lookup
   cols
   rows
   viz-settings
   {:keys [bar-column min-value max-value]}]
  (let [formatters (into []
                         (map #(formatter/create-formatter timezone-id % viz-settings))
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

(mu/defn- prep-for-html-rendering
  "Convert the query results (`cols` and `rows`) into a formatted seq of rows (list of strings) that can be rendered as
  HTML"
  ([timezone-id :- [:maybe :string]
    card
    data]
   (prep-for-html-rendering timezone-id card data {}))

  ([timezone-id :- [:maybe :string]
    card
    {:keys [cols rows viz-settings], :as _data}
    {:keys [bar-column] :as data-attributes}]
   (let [remapping-lookup (create-remapping-lookup cols)]
     (cons
      (query-results->header-row remapping-lookup card cols bar-column)
      (query-results->row-seq
       timezone-id
       remapping-lookup
       cols
       (take (min (public-settings/attachment-table-row-limit) 100) rows)
       viz-settings
       data-attributes)))))

(defn- strong-limit-text [number]
  [:strong {:style (style/style {:color style/color-gray-3})} (h (formatter/format-number number))])

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

(defn attached-results-text
  "Returns hiccup structures to indicate truncated results are available as an attachment"
  [render-type {:keys [include_csv include_xls]}]
  (when (and (not= :inline render-type)
             (or include_csv include_xls))
    [:div {:style (style/style {:color         style/color-gray-2
                                :margin-bottom :16px})}
     (trs "Results have been included as a file attachment")]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     render                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti render
  "Render a Pulse as `chart-type` (e.g. `:bar`, `:scalar`, etc.) and `render-type` (either `:inline` or `:attachment`)."
  {:arglists '([chart-type render-type timezone-id card dashcard data])}
  (fn [chart-type _render-type _timezone-id _card _dashcard _data]
    chart-type))

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

(mu/defmethod render :table :- formatter/RenderedPulseCard
  [_chart-type
   _render-type
   timezone-id :- [:maybe :string]
   card
   _dashcard
   {:keys [rows viz-settings format-rows?] :as unordered-data}]
  (let [[ordered-cols ordered-rows] (order-data unordered-data viz-settings)
        data                        (-> unordered-data
                                        (assoc :rows ordered-rows)
                                        (assoc :cols ordered-cols))
        table-body                  [:div
                                     (table/render-table
                                      (color/make-color-selector unordered-data viz-settings)
                                      {:cols-for-color-lookup (mapv :name ordered-cols)
                                       :col-names             (common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?)}
                                      (prep-for-html-rendering timezone-id card data))
                                     (render-truncation-warning (public-settings/attachment-table-row-limit) (count rows))]]
    {:attachments
     nil

     :content
     table-body}))

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

(mu/defmethod render :progress :- formatter/RenderedPulseCard
  [_chart-type
   render-type
   _timezone-id
   _card
   _dashcard
   {:keys [cols rows viz-settings] :as _data}]
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
  (let [timelines (t2/select :model/Timeline
                             :collection_id collection_id
                             :archived false)]
    (->> (t2/hydrate timelines :creator [:collection :can_write])
         (map #(timeline-event/include-events-singular % {:events/all? true})))))

(defn- add-dashcard-timeline-events
  "If there's a timeline associated with this card, add its events in."
  [card-with-data]
  (if-some [timeline-events (seq (dashcard-timeline-events card-with-data))]
    (assoc card-with-data :timeline_events timeline-events)
    card-with-data))

(mu/defmethod render :gauge :- formatter/RenderedPulseCard
  [_chart-type render-type _timezone-id :- [:maybe :string] card _dashcard data]
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

(mu/defmethod render :row :- formatter/RenderedPulseCard
  [_chart-type render-type _timezone-id card _dashcard {:keys [rows cols] :as _data}]
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

(defn- get-col-by-name
    [cols col-name]
    (->> (map-indexed (fn [idx m] [idx m]) cols)
         (some (fn [[idx col]]
                 (when (= col-name (:name col))
                   [idx col])))))

(mu/defmethod render :scalar :- formatter/RenderedPulseCard
  [_chart-type _render-type timezone-id _card _dashcard {:keys [cols rows viz-settings]}]
  (let [field-name    (:scalar.field viz-settings)
        [row-idx col] (or (when field-name
                            (get-col-by-name cols field-name))
                          [0 (first cols)])
        row           (first rows)
        raw-value     (get row row-idx)
        value         (format-cell timezone-id raw-value col viz-settings)]
    {:attachments
     nil

     :content
     [:div {:style (style/style (style/scalar-style))}
      (h value)]
     :render/text (str value)}))

(defn- raise-data-one-level
  "Raise the :data key inside the given result map up to the top level. This is the expected shape of `add-dashcard-timeline`."
  [{:keys [result] :as m}]
  (-> m
      (assoc :data (:data result))
      (dissoc :result)))

;; the `:javascript_visualization` render method
;; is and will continue to handle more and more 'isomorphic' chart types.
;; Isomorphic in this context just means the frontend Code is mostly shared between the app and the static-viz
;; As of 2024-03-21, isomorphic chart types include: line, area, bar (LAB), and trend charts
;; Because this effort began with LAB charts, this method is written to handle multi-series dashcards.
;; Trend charts were added more recently and will not have multi-series.
(mu/defmethod render :javascript_visualization :- formatter/RenderedPulseCard
  [_chart-type render-type _timezone-id card dashcard data]
  (let [series-cards-results                   (:series-results dashcard)
        cards-with-data                        (->> series-cards-results
                                                    (map raise-data-one-level)
                                                    (cons {:card card :data data})
                                                    (map add-dashcard-timeline-events)
                                                    (m/distinct-by #(get-in % [:card :id])))
        viz-settings                           (or (get dashcard :visualization_settings)
                                                   (get card :visualization_settings))
        {rendered-type :type content :content} (js-svg/javascript-visualization cards-with-data viz-settings)]
    (case rendered-type
      :svg
      (let [image-bundle (image-bundle/make-image-bundle
                          render-type
                          (js-svg/svg-string->bytes content))]
        {:attachments
         (when image-bundle
           (image-bundle/image-bundle->attachment image-bundle))

         :content
         [:div
          [:img {:style (style/style {:display :block :width :100%})
                 :src   (:image-src image-bundle)}]]})
      :html
      {:content [:div content] :attachments nil})))

(mu/defmethod render :smartscalar :- formatter/RenderedPulseCard
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

(defn- all-unique?
  [funnel-rows]
  (let [ks (into #{} (map :key) funnel-rows)]
    (= (count ks) (count funnel-rows))))

(defn- funnel-rows
  "Creates the expected row form for the javascript side of our funnel rendering.
  If funnel-viz exists, we want to use the value in :key as the first elem in the row.

  Eg. funnel-viz -> [{:key \"asdf\" :name \"Asdf\" :enabled true}
                     {:key \"wasd\" :name \"Wasd\" :enabled true}]
        raw-rows -> [[1 234] [2 5678]]

  Should become: [[\"asdf\" 234]
                  [\"wasd\" 5678]]

  Additionally, raw-rows can come in with strings already. In this case we want simply to re-order
  The raw-rows based on the order of the funnel-rows.

  Eg. funnel-viz -> [{:key \"wasd\" :name \"Wasd\" :enabled true}
                     {:key \"asdf\" :name \"Asdf\" :enabled true}]
        raw-rows ->  [[\"asdf\" 234] [\"wasd\" 5678]]

  Should become: [[\"wasd\" 5678]
                  [\"asdf\" 234]]"
  [funnel-viz raw-rows]
  (if (string? (ffirst raw-rows))
    ;; re-create the rows with the order/visibility specified in the funnel-viz
    (let [rows (into {} (vec raw-rows))]
      (for [{k        :key
             enabled? :enabled} funnel-viz
            :when               enabled?]
        [k (get rows k)]))
    ;; re-create the rows with the label/visibilty specified in the funnel-viz
    (let [rows-data (map (fn [{k :key enabled? :enabled} [_ value]]
                           (when enabled?
                             [k value])) funnel-viz raw-rows)]
      (remove nil? rows-data))))

(mu/defmethod render :funnel_normal :- formatter/RenderedPulseCard
  [_chart-type render-type _timezone-id card _dashcard {:keys [rows cols viz-settings] :as data}]
  (let [[x-axis-rowfn
         y-axis-rowfn] (formatter/graphing-column-row-fns card data)
        funnel-viz    (:funnel.rows viz-settings)
        raw-rows       (map (juxt x-axis-rowfn y-axis-rowfn)
                            (formatter/row-preprocess x-axis-rowfn y-axis-rowfn rows))
        rows          (if (and funnel-viz (all-unique? funnel-viz))
                         (funnel-rows funnel-viz raw-rows)
                         raw-rows)
        [x-col y-col] cols
        settings      (as-> (->js-viz x-col y-col viz-settings) jsviz-settings
                        (assoc jsviz-settings :step    {:name   (:display_name x-col)
                                                        :format (:x jsviz-settings)}
                               :measure {:format (:y jsviz-settings)}))
        svg           (js-svg/funnel rows settings)
        image-bundle  (image-bundle/make-image-bundle render-type svg)]
    {:attachments
     (image-bundle/image-bundle->attachment image-bundle)

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(mu/defmethod render :funnel :- formatter/RenderedPulseCard
  [_chart-type render-type timezone-id card dashcard data]
  (let [viz-settings (get card :visualization_settings)]
    (if (= (get viz-settings :funnel.type) "bar")
      (render :javascript_visualization render-type timezone-id card dashcard data)
      (render :funnel_normal render-type timezone-id card dashcard data))))

(mu/defmethod render :empty :- formatter/RenderedPulseCard
  [_chart-type render-type _timezone-id _card _dashcard _data]
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

(mu/defmethod render :attached :- formatter/RenderedPulseCard
  [_chart-type render-type _timezone-id _card _dashcard _data]
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

(mu/defmethod render :unknown :- formatter/RenderedPulseCard
  [_chart-type _render-type _timezone-id _card _dashcard _data]
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

(mu/defmethod render :card-error :- formatter/RenderedPulseCard
  [_chart-type _render-type _timezone-id _card _dashcard _data]
  @card-error-rendered-info)

(mu/defmethod render :render-error :- formatter/RenderedPulseCard
  [_chart-type _render-type _timezone-id _card _dashcard _data]
  @error-rendered-info)
