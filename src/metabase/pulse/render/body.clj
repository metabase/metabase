(ns metabase.pulse.render.body
  (:require [cheshire.core :as json]
            [hiccup.core :refer [h]]
            [medley.core :as m]
            [metabase.pulse.render
             [color :as color]
             [common :as common]
             [datetime :as datetime]
             [image-bundle :as image-bundle]
             [sparkline :as sparkline]
             [style :as style]
             [table :as table]]
            [metabase.types :as types]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s]))

(def rows-limit
  "Maximum number of rows to render in a Pulse image."
  20)

(def cols-limit
  "Maximum number of columns to render in a Pulse image."
  10)

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Helper Fns                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn show-in-table?
  "Should this column be shown in a rendered table in a Pulse?"
  [{:keys [special_type visibility_type] :as column}]
  (and (not (isa? special_type :type/Description))
       (not (contains? #{:details-only :retired :sensitive} visibility_type))))

(defn- count-displayed-columns
  "Return a count of the number of columns to be included in a table display"
  [cols]
  (count (filter show-in-table? cols)))


;;; --------------------------------------------------- Formatting ---------------------------------------------------

(s/defn ^:private format-cell
  [timezone-id :- (s/maybe s/Str) value col]
  (cond
    (types/temporal-field? col)                             (datetime/format-temporal-str timezone-id value col)
    (and (number? value) (not (types/temporal-field? col))) (common/format-number value)
    :else                                                   (str value)))

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
  {:row (for [maybe-remapped-col cols
              :when (show-in-table? maybe-remapped-col)
              :let [{:keys [base_type special_type] :as col} (if (:remapped_to maybe-remapped-col)
                                                               (nth cols (get remapping-lookup (:name maybe-remapped-col)))
                                                               maybe-remapped-col)
                    col-name (column-name card col)]
              ;; If this column is remapped from another, it's already
              ;; in the output and should be skipped
              :when (not (:remapped_from maybe-remapped-col))]
          (if (or (isa? base_type :type/Number)
                  (isa? special_type :type/Number))
            (common/->NumericWrapper col-name)
            col-name))
   :bar-width (when include-bar? 99)})

(s/defn ^:private query-results->row-seq
  "Returns a seq of stringified formatted rows that can be rendered into HTML"
  [timezone-id :- (s/maybe s/Str) remapping-lookup cols rows bar-column max-value]
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
            (format-cell timezone-id row-cell col))}))

(s/defn ^:private prep-for-html-rendering
  "Convert the query results (`cols` and `rows`) into a formatted seq of rows (list of strings) that can be rendered as
  HTML"
  [timezone-id :- (s/maybe s/Str) card {:keys [cols rows]} bar-column max-value column-limit]
  (let [remapping-lookup (create-remapping-lookup cols)
        limited-cols (take column-limit cols)]
    (cons
     (query-results->header-row remapping-lookup card limited-cols bar-column)
     (query-results->row-seq timezone-id remapping-lookup limited-cols (take rows-limit rows) bar-column max-value))))

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
                     (prep-for-html-rendering timezone-id card data nil nil cols-limit))
                    (render-truncation-warning cols-limit (count-displayed-columns cols) rows-limit (count rows))]]
    {:attachments
     nil

     :content
     (if-let [results-attached (attached-results-text render-type cols cols-limit rows rows-limit)]
       (list results-attached table-body)
       (list table-body))}))

(s/defmethod render :bar :- common/RenderedPulseCard
  [_ _ timezone-id :- (s/maybe s/Str) card {:keys [cols] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (common/graphing-column-row-fns card data)
        rows                        (common/non-nil-rows x-axis-rowfn y-axis-rowfn (:rows data))
        max-value                   (apply max (map y-axis-rowfn rows))]
    {:attachments
     nil

     :content
     [:div
      (table/render-table (color/make-color-selector data (:visualization_settings card))
                          (mapv :name cols)
                          (prep-for-html-rendering timezone-id card data y-axis-rowfn max-value 2))
      (render-truncation-warning 2 (count-displayed-columns cols) rows-limit (count rows))]}))

(s/defmethod render :scalar :- common/RenderedPulseCard
  [_ _ timezone-id card {:keys [cols rows]}]
  {:attachments
   nil

   :content
   [:div {:style (style/style (style/scalar-style))}
    (h (format-cell timezone-id (ffirst rows) (first cols)))]})

(s/defmethod render :sparkline :- common/RenderedPulseCard
  [_ render-type timezone-id card {:keys [rows cols] :as data}]
  (let [[x-axis-rowfn
         y-axis-rowfn] (common/graphing-column-row-fns card data)
        rows           (sparkline/sparkline-rows timezone-id card data)
        last-rows      (reverse (take-last 2 rows))
        values         (for [row last-rows]
                         (some-> row y-axis-rowfn common/format-number))
        labels         (datetime/format-temporal-string-pair timezone-id (map x-axis-rowfn last-rows) (x-axis-rowfn cols))
        image-bundle   (sparkline/sparkline-image-bundle render-type timezone-id card {:rows rows, :cols cols})]
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
        [:td {:style (style/style {:color         (style/primary-color)
                                   :font-size     :24px
                                   :font-weight   700
                                   :padding-right :16px})}
         (first values)]
        [:td {:style (style/style {:color       style/color-gray-3
                                   :font-size   :24px
                                   :font-weight 700})}
         (second values)]]
       [:tr
        [:td {:style (style/style {:color         (style/primary-color)
                                   :font-size     :16px
                                   :font-weight   700
                                   :padding-right :16px})}
         (first labels)]
        [:td {:style (style/style {:color     style/color-gray-3
                                   :font-size :16px})}
         (second labels)]]]]}))

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
  {:attachments
   nil

   :content
   [:div {:style (style/style
                  (style/font-style)
                  {:color       style/color-error
                   :font-weight 700
                   :padding     :16px})}
    (trs "An error occurred while displaying this card.")]})
