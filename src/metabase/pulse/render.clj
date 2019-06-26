(ns metabase.pulse.render
  (:require [clojure.tools.logging :as log]
            [metabase.mbql.util :as mbql.u]
            [metabase.pulse.render
             [color :as color]
             [common :as common]
             [datetime :as datetime]
             [image-bundle :as image-bundle]
             [png :as png]
             [style :as style]
             [table :as table]]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [i18n :refer [trs tru]]
             [ui-logic :as ui-logic]
             [urls :as urls]]
            [schema.core :as s])
  (:import [java.awt BasicStroke Color RenderingHints]
           java.awt.image.BufferedImage
           java.io.ByteArrayOutputStream
           java.util.Date
           javax.imageio.ImageIO))

(def ^:private ^:const card-width 400)
(def ^:private ^:const rows-limit 20)
(def ^:private ^:const cols-limit 10)
(def ^:private ^:const sparkline-dot-radius 6)
(def ^:private ^:const sparkline-thickness 3)
(def ^:private ^:const sparkline-pad 8)

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defn- graphing-columns [card {:keys [cols] :as data}]
  [(or (ui-logic/x-axis-rowfn card data)
       first)
   (or (ui-logic/y-axis-rowfn card data)
       second)])

(defn- number-field?
  [field]
  (or (isa? (:base_type field)    :type/Number)
      (isa? (:special_type field) :type/Number)))

