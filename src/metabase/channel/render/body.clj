(ns metabase.channel.render.body
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [h]]
   [medley.core :as m]
   [metabase.appearance.core :as appearance]
   [metabase.channel.render.image-bundle :as image-bundle]
   [metabase.channel.render.js.color :as js.color]
   [metabase.channel.render.js.svg :as js.svg]
   [metabase.channel.render.maps :as maps]
   [metabase.channel.render.style :as style]
   [metabase.channel.render.table :as table]
   [metabase.channel.render.table-data :as table-data]
   [metabase.channel.render.util :as render.util]
   [metabase.channel.settings :as channel.settings]
   [metabase.formatter.core :as formatter]
   [metabase.geojson.api :as geojson.api]
   [metabase.geojson.settings :as geojson.settings]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.pivot.core :as pivot.core]
   [metabase.pivot.postprocess :as pivot.postprocess]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.streaming.common :as streaming.common]
   [metabase.tiles.settings :as tiles.settings]
   [metabase.timeline.core :as timeline]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-trs trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.net URL)
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

(def ^:private error-rendered-message (deferred-trs "An error occurred while displaying this card."))

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
           error-rendered-message]}))

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; --------------------------------------------------- Formatting ---------------------------------------------------

(mu/defn- format-scalar-value
  [timezone-id :- [:maybe :string] value col visualization-settings]
  (cond
    ;; legacy usage -- do not use going forward
    #_{:clj-kondo/ignore [:deprecated-var]}
    (types/temporal-field? col)
    ((formatter/make-temporal-str-formatter timezone-id col {}) value)

    (number? value)
    (formatter/format-scalar-number value col visualization-settings)

    :else
    (str value)))

(defn get-color-from-segment
  "Returns the color of the first segment who's max is higher than value and min is lower than value"
  [viz-settings value]
  (let [{segments :scalar.segments} viz-settings
        ->min (fn [min] (if (number? min) min Double/NEGATIVE_INFINITY))
        ->max (fn [max] (if (number? max) max Double/POSITIVE_INFINITY))]
    (some (fn [{:keys [min max color]}]
            (when (<= (->min min) value (->max max))
              color))
          segments)))

;;; --------------------------------------------------- Rendering ----------------------------------------------------

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
  [remapping-lookup card cols]
  {:row
   (for [maybe-remapped-col cols
         :when              (table-data/show-in-table? maybe-remapped-col)
         :let               [col (if (:remapped_to maybe-remapped-col)
                                   (nth cols (get remapping-lookup (:name maybe-remapped-col)))
                                   maybe-remapped-col)
                             col-name (column-name card col)]
         ;; If this column is remapped from another, it's already
         ;; in the output and should be skipped
         :when              (not (:remapped_from maybe-remapped-col))]
     (if (isa? ((some-fn :effective_type :base_type) col) :type/Number)
       (formatter/map->NumericWrapper {:num-str col-name :num-value col-name})
       col-name))})