(defn detect-pulse-card-type
  "Determine the pulse (visualization) type of a CARD, e.g. `:scalar` or `:bar`."
  [card data]
  (let [col-count                 (-> data :cols count)
        row-count                 (-> data :rows count)
        [col-1-rowfn col-2-rowfn] (graphing-columns card data)
        col-1                     (col-1-rowfn (:cols data))
        col-2                     (col-2-rowfn (:cols data))
        aggregation               (-> card :dataset_query :query :aggregation first)]
    (cond
      (or (zero? row-count)
          ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
          (= [[nil]] (-> data :rows)))                             :empty
      (contains? #{:pin_map :state :country} (:display card))      nil
      (and (= col-count 1)
           (= row-count 1))                                        :scalar
      (and (= col-count 2)
           (> row-count 1)
           (mbql.u/datetime-field? col-1)
           (number-field? col-2))                                  :sparkline
      (and (= col-count 2)
           (number-field? col-2))                                  :bar
      :else                                                        :table)))

(defn- show-in-table? [{:keys [special_type visibility_type] :as column}]
  (and (not (isa? special_type :type/Description))
       (not (contains? #{:details-only :retired :sensitive} visibility_type))))

(defn include-csv-attachment?
  "Returns true if this card and resultset should include a CSV attachment"
  [card {:keys [cols rows] :as result-data}]
  (or (:include_csv card)
      (and (not (:include_xls card))
           (= :table (detect-pulse-card-type card result-data))
           (or
            ;; If some columns are not shown, include an attachment
            (some (complement show-in-table?) cols)
            ;; If there are too many rows or columns, include an attachment
            (< cols-limit (count cols))
            (< rows-limit (count rows))))))

(defn count-displayed-columns
  "Return a count of the number of columns to be included in a table display"
  [cols]
  (count (filter show-in-table? cols)))


;;; --------------------------------------------------- Formatting ---------------------------------------------------

(defn- format-cell
  [timezone value col]
  (cond
    (mbql.u/datetime-field? col)                             (datetime/format-timestamp timezone value col)
    (and (number? value) (not (mbql.u/datetime-field? col))) (common/format-number value)
    :else                                                    (str value)))

;;; --------------------------------------------------- Rendering ----------------------------------------------------

(def ^:dynamic *include-buttons*
  "Should the rendered pulse include buttons? (default: `false`)"
  false)

(def ^:dynamic *include-title*
  "Should the rendered pulse include a title? (default: `false`)"
  false)

(def ^:dynamic *render-img-fn*
  "The function that should be used for rendering image bytes. Defaults to `render-img-data-uri`."
  image-bundle/render-img-data-uri)

(defn- card-href
  [card]
  (h (urls/card-url (:id card))))



(defn- create-remapping-lookup
  "Creates a map with from column names to a column index. This is used to figure out what a given column name or value
  should be replaced with"
  [cols]
  (into {}
        (for [[col-idx {:keys [remapped_from]}] (map vector (range) cols)
              :when remapped_from]
          [remapped_from col-idx])))

(defn- query-results->header-row
  "Returns a row structure with header info from `cols`. These values are strings that are ready to be rendered as HTML"
  [remapping-lookup cols include-bar?]
  {:row (for [maybe-remapped-col cols
              :when (show-in-table? maybe-remapped-col)
              :let [{:keys [base_type special_type] :as col} (if (:remapped_to maybe-remapped-col)
                                                               (nth cols (get remapping-lookup (:name maybe-remapped-col)))
                                                               maybe-remapped-col)
                    column-name (name (or (:display_name col) (:name col)))]
              ;; If this column is remapped from another, it's already
              ;; in the output and should be skipped
              :when (not (:remapped_from maybe-remapped-col))]
          (if (or (isa? base_type :type/Number)
                  (isa? special_type :type/Number))
            (common/->NumericWrapper column-name)
            column-name))
   :bar-width (when include-bar? 99)})

(defn- query-results->row-seq
  "Returns a seq of stringified formatted rows that can be rendered into HTML"
  [timezone remapping-lookup cols rows bar-column max-value]
  (for [row rows]
    {:bar-width (when-let [bar-value (and bar-column (bar-column row))]
                  ;; cast to double to avoid "Non-terminating decimal expansion" errors
                  (float (* 100 (/ (double bar-value) max-value))))
     :row (for [[maybe-remapped-col maybe-remapped-row-cell] (map vector cols row)
                :when (and (not (:remapped_from maybe-remapped-col))
                           (show-in-table? maybe-remapped-col))
                :let [[col row-cell] (if (:remapped_to maybe-remapped-col)
                                       [(nth cols (get remapping-lookup (:name maybe-remapped-col)))
                                        (nth row (get remapping-lookup (:name maybe-remapped-col)))]
                                       [maybe-remapped-col maybe-remapped-row-cell])]]
            (format-cell timezone row-cell col))}))

(defn- prep-for-html-rendering
  "Convert the query results (`cols` and `rows`) into a formatted seq of rows (list of strings) that can be rendered as
  HTML"
  [timezone cols rows bar-column max-value column-limit]
  (let [remapping-lookup (create-remapping-lookup cols)
        limited-cols (take column-limit cols)]
    (cons
     (query-results->header-row remapping-lookup limited-cols bar-column)
     (query-results->row-seq timezone remapping-lookup limited-cols (take rows-limit rows) bar-column max-value))))

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
     "More results have been included as a file attachment"]))

(s/defn ^:private render:table :- common/RenderedPulseCard
  [render-type timezone card {:keys [cols rows] :as data}]
  (let [table-body [:div
                    (table/render-table (color/make-color-selector data (:visualization_settings card))
                                  (mapv :name (:cols data))
                                  (prep-for-html-rendering timezone cols rows nil nil cols-limit))
                    (render-truncation-warning cols-limit (count-displayed-columns cols) rows-limit (count rows))]]
    {:attachments nil
     :content     (if-let [results-attached (attached-results-text render-type cols cols-limit rows rows-limit)]
                    (list results-attached table-body)
                    (list table-body))}))

(defn- non-nil-rows
  "Remove any rows that have a nil value for the `x-axis-fn` OR `y-axis-fn`"
  [x-axis-fn y-axis-fn rows]
  (filter (every-pred x-axis-fn y-axis-fn) rows))

(s/defn ^:private render:bar :- common/RenderedPulseCard
  [timezone card {:keys [cols] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (graphing-columns card data)
        rows (non-nil-rows x-axis-rowfn y-axis-rowfn (:rows data))
        max-value (apply max (map y-axis-rowfn rows))]
    {:attachments nil
     :content     [:div
                   (table/render-table (color/make-color-selector data (:visualization_settings card))
                                 (mapv :name cols)
                                 (prep-for-html-rendering timezone cols rows y-axis-rowfn max-value 2))
                   (render-truncation-warning 2 (count-displayed-columns cols) rows-limit (count rows))]}))

(s/defn ^:private render:scalar :- common/RenderedPulseCard
  [timezone card {:keys [cols rows]}]
  {:attachments nil
   :content     [:div {:style (style/style (style/scalar-style))}
                 (h (format-cell timezone (ffirst rows) (first cols)))]})

(defn- render-sparkline-to-png
  "Takes two arrays of numbers between 0 and 1 and plots them as a sparkline"
  [xs ys width height]
  (let [os    (ByteArrayOutputStream.)
        image (BufferedImage. (+ width (* 2 sparkline-pad)) (+ height (* 2 sparkline-pad)) BufferedImage/TYPE_INT_ARGB)
        xt    (map #(+ sparkline-pad (* width %)) xs)
        yt    (map #(+ sparkline-pad (- height (* height %))) ys)]
    (doto (.createGraphics image)
      (.setRenderingHints (RenderingHints. RenderingHints/KEY_ANTIALIASING RenderingHints/VALUE_ANTIALIAS_ON))
      (.setColor (Color. 211 227 241))
      (.setStroke (BasicStroke. sparkline-thickness BasicStroke/CAP_ROUND BasicStroke/JOIN_ROUND))
      (.drawPolyline (int-array (count xt) xt)
                     (int-array (count yt) yt)
                     (count xt))
      (.setColor (Color. 45 134 212))
      (.fillOval (- (last xt) sparkline-dot-radius)
                 (- (last yt) sparkline-dot-radius)
                 (* 2 sparkline-dot-radius)
                 (* 2 sparkline-dot-radius))
      (.setColor Color/white)
      (.setStroke (BasicStroke. 2))
      (.drawOval (- (last xt) sparkline-dot-radius)
                 (- (last yt) sparkline-dot-radius)
                 (* 2 sparkline-dot-radius)
                 (* 2 sparkline-dot-radius)))
    (when-not (ImageIO/write image "png" os)                    ; returns `true` if successful -- see JavaDoc
      (let [^String msg (str (tru "No appropriate image writer found!"))]
        (throw (Exception. msg))))
    (.toByteArray os)))

(s/defn ^:private render:sparkline :- common/RenderedPulseCard
  [render-type timezone card {:keys [rows cols] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (graphing-columns card data)
        ft-row                      (if (mbql.u/datetime-field? (x-axis-rowfn cols))
                                      #(.getTime ^Date (du/->Timestamp % timezone))
                                      identity)
        rows                        (non-nil-rows x-axis-rowfn y-axis-rowfn
                                                  (if (> (ft-row (x-axis-rowfn (first rows)))
                                                         (ft-row (x-axis-rowfn (last rows))))
                                                    (reverse rows)
                                                    rows))
        xs                          (map (comp ft-row x-axis-rowfn) rows)
        xmin                        (apply min xs)
        xmax                        (apply max xs)
        xrange                      (- xmax xmin)
        xs'                         (map #(/ (double (- % xmin)) xrange) xs)
        ys                          (map y-axis-rowfn rows)
        ymin                        (apply min ys)
        ymax                        (apply max ys)
        yrange                      (max 1 (- ymax ymin))                    ; `(max 1 ...)` so we don't divide by zero
        ys'                         (map #(/ (double (- % ymin)) yrange) ys) ; cast to double to avoid "Non-terminating decimal expansion" errors
        rows'                       (reverse (take-last 2 rows))
        values                      (map (comp common/format-number y-axis-rowfn) rows')
        labels                      (datetime/format-timestamp-pair timezone (map x-axis-rowfn rows') (x-axis-rowfn cols))
        image-bundle                (image-bundle/make-image-bundle render-type (render-sparkline-to-png xs' ys' 524 130))]

    {:attachments (when image-bundle
                    (image-bundle/image-bundle->attachment image-bundle))
     :content     [:div
                   [:img {:style (style/style {:display :block
                                               :width   :100%})
                          :src   (:image-src image-bundle)}]
                   [:table
                    [:tr
                     [:td {:style (style/style {:color         style/color-brand
                                                :font-size     :24px
                                                :font-weight   700
                                                :padding-right :16px})}
                      (first values)]
                     [:td {:style (style/style {:color       style/color-gray-3
                                                :font-size   :24px
                                                :font-weight 700})}
                      (second values)]]
                    [:tr
                     [:td {:style (style/style {:color         style/color-brand
                                                :font-size     :16px
                                                :font-weight   700
                                                :padding-right :16px})}
                      (first labels)]
                     [:td {:style (style/style {:color     style/color-gray-3
                                                :font-size :16px})}
                      (second labels)]]]]}))

(s/defn ^:private render:empty :- common/RenderedPulseCard
  [render-type _ _]
  (let [image-bundle (image-bundle/no-results-image-bundle render-type)]
    {:attachments (image-bundle/image-bundle->attachment image-bundle)
     :content     [:div {:style (style/style {:text-align :center})}
                   [:img {:style (style/style {:width :104px})
                          :src   (:image-src image-bundle)}]
                   [:div {:style (style/style
                                  (style/font-style)
                                  {:margin-top :8px
                                   :color      style/color-gray-4})}
                    "No results"]]}))

(s/defn ^:private render:attached :- common/RenderedPulseCard
  [render-type _ _]
  (let [image-bundle (image-bundle/attached-image-bundle render-type)]
    {:attachments (image-bundle/image-bundle->attachment image-bundle)
     :content     [:div {:style (style/style {:text-align :center})}
                   [:img {:style (style/style {:width :30px})
                          :src   (:image-src image-bundle)}]
                   [:div {:style (style/style
                                  (style/font-style)
                                  {:margin-top :8px
                                   :color      style/color-gray-4})}
                    "This question has been included as a file attachment"]]}))

(s/defn ^:private render:unknown :- common/RenderedPulseCard
  [_ _]
  {:attachments nil
   :content     [:div {:style (style/style
                               (style/font-style)
                               {:color       style/color-gold
                                :font-weight 700})}
                 "We were unable to display this card."
                 [:br]
                 "Please view this card in Metabase."]})

(s/defn ^:private render:error :- common/RenderedPulseCard
  [_ _]
  {:attachments nil
   :content     [:div {:style (style/style
                               (style/font-style)
                               {:color       style/color-error
                                :font-weight 700
                                :padding     :16px})}
                 "An error occurred while displaying this card."]})

(s/defn ^:private make-title-if-needed :- (s/maybe common/RenderedPulseCard)
  [render-type card]
  (when *include-title*
    (let [image-bundle (when *include-buttons*
                         (image-bundle/external-link-image-bundle render-type))]
      {:attachments (when image-bundle
                      (image-bundle/image-bundle->attachment image-bundle))
       :content     [:table {:style (style/style {:margin-bottom   :8px
                                                  :border-collapse :collapse
                                                  :width           :100%})}
                     [:tbody
                      [:tr
                       [:td {:style (style/style {:padding :0
                                                  :margin  :0})}
                        [:span {:style (style/style (style/header-style))}
                         (-> card :name h)]]
                       [:td {:style (style/style {:text-align :right})}
                        (when *include-buttons*
                          [:img {:style (style/style {:width :16px})
                                 :width 16
                                 :src   (:image-src image-bundle)}])]]]]})))

(defn- is-attached?
  [card]
  (or (:include_csv card)
      (:include_xls card)))

(s/defn ^:private render-pulse-card-body :- common/RenderedPulseCard
  [render-type timezone card {:keys [data error], :as results}]
  (try
    (when error
      (let [^String msg (str (tru "Card has errors: {0}" error))]
        (throw (ex-info msg results))))
    (case (detect-pulse-card-type card data)
      :empty     (render:empty     render-type card data)
      :scalar    (render:scalar    timezone card data)
      :sparkline (render:sparkline render-type timezone card data)
      :bar       (render:bar       timezone card data)
      :table     (render:table     render-type timezone card data)
      (if (is-attached? card)
        (render:attached render-type card data)
        (render:unknown card data)))
    (catch Throwable e
      (log/error (trs "Pulse card render error")
                 (class e)
                 (.getMessage e)
                 "\n"
                 (u/pprint-to-str (u/filtered-stacktrace e)))
      (render:error card data))))

(s/defn ^:private render-pulse-card :- common/RenderedPulseCard
  "Render a single `card` for a `Pulse` to Hiccup HTML. `result` is the QP results."
  [render-type timezone card results]
  (let [{title :content title-attachments :attachments} (make-title-if-needed render-type card)
        {pulse-body :content body-attachments :attachments} (render-pulse-card-body render-type timezone card results)]
    {:attachments (merge title-attachments body-attachments)
     :content     [:a {:href   (card-href card)
                       :target "_blank"
                       :style  (style/style
                                (style/section-style)
                                {:margin          :16px
                                 :margin-bottom   :16px
                                 :display         :block
                                 :text-decoration :none})}
                   title
                   pulse-body]}))

(defn render-pulse-card-for-display
  "Same as `render-pulse-card` but isn't intended for an email, rather for previewing so there is no need for
  attachments"
  [timezone card results]
  (:content (render-pulse-card :inline timezone card results)))

(s/defn render-pulse-section :- common/RenderedPulseCard
  "Render a specific section of a Pulse, i.e. a single Card, to Hiccup HTML."
  [timezone {card :card {:keys [data] :as result} :result}]
  (let [{:keys [attachments content]} (binding [*include-title* true]
                                        (render-pulse-card :attachment timezone card result))]
    {:attachments attachments
     :content     [:div {:style (style/style (merge {:margin-top       :10px
                                               :margin-bottom    :20px}
                                              ;; Don't include the border on cards rendered with a table as the table
                                              ;; will be to larger and overrun the border
                                              (when-not (= :table (detect-pulse-card-type card data))
                                                {:border           "1px solid #dddddd"
                                                 :border-radius    :2px
                                                 :background-color :white
                                                 :width            "500px !important"
                                                 :box-shadow       "0 1px 2px rgba(0, 0, 0, .08)"})))}
                   content]}))

(defn render-pulse-card-to-png
  "Render a `pulse-card` as a PNG. `data` is the `:data` from a QP result (I think...)"
  ^bytes [timezone pulse-card result]
  (png/render-html-to-png (render-pulse-card :inline timezone pulse-card result) card-width))