(mu/defn- query-results->row-seq
  "Returns a seq of stringified formatted rows that can be rendered into HTML"
  [timezone-id :- [:maybe :string] remapping-lookup cols rows viz-settings]
  (let [formatters (into [] (map #(formatter/create-formatter timezone-id % viz-settings)) cols)]
    (for [row rows]
      {:row (for [[maybe-remapped-col maybe-remapped-row-cell fmt-fn] (map vector cols row formatters)
                  :when (and (not (:remapped_from maybe-remapped-col))
                             (table-data/show-in-table? maybe-remapped-col))
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
    {:keys [cols rows viz-settings], :as _data}]
   (let [remapping-lookup (table-data/create-remapping-lookup cols)
         row-limit        (min (channel.settings/attachment-table-row-limit) 100)]
     (cons
      (query-results->header-row remapping-lookup card cols)
      (query-results->row-seq timezone-id remapping-lookup cols (take row-limit rows) viz-settings)))))

(defn- strong-limit-text [number]
  [:strong {:style (style/style {:color style/color-gray-3})} (h (formatter/format-scalar-number number))])

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

(mr/def ::RenderedPartCard
  "Schema used for functions that operate on pulse card contents and their attachments"
  [:map
   [:attachments {:optional true} [:maybe [:map-of :string (ms/InstanceOfClass URL)]]]
   [:content                      [:sequential :any]]
   [:render/text {:optional true} [:maybe :string]]])

(defmulti render
  "Render a Part as `chart-type` (e.g. `:bar`, `:scalar`, etc.) and `render-type` (either `:inline` or `:attachment`)."
  {:arglists '([chart-type render-type timezone-id card dashcard data])}
  (fn [chart-type _render-type _timezone-id _card _dashcard _data]
    chart-type))

(defn- order-data [data viz-settings]
  (if (some? (::mb.viz/table-columns viz-settings))
    (let [;; Deduplicate table-columns by name to handle duplicated viz settings
          deduped-table-columns       (->> (::mb.viz/table-columns viz-settings)
                                           (m/distinct-by ::mb.viz/table-column-name))
          deduped-viz-settings        (assoc viz-settings ::mb.viz/table-columns deduped-table-columns)
          [ordered-cols output-order] (qp.streaming/order-cols (:cols data) deduped-viz-settings)
          ;; table-columns from viz-settings only includes remapped columns, not the source columns
          santized-ordered-cols       (map #(dissoc % :remapped_from :remapped_to) ordered-cols)
          keep-filtered-idx           (fn [row] (if output-order
                                                  (let [row-v (into [] row)]
                                                    (for [i output-order] (row-v i)))
                                                  row))
          ordered-rows                (map keep-filtered-idx (:rows data))]
      [santized-ordered-cols ordered-rows])
    [(:cols data) (:rows data)]))

(defn- minibar-columns
  "Return a list of column definitions for which minibar charts are enabled"
  [cols viz-settings]
  (filter
   (fn [col] (get-in viz-settings [::mb.viz/column-settings
                                   {::mb.viz/column-name (:name col)}
                                   ::mb.viz/show-mini-bar]))
   cols))

(mu/defmethod render :table :- ::RenderedPartCard
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
        filtered-cols               (filter table-data/show-in-table? ordered-cols)
        minibar-cols                (minibar-columns (get-in unordered-data [:results_metadata :columns] []) viz-settings)
        table-body                  [:div
                                     (table/render-table
                                      (js.color/make-color-selector unordered-data viz-settings)
                                      {:cols-for-color-lookup (mapv :name filtered-cols)
                                       :col-names             (streaming.common/column-titles filtered-cols viz-settings format-rows?)}
                                      (prep-for-html-rendering timezone-id card data)
                                      filtered-cols
                                      viz-settings
                                      minibar-cols)
                                     (render-truncation-warning (channel.settings/attachment-table-row-limit) (count rows))]]
    {:content     table-body
     :attachments nil}))

(defn- blank-cell-value?
  "True when a raw cell value should render as an empty placeholder (nil, or a blank string)."
  [raw]
  (or (nil? raw) (and (string? raw) (str/blank? raw))))

(defn- object-detail-pairs
  "`[label value]` pairs for the prepared object-detail `row`: each column's display name paired with its
  formatted value; `value` is nil for missing cells (rendered as a muted \"Empty\" placeholder)."
  [timezone-id card cols row viz-settings]
  (let [formatters (mapv #(formatter/create-formatter timezone-id % viz-settings) cols)]
    (into []
          (map-indexed (fn [idx col]
                         (let [raw (nth row idx nil)]
                           [(column-name card col)
                            (when-not (blank-cell-value? raw)
                              ((nth formatters idx) raw))])))
          cols)))

(defn- object-detail-row
  "A single label/value `[:tr ...]` for the object-detail table; `last?` drops the bottom border."
  [label value label-style value-style last?]
  (let [border {:border-bottom (if last? 0 style/object-detail-border)}]
    [:tr
     [:td {:style (style/style label-style border)} (h label)]
     [:td {:style (style/style value-style border)}
      (if (nil? value)
        ;; Match the live viz: missing values show a muted "Empty" placeholder rather than a blank cell.
        [:span {:style (style/style (style/object-detail-empty-value-style))} (tru "Empty")]
        (h value))]]))

(mu/defmethod render :object :- ::RenderedPartCard
  [_chart-type
   _render-type
   timezone-id :- [:maybe :string]
   card
   _dashcard
   {:keys [rows viz-settings] :as unordered-data}]
  ;; Single-record key/value view: render the first row only (a static email can't paginate).
  (let [[ordered-cols ordered-rows] (order-data unordered-data viz-settings)
        {prepared-cols :cols
         prepared-rows :rows}        (table-data/prepare-table-data ordered-cols
                                                                    (take 1 ordered-rows)
                                                                    table-data/show-in-object-detail?)
        pairs                        (object-detail-pairs timezone-id card prepared-cols (first prepared-rows) viz-settings)
        row-count                    (count rows)
        last-idx                     (dec (count pairs))
        label-style                  (style/object-detail-label-style)
        value-style                  (style/object-detail-value-style)]
    {:attachments nil
     :content
     [:div {:style (style/style (style/section-style))}
      [:table {:style       (style/style (style/object-detail-table-style))
               :cellpadding "0"
               :cellspacing "0"}
       [:tbody
        (for [[idx [label value]] (m/indexed pairs)]
          (object-detail-row label value label-style value-style (= idx last-idx)))]]
      (when (> row-count 1)
        [:div {:style (style/style (style/object-detail-more-records-style))}
         (tru "Showing 1 of {0} records." row-count)])]}))

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
    (cond-> {:colors (appearance/application-colors)
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
   (format-percentage value (get-in (appearance/custom-formatting) [:type/Number :number_separators])))
  ([value [decimal grouping]]
   (let [base "#,###.##%"
         fmt (if (or decimal grouping)
               (DecimalFormat. base (doto (DecimalFormatSymbols.)
                                      (cond-> decimal (.setDecimalSeparator decimal))
                                      (cond-> grouping (.setGroupingSeparator grouping))))
               (DecimalFormat. base))]
     (.format fmt value))))

(defn- add-dashcard-timeline-events
  "If there's a timeline associated with this card, add its events in."
  [card-with-data]
  (if-some [timeline-events (seq (timeline/dashcard-timeline-events card-with-data))]
    (assoc card-with-data :timeline_events timeline-events)
    card-with-data))

(mu/defmethod render :gauge :- ::RenderedPartCard
  [_chart-type render-type _timezone-id :- [:maybe :string] card _dashcard data]
  (let [image-bundle (image-bundle/make-image-bundle
                      render-type
                      (js.svg/gauge card data))]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(defn- get-col-by-name
  [cols col-name]
  (->> (map-indexed vector cols)
       (some (fn [[idx col]]
               (when (= col-name (:name col))
                 [idx col])))))

(defn- raise-data-one-level
  "Raise the :data key inside the given result map up to the top level.
   This is the expected shape of `add-dashcard-timeline`."
  [{:keys [result] :as m}]
  (-> m
      (assoc :data (:data result))
      (dissoc :result)))

(mu/defmethod render :scalar :- ::RenderedPartCard
  [_chart-type _render-type timezone-id _card _dashcard {:keys [cols rows viz-settings]}]
  (let [field-name    (:scalar.field viz-settings)
        [row-idx col] (or (when field-name
                            (get-col-by-name cols field-name))
                          [0 (first cols)])
        row           (first rows)
        raw-value     (get row row-idx)
        value         (format-scalar-value timezone-id raw-value col viz-settings)
        color         (get-color-from-segment viz-settings raw-value)]
    {:attachments
     nil

     :content
     [:div {:style (style/style (style/scalar-style color))}
      (h value)]
     :render/text (str value)}))

(defn- series-cards-with-data
  "Take series results of dashcard and add timeline events"
  [dashcard card data]
  (->> (:series-results dashcard)
       (map raise-data-one-level)
       (cons {:card card :data data})
       ;; TODO - remove timeline event code for static viz as it was never officially added
       (map add-dashcard-timeline-events)
       (m/distinct-by #(get-in % [:card :id]))))

(defn region-map-region-key
  "Resolve the region key for a region map, mirroring the frontend `map.region` default: an explicit
  `map.region` setting, else a legacy `:state`/`:country` display, else inferred from a State/Country
  column. Returns the key only when it names a region we know about (built-in or a user-defined custom
  map); logical false otherwise, so non-region maps fall through to the table fallback. Note this does
  not fetch — it just checks the region is defined; the actual GeoJSON load happens at render time."
  [display-type card dashcard {:keys [cols]}]
  ;; Merge (dashcard overrides card) rather than `or`: a dashcard usually has an empty-but-present
  ;; :visualization_settings that would otherwise shadow the card's map.region.
  (let [viz-settings (render.util/merged-viz-settings card dashcard)
        region-key   (or (render.util/viz-setting viz-settings "map.region")
                         (case display-type :state "us_states" :country "world_countries" nil)
                         (cond
                           (render.util/any-col-of-type? cols :type/State)   "us_states"
                           (render.util/any-col-of-type? cols :type/Country) "world_countries"))]
    (and (geojson.settings/defined-region? region-key)
         region-key)))

(defn- png->rendered-part
  "Wrap PNG `byte[]` as a RenderedPartCard `<img>`."
  [render-type png-bytes]
  (let [image-bundle (image-bundle/make-image-bundle render-type png-bytes)]
    {:attachments
     (when image-bundle
       (image-bundle/image-bundle->attachment image-bundle))

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(defn- javascript-visualization->rendered-part
  "Turn the `{:type :svg/:html :content ...}` result of [[js.svg/*javascript-visualization*]] into a RenderedPartCard.
  SVG results are rasterized to a PNG `<img>`; HTML results are embedded as-is."
  [render-type {rendered-type :type content :content}]
  (case rendered-type
    :html {:content [:div content] :attachments nil}
    :svg  (png->rendered-part render-type (js.svg/svg-string->bytes content))))

;; the `:javascript_visualization` render method
;; is and will continue to handle more and more 'isomorphic' chart types.
;; Isomorphic in this context just means the frontend Code is mostly shared between the app and the static-viz
;; As of 2024-03-21, isomorphic chart types include: line, area, bar (LAB), and trend charts
;; Because this effort began with LAB charts, this method is written to handle multi-series dashcards.
;; Trend charts were added more recently and will not have multi-series.
(mu/defmethod render :javascript_visualization :- ::RenderedPartCard
  [_chart-type render-type _timezone-id card dashcard data]
  (let [cards-with-data  (series-cards-with-data dashcard card data)
        viz-settings     (or (get dashcard :visualization_settings)
                             (get card :visualization_settings))]
    (javascript-visualization->rendered-part
     render-type
     (js.svg/*javascript-visualization* cards-with-data viz-settings))))

(mu/defmethod render :region_map :- ::RenderedPartCard
  [_chart-type render-type timezone-id card dashcard data]
  ;; Resolve the display type the same way detection does, so a visualizer dashcard's display wins.
  (let [display-type (or (render.util/visualizer-display-type dashcard) (:display card))
        region-key   (region-map-region-key display-type card dashcard data)
        geojson      (some-> region-key geojson.api/region-geojson)]
    (if-not geojson
      ;; The region's GeoJSON couldn't be resolved (e.g. a custom map whose fetch failed); degrade to a
      ;; table of the data rather than emit an empty map.
      (render :table render-type timezone-id card dashcard data)
      (let [cards-with-data (series-cards-with-data dashcard card data)
            base-settings   (render.util/merged-viz-settings card dashcard)
            ;; Embed the resolved GeoJSON, and pin map.region to the resolved key so the bundle picks
            ;; the right projection even when the region was only an inferred default (never persisted).
            viz-settings    (-> base-settings
                                (dissoc :map.region "map.region")
                                (assoc "map.region" region-key
                                       "map._geojson" (:data geojson)
                                       "map._geojson_details" {:region_key  (:region_key geojson)
                                                               :region_name (:region_name geojson)}))]
        (javascript-visualization->rendered-part
         render-type
         (js.svg/*javascript-visualization* cards-with-data viz-settings))))))

(defn- number-at
  "The value of `row` at `idx` when it's a number, else nil."
  [row idx]
  (let [v (nth row idx nil)]
    (when (number? v)
      v)))

(defn- coordinate-col-index
  "Resolve a coordinate column's index, mirroring the frontend default: the named column if the setting is
  present, else the first column with semantic type `sem-type` (`:type/Latitude` / `:type/Longitude`)."
  [cols col-name sem-type]
  (or (when col-name (first (get-col-by-name cols col-name)))
      (first (keep-indexed (fn [i col]
                             (when (render.util/col-of-type? col sem-type)
                               i))
                           cols))))

(defn- coordinate-col-indexes
  "`[lat-idx lon-idx]` for a coordinate map, honoring the `map.latitude_column`/`map.longitude_column`
  settings, with semantic-type fallbacks."
  [cols setting]
  [(coordinate-col-index cols (setting "map.latitude_column") :type/Latitude)
   (coordinate-col-index cols (setting "map.longitude_column") :type/Longitude)])

(defn- metric-col-index
  "Resolve the metric column's index: the named column if set, else the first numeric column that isn't the
  lat/long column. Returns nil when there's no metric (the cells then render at a uniform colour)."
  [cols lat-idx lon-idx col-name]
  (or (when col-name (first (get-col-by-name cols col-name)))
      (first (keep-indexed (fn [i col]
                             (when (and (not= i lat-idx) (not= i lon-idx)
                                        (isa? (some-> (or (:semantic_type col) (:base_type col)) keyword)
                                              :type/Number))
                               i))
                           cols))))

(defn- column-bin-width
  "The bin width (degrees) for a binned coordinate column, or an inferred fallback from the row values."
  [col idx rows]
  (or (get-in col [:binning_info :bin_width])
      (let [vs (->> rows
                    (keep #(number-at % idx))
                    distinct
                    sort)]
        (some->> (map - (rest vs) vs)
                 (filter pos?)
                 seq
                 (apply min)))))

(mu/defmethod render :pin_map :- ::RenderedPartCard
  [_chart-type render-type timezone-id card dashcard {:keys [cols rows] :as data}]
  (let [viz-settings      (render.util/merged-viz-settings card dashcard)
        setting           (partial render.util/viz-setting viz-settings)
        [lat-idx lon-idx] (coordinate-col-indexes cols setting)
        points            (when (and lat-idx lon-idx)
                            (for [row   rows
                                  :let  [lat (number-at row lat-idx)
                                         lon (number-at row lon-idx)]
                                  :when (and lat lon)]
                              [lat lon]))]
    (if-let [png (when (seq points)
                   (maps/render-pin-map points {:tile-url (tiles.settings/map-tile-server-url)
                                                :pin-type (setting "map.pin_type")}))]
      (png->rendered-part render-type png)
      ;; No usable coordinates (mismatched columns, all nil, etc.) or the render failed — degrade to a
      ;; table of the data.
      (render :table render-type timezone-id card dashcard data))))

(mu/defmethod render :grid_map :- ::RenderedPartCard
  [_chart-type render-type timezone-id card dashcard {:keys [cols rows] :as data}]
  (let [viz-settings      (render.util/merged-viz-settings card dashcard)
        setting           (partial render.util/viz-setting viz-settings)
        [lat-idx lon-idx] (coordinate-col-indexes cols setting)
        metric-idx        (metric-col-index cols lat-idx lon-idx (setting "map.metric_column"))
        lat-bin           (when lat-idx (column-bin-width (nth cols lat-idx) lat-idx rows))
        lon-bin           (when lon-idx (column-bin-width (nth cols lon-idx) lon-idx rows))
        cells             (when (and lat-idx lon-idx lat-bin lon-bin)
                            (for [row   rows
                                  :let  [lat (number-at row lat-idx)
                                         lon (number-at row lon-idx)]
                                  :when (and lat lon)]
                              {:lat     lat
                               :lon     lon
                               :lat-bin lat-bin
                               :lon-bin lon-bin
                               :metric  (when metric-idx (number-at row metric-idx))}))]
    (if-let [png (when (seq cells)
                   (maps/render-grid-map cells {:tile-url (tiles.settings/map-tile-server-url)}))]
      (png->rendered-part render-type png)
      ;; No usable cells or the render failed — degrade to a table of the data.
      (render :table render-type timezone-id card dashcard data))))

;;; ------------------------------------------------ pivot tables ------------------------------------------------

(defn- setting-value
  "Look up `k` in a viz-settings map that may be keyed by either keywords or strings."
  [settings k]
  (or (get settings k) (get settings (name k))))

(defn- pivot-cell->str
  "Display string for an assembled pivot cell (a formatter wrapper, a plain string, or nil)."
  [x]
  (cond
    (nil? x)    ""
    (string? x) x
    :else       (or (:num-str x) (:text-str x) (str x))))

(defn- pivot->hiccup
  "Render the assembled 2D pivot `rows` (header row first, then data rows) as an HTML table. Cells are
  `white-space: nowrap` so the table takes whatever width it needs (the surrounding pulse body provides
  horizontal scrolling). `opts` may include `:color-selector` (from [[js.color/make-color-selector]]),
  `:left-width` (number of leading row-label columns), and `:measure-names` (ordered measure column names)
  to apply the card's conditional formatting to the measure value cells."
  [rows {:keys [color-selector left-width measure-names]}]
  (let [measure-count (max 1 (count measure-names))
        cell-bg       (fn [cell ^long c]
                        ;; value cells are NumericWrapper; map each value column back to its measure column
                        ;; so the matching conditional-formatting rule applies. Row highlighting is disabled
                        ;; for pivots (:table.pivot in pivot-table-content), so the row index is unused.
                        (when (and color-selector (formatter/NumericWrapper? cell))
                          (let [vpos (- c (long left-width))]
                            (when (nat-int? vpos)
                              (let [mname (nth measure-names (mod vpos measure-count))]
                                (js.color/get-background-color color-selector cell mname 0))))))]
    [:table {:style (style/style (style/pivot-table-style))}
     [:tbody
      (map-indexed
       (fn [r row]
         [:tr
          (map-indexed
           (fn [c cell]
             (let [header? (zero? r)
                   label?  (and (pos? r) (zero? c))
                   bg      (cell-bg cell c)]
               [(if (or header? label?) :th :td)
                {:style (style/style (style/pivot-cell-style header? label? bg))}
                (h (pivot-cell->str cell))]))
           row)])
       rows)]]))

(defn- pivot-table-content
  "Assemble a `:pivot` card's flat (pivot-grouping) result into a Hiccup pivot table, or nil if it can't be
  assembled — no column split, a native pivot without a pivot-grouping column, etc. Reuses the pivot-export
  assembly ([[pivot.postprocess/build-pivot-output]] + [[pivot.core]]) and the row/col/measure indices the
  pivot QP already computed in `:pivot-export-options`."
  [card dashcard {:keys [cols pivot-export-options] :as data}]
  (let [settings (merge (:visualization_settings card) (:visualization_settings dashcard))
        split    (setting-value settings :pivot_table.column_split)
        pg-idx   (pivot.postprocess/pivot-grouping-index (mapv :name cols))]
    (when (and split pivot-export-options pg-idx)
      (let [columns  (pivot.core/columns-without-pivot-group cols)
            row-idxs (vec (:pivot-rows pivot-export-options))
            col-idxs (vec (:pivot-cols pivot-export-options))
            ;; The pivot QP only fills :pivot-measures when the split's measure names resolve to result
            ;; columns; when they don't (e.g. a casing mismatch) default to every non row/col column,
            ;; mirroring pivot.postprocess/add-pivot-measures.
            val-idxs (if-let [measures (seq (:pivot-measures pivot-export-options))]
                       (vec measures)
                       (into [] (remove (set (concat row-idxs col-idxs))) (range (count columns))))]
        (when (and (seq val-idxs) (or (seq row-idxs) (seq col-idxs)))
          (let [tz     (:results_timezone data)
                fr?    (get data :format-rows? true)
                ;; Totals visibility is read from `settings` (:pivot.show_row_totals / :pivot.show_column_totals)
                ;; by build-pivot-output, not from pivot-export-options.
                peo    {:pivot-rows     row-idxs
                        :pivot-cols     col-idxs
                        :pivot-measures val-idxs}
                fmts   (formatter/make-formatters columns row-idxs col-idxs val-idxs settings tz fr?)
                output (pivot.postprocess/build-pivot-output
                        {:data data :settings settings :format-rows? fr? :pivot-export-options peo}
                        fmts)
                ;; Build a color selector from the card's conditional formatting, over the displayed data
                ;; (group=0 rows with the pivot-grouping column removed, aligned with `columns`).
                color-selector (when (seq (setting-value settings :table.column_formatting))
                                 (let [base-rows (into [] (comp (filter #(zero? (nth % pg-idx)))
                                                                (map #(vec (m/remove-nth pg-idx %))))
                                                       (:rows data))]
                                   ;; :table.pivot tells the shared color JS to skip row-highlight rules (which
                                   ;; don't map onto an assembled pivot); only value/range cell rules run.
                                   (js.color/make-color-selector {:cols columns :rows base-rows}
                                                                 (assoc settings :table.pivot true))))]
            ;; Unlike the flat :table path, a pivot aggregates all rows into a bounded grid rather than
            ;; truncating displayed rows, so the flat-table row-count truncation warning doesn't apply.
            (pivot->hiccup output {:color-selector color-selector
                                   :left-width     (count row-idxs)
                                   :measure-names  (mapv #(:name (nth columns %)) val-idxs)})))))))

(mu/defmethod render :pivot :- ::RenderedPartCard
  [_chart-type render-type timezone-id card dashcard data]
  (or (try
        (when-let [content (pivot-table-content card dashcard data)]
          {:content content :attachments nil})
        (catch Throwable e
          (log/warn e "Failed to render pivot table; falling back to a flat table")
          nil))
      ;; Native pivots, field-ref splits, or assembly errors degrade to the existing flat table.
      (render :table render-type timezone-id card dashcard data)))

(defn- smart-scalar-comparison-statement
  [unit value]
  (case unit
    :minute  (tru "vs. previous minute: {0}" value)
    :hour    (tru "vs. previous hour: {0}" value)
    :day     (tru "vs. previous day: {0}" value)
    :week    (tru "vs. previous week: {0}" value)
    :month   (tru "vs. previous month: {0}" value)
    :quarter (tru "vs. previous quarter: {0}" value)
    :year    (tru "vs. previous year: {0}" value)
    (tru "vs. previous {0}: {1}" (str/replace (name unit) "-" " ") value)))

(mu/defmethod render :smartscalar :- ::RenderedPartCard
  [_chart-type _render-type timezone-id _card _dashcard {:keys [cols insights viz-settings]}]
  (letfn [(col-of-type [t c] (or (isa? (:effective_type c) t)
                                 ;; computed and agg columns don't have an effective type
                                 (isa? (:base_type c) t)))
          (where [f coll] (some #(when (f %) %) coll))
          (percentage [arg] (if (number? arg)
                              (format-percentage arg)
                              " - "))]
    (let [[_time-col metric-col] (if (col-of-type :type/Temporal (first cols)) cols (reverse cols))

          {:keys [last-value previous-value unit last-change] :as _insight}
          (where (comp #{(:name metric-col)} :col) insights)]
      (if (and last-value previous-value unit last-change)
        (let [value                (format-scalar-value timezone-id last-value metric-col viz-settings)
              previous             (format-scalar-value timezone-id previous-value metric-col viz-settings)
              delta-statement      (cond
                                     (= last-value previous-value)
                                     (tru "No change")

                                     (pos? last-change)
                                     (tru "Up {0}" (percentage last-change))

                                     (neg? last-change)
                                     (tru "Down {0}" (percentage last-change)))
              comparison-statement (smart-scalar-comparison-statement unit previous)
              statement            (str delta-statement " " comparison-statement)]
          {:attachments nil
           :content     [:div
                         [:div {:style (style/style (style/scalar-style))}
                          (h value)]
                         [:p {:style (style/style {:color         style/color-text-medium
                                                   :font-size     :16px
                                                   :font-weight   700
                                                   :padding-right :16px})}
                          statement]]

           :render/text (str value "\n" statement)})
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
         :render/text (str (format-scalar-value timezone-id last-value metric-col viz-settings)
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
    ;; re-create the rows with the label/visibility specified in the funnel-viz
    (let [rows-data (map (fn [{k :key enabled? :enabled} [_ value]]
                           (when enabled?
                             [k value])) funnel-viz raw-rows)]
      (remove nil? rows-data))))

(defn- summable-col?
  "Check if a column is summable (numeric but not temporal, location, or entity).
   Works with snake_case column keys from result metadata."
  [col]
  (let [effective-type (or (:effective_type col) (:base_type col))
        semantic-type  (:semantic_type col)]
    (and (isa? effective-type :type/Number)
         (not (isa? effective-type :type/Temporal))
         (not (isa? semantic-type :type/Address))
         (not (isa? semantic-type :type/FK))
         (not (isa? semantic-type :type/PK))
         (not (isa? semantic-type :type/Name)))))

(defn- metric-col?
  "Check if a column should be treated as a metric, matching frontend isMetric logic.
   A metric is summable, not from breakout, not named like an ID, and not binned."
  [col]
  (and (not= (:source col) "breakout")
       (summable-col? col)
       (not (:binning_info col))
       (let [col-name (some-> (:name col) u/lower-case-en)]
         (not (or (= col-name "id")
                  (str/ends-with? col-name "_id")
                  (str/ends-with? col-name "-id"))))))

(defn- reorder-cols-for-funnel
  "Reorder :cols and :rows so that the dimension column is first and metric column is second.
   Finds columns by name, mirroring the frontend FunnelNormal.tsx findIndex logic."
  [data dim-col-name metric-col-name]
  (let [cols    (:cols data)
        dim-idx (first (keep-indexed (fn [i c] (when (= (:name c) dim-col-name) i)) cols))
        met-idx (first (keep-indexed (fn [i c] (when (= (:name c) metric-col-name) i)) cols))]
    (if (and dim-idx met-idx)
      (-> data
          (assoc :cols [(nth cols dim-idx) (nth cols met-idx)])
          (update :rows (fn [rs] (mapv (fn [r] (let [v (vec r)] [(v dim-idx) (v met-idx)])) rs))))
      data)))

(defn- swap-first-two-cols
  "Swap the first two columns in data, reordering both :cols and :rows."
  [data]
  (-> data
      (update :cols (fn [cs] (vec (cons (second cs) (cons (first cs) (drop 2 cs))))))
      (update :rows (fn [rs] (mapv (fn [r] (let [v (vec r)] (into [(v 1) (v 0)] (subvec v 2)))) rs)))))

(defn- normalize-funnel-data
  "Ensure funnel data has dimension column first and metric column second.
   Reorders both :cols and :rows if needed. When explicit funnel.dimension and
   funnel.metric settings are present, finds columns by name (like the frontend)."
  [card dashcard data]
  (let [cols (:cols data)]
    (if (or (< (count cols) 2)
            (and (not= :funnel (:display card))
                 (not (render.util/is-visualizer-dashcard? dashcard))))
      data
      (let [viz-settings     (if (render.util/is-visualizer-dashcard? dashcard)
                               (:viz-settings data)
                               (:visualization_settings card))
            dimension-col-name (get viz-settings :funnel.dimension)
            metric-col-name    (get viz-settings :funnel.metric)]
        (if (and dimension-col-name metric-col-name)
          ;; Both dimension and metric specified: find by name regardless of position
          (reorder-cols-for-funnel data dimension-col-name metric-col-name)
          ;; Auto-detect: metric col should be second, non-metric col should be first
          (let [[col1 col2] cols]
            (if (and (metric-col? col1) (not (metric-col? col2)))
              (swap-first-two-cols data)
              data)))))))

(mu/defmethod render :funnel_normal :- ::RenderedPartCard
  [_chart-type render-type _timezone-id card dashcard data]
  (let [{:keys [rows cols viz-settings]} (normalize-funnel-data card dashcard data)
        funnel-viz    (:funnel.rows viz-settings)
        raw-rows      (map (juxt first second)
                           (formatter/row-preprocess first second rows))
        rows          (if (and funnel-viz (all-unique? funnel-viz))
                        (funnel-rows funnel-viz raw-rows)
                        raw-rows)
        [x-col y-col] cols
        settings      (as-> (->js-viz x-col y-col viz-settings) jsviz-settings
                        (assoc jsviz-settings :step    {:name   (:display_name x-col)
                                                        :format (:x jsviz-settings)}
                               :measure {:format (:y jsviz-settings)}))
        svg           (js.svg/funnel rows settings)
        image-bundle  (image-bundle/make-image-bundle render-type svg)]
    {:attachments
     (image-bundle/image-bundle->attachment image-bundle)

     :content
     [:div
      [:img {:style (style/style {:display :block :width :100%})
             :src   (:image-src image-bundle)}]]}))

(mu/defmethod render :funnel :- ::RenderedPartCard
  "Fork the rendering implementation as such:
   +----------------------+--------------+---------------------------+
   | (visualizer?, type)  | Merge Data   | Viz Method                |
   +----------------------+--------------+---------------------------+
   | (true,  'bar')       |              | :javascript_visualization |
   +----------------------+--------------+---------------------------+
   | (true,  'funnel')    | true         | :funnel_normal            |
   +----------------------+--------------+---------------------------+
   | (false, 'bar')       |              | :javascript_visualization |
   +----------------------+--------------+---------------------------+
   | (false, 'funnel')    |              | :funnel_normal            |
   +----------------------+--------------+---------------------------+"
  [_chart-type render-type timezone-id card dashcard data]
  (let [visualizer?    (render.util/is-visualizer-dashcard? dashcard)
        viz-settings   (if visualizer?
                         (get-in dashcard [:visualization_settings :visualization])
                         (get card :visualization_settings))
        funnel-type    (if visualizer?
                         (get-in viz-settings [:settings :funnel.type] "funnel")
                         (get viz-settings :funnel.type))
        processed-data (if (and visualizer? (= "funnel" funnel-type))
                         (render.util/merge-visualizer-data (series-cards-with-data dashcard card data) viz-settings)
                         data)]
    (if (= "bar" funnel-type)
      (render :javascript_visualization render-type timezone-id card dashcard processed-data)
      (render :funnel_normal render-type timezone-id card dashcard processed-data))))

(mu/defmethod render :empty :- ::RenderedPartCard
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
                      :color      style/color-text-light})}
       (trs "No results")]]
     :render/text (trs "No results")}))

(mu/defmethod render :attached :- ::RenderedPartCard
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

(mu/defmethod render :unknown :- ::RenderedPartCard
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

(mu/defmethod render :card-error :- ::RenderedPartCard
  [_chart-type _render-type _timezone-id _card _dashcard _data]
  @card-error-rendered-info)

(mu/defmethod render :card-error/results-too-large :- ::RenderedPartCard
  [_chart-type _render-type _timezone-id _card _dashcard data]
  (let [filesize-limit (:max-size-human-readable data "10.0 mb")]
    {:attachments nil,
     :content [:div
               {:style "font-family: Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif; margin: 0px 0;"}
               [:div
                {:style "background-color: #F9FBFC; border: 1px solid #DCE1E4; border-radius: 8px; padding: 16px;"}
                [:p
                 {:style "margin: 4px; font-size: 14px; font-weight: 700; color: #4C5773;"}
                 (trs "This chart exceeded the {0} size limit." filesize-limit)]
                [:p
                 {:style "margin: 4px; font-size: 12px; font-weight: 400; color: #696E7B;"}
                 (trs "You can make it smaller by adding filters, or summarizing the data.")]]]}))

(mu/defmethod render :render-error :- ::RenderedPartCard
  [_chart-type _render-type _timezone-id _card _dashcard _data]
  @error-rendered-info)
