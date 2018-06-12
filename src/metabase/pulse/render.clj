(ns metabase.pulse.render
  (:require [clj-time
             [core :as t]
             [format :as f]]
            [clojure
             [pprint :refer [cl-format]]
             [string :as str]]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [hiccup
             [core :refer [h html]]
             [util :as hutil]]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [ui-logic :as ui-logic]
             [urls :as urls]]
            [puppetlabs.i18n.core :refer [trs tru]]
            [schema.core :as s])
  (:import cz.vutbr.web.css.MediaSpec
           [java.awt BasicStroke Color Dimension RenderingHints]
           java.awt.image.BufferedImage
           [java.io ByteArrayInputStream ByteArrayOutputStream]
           java.net.URL
           java.nio.charset.StandardCharsets
           [java.util Arrays Date]
           javax.imageio.ImageIO
           org.apache.commons.io.IOUtils
           [org.fit.cssbox.css CSSNorm DOMAnalyzer DOMAnalyzer$Origin]
           [org.fit.cssbox.io DefaultDOMSource StreamDocumentSource]
           org.fit.cssbox.layout.BrowserCanvas
           org.fit.cssbox.misc.Base64Coder
           org.joda.time.DateTimeZone))

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; ----------------------------------------------------- Styles -----------------------------------------------------

(def ^:private ^:const card-width 400)
(def ^:private ^:const rows-limit 20)
(def ^:private ^:const cols-limit 10)
(def ^:private ^:const sparkline-dot-radius 6)
(def ^:private ^:const sparkline-thickness 3)
(def ^:private ^:const sparkline-pad 8)

;;; ## STYLES
(def ^:private ^:const color-brand      "rgb(45,134,212)")
(def ^:private ^:const color-purple     "rgb(135,93,175)")
(def ^:private ^:const color-gold       "#F9D45C")
(def ^:private ^:const color-error      "#EF8C8C")
(def ^:private ^:const color-gray-1     "rgb(248,248,248)")
(def ^:private ^:const color-gray-2     "rgb(189,193,191)")
(def ^:private ^:const color-gray-3     "rgb(124,131,129)")
(def ^:const color-gray-4 "A ~25% Gray color." "rgb(57,67,64)")
(def ^:private ^:const color-dark-gray  "#616D75")
(def ^:private ^:const color-row-border "#EDF0F1")


(defn- primary-color []
  color-brand)

(defn- font-style []
  {:font-family "Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif"})

(defn section-style
  "CSS style for a Pulse section."
  []
  (font-style))

(defn- header-style []
  (merge (font-style) {:font-size       :16px
                       :font-weight     700
                       :color           color-gray-4
                       :text-decoration :none}))

(defn- scalar-style []
  (merge (font-style) {:font-size   :24px
                       :font-weight 700
                       :color       (primary-color)}))

(defn- bar-th-style []
  (merge (font-style) {:font-size       :14.22px
                       :font-weight     700
                       :color           color-gray-4
                       :border-bottom   (str "1px solid " color-row-border)
                       :padding-top     :20px
                       :padding-bottom  :5px}))

(defn- bar-td-style []
  (merge (font-style) {:font-size     :16px
                       :font-weight   400
                       :text-align    :left
                       :padding-right :1em
                       :padding-top   :8px}))

;; TO-DO for @senior: apply this style to headings of numeric columns
(defn- bar-th-numeric-style []
  (merge (font-style) {:text-align      :right
                       :font-size       :14.22px
                       :font-weight     700
                       :color           color-gray-4
                       :border-bottom   (str "1px solid " color-row-border)
                       :padding-top     :20px
                       :padding-bottom  :5px}))

;; TO-DO for @senior: apply this style to numeric cells
(defn- bar-td-style-numeric []
  (merge (font-style) {:font-size      :14.22px
                       :font-weight    400
                       :color          color-dark-gray
                       :text-align     :right
                       :padding-right  :1em
                       :padding-top    :2px
                       :padding-bottom :1px
                       :font-family    "Courier, Monospace"
                       :border-bottom  (str "1px solid " color-row-border)}))

(def ^:private RenderedPulseCard
  "Schema used for functions that operate on pulse card contents and their attachments"
  {:attachments (s/maybe {s/Str URL})
   :content [s/Any]})

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defn style
  "Compile one or more CSS style maps into a string.

     (style {:font-weight 400, :color \"white\"}) -> \"font-weight: 400; color: white;\""
  [& style-maps]
  (str/join " " (for [[k v] (into {} style-maps)
                      :let  [v (if (keyword? v) (name v) v)]]
                  (str (name k) ": " v ";"))))

(defn- graphing-columns [card {:keys [cols] :as data}]
  [(or (ui-logic/x-axis-rowfn card data)
       first)
   (or (ui-logic/y-axis-rowfn card data)
       second)])

(defn- datetime-field?
  [field]
  (or (isa? (:base_type field)    :type/DateTime)
      (isa? (:special_type field) :type/DateTime)))

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
           (datetime-field? col-1)
           (number-field? col-2))                                  :sparkline
      (and (= col-count 2)
           (number-field? col-2))                                  :bar
      :else                                                        :table)))

(defn- show-in-table? [{:keys [special_type visibility_type] :as column}]
  (and (not (isa? special_type :type/Description))
       (not (contains? #{:details-only :retired :sensitive} visibility_type))))

(defn include-csv-attachment?
  "Returns true if this card and resultset should include a CSV attachment"
  [{:keys [include_csv] :as card} {:keys [cols rows] :as result-data}]
  (or (:include_csv card)
      (and (= :table (detect-pulse-card-type card result-data))
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

(defrecord ^:private NumericWrapper [num-str]
  hutil/ToString
  (to-str [_] num-str)
  java.lang.Object
  (toString [_] num-str))

(defn- format-number
  [n]
  (NumericWrapper. (cl-format nil (if (integer? n) "~:d" "~,2f") n)))

(defn- reformat-timestamp [timezone old-format-timestamp new-format-string]
  (f/unparse (f/with-zone (f/formatter new-format-string)
               (DateTimeZone/forTimeZone timezone))
             (du/str->date-time old-format-timestamp timezone)))

(defn- format-timestamp
  "Formats timestamps with human friendly absolute dates based on the column :unit"
  [timezone timestamp col]
  (case (:unit col)
    :hour          (reformat-timestamp timezone timestamp "h a - MMM YYYY")
    :week          (str "Week " (reformat-timestamp timezone timestamp "w - YYYY"))
    :month         (reformat-timestamp timezone timestamp "MMMM YYYY")
    :quarter       (let [timestamp-obj (du/str->date-time timestamp timezone)]
                     (str "Q"
                          (inc (int (/ (t/month timestamp-obj)
                                       3)))
                          " - "
                          (t/year timestamp-obj)))

    ;; TODO: probably shouldn't even be showing sparkline for x-of-y groupings?
    (:year :hour-of-day :day-of-week :week-of-year :month-of-year)
    (str timestamp)

    (reformat-timestamp timezone timestamp "MMM d, YYYY")))

(def ^:private year  (comp t/year  t/now))
(def ^:private month (comp t/month t/now))
(def ^:private day   (comp t/day   t/now))

(defn- date->interval-name [date interval-start interval this-interval-name last-interval-name]
  (cond
    (t/within? (t/interval interval-start                    (t/plus interval-start interval)) date) this-interval-name
    (t/within? (t/interval (t/minus interval-start interval) interval-start)                   date) last-interval-name))

(defn- start-of-this-week    [] (-> (org.joda.time.LocalDate.) .weekOfWeekyear .roundFloorCopy .toDateTimeAtStartOfDay))
(defn- start-of-this-quarter [] (t/date-midnight (year) (inc (* 3 (Math/floor (/ (dec (month))
                                                                                 3))))))

(defn- format-timestamp-relative
  "Formats timestamps with relative names (today, yesterday, this *, last *) based on column :unit, if possible,
  otherwie returns nil"
  [timezone timestamp, {:keys [unit]}]
  (let [parsed-timestamp (du/str->date-time timestamp timezone)]
    (case unit
      :day     (date->interval-name parsed-timestamp
                                    (t/date-midnight (year) (month) (day))
                                    (t/days 1) "Today" "Yesterday")
      :week    (date->interval-name parsed-timestamp
                                    (start-of-this-week)
                                    (t/weeks 1) "This week" "Last week")
      :month   (date->interval-name parsed-timestamp
                                    (t/date-midnight (year) (month))
                                    (t/months 1) "This month" "Last month")
      :quarter (date->interval-name parsed-timestamp
                                    (start-of-this-quarter)
                                    (t/months 3) "This quarter" "Last quarter")
      :year    (date->interval-name (t/date-midnight parsed-timestamp)
                                    (t/date-midnight (year))
                                    (t/years 1) "This year" "Last year")
      nil)))

(defn- format-timestamp-pair
  "Formats a pair of timestamps, using relative formatting for the first timestamps if possible and 'Previous :unit' for
  the second, otherwise absolute timestamps for both"
  [timezone [a b] col]
  (if-let [a' (format-timestamp-relative timezone a col)]
    [a' (str "Previous " (-> col :unit name))]
    [(format-timestamp timezone a col) (format-timestamp timezone b col)]))

(defn- format-cell
  [timezone value col]
  (cond
    (datetime-field? col) (format-timestamp timezone value col)
    (and (number? value) (not (datetime-field? col))) (format-number value)
    :else (str value)))

(defn- render-img-data-uri
  "Takes a PNG byte array and returns a Base64 encoded URI"
  [img-bytes]
  (str "data:image/png;base64," (String. (Base64Coder/encode img-bytes))))


;;; --------------------------------------------------- Rendering ----------------------------------------------------

(def ^:dynamic *include-buttons*
  "Should the rendered pulse include buttons? (default: `false`)"
  false)

(def ^:dynamic *include-title*
  "Should the rendered pulse include a title? (default: `false`)"
  false)

(def ^:dynamic *render-img-fn*
  "The function that should be used for rendering image bytes. Defaults to `render-img-data-uri`."
  render-img-data-uri)

(defn- card-href
  [card]
  (h (urls/card-url (:id card))))

(defn- write-image
  [^BufferedImage image ^String format-name ^ByteArrayOutputStream output-stream]
  (try
    (ImageIO/write image format-name output-stream)
    (catch javax.imageio.IIOException iioex
      (log/error iioex "Error writing image to output stream")
      (throw iioex))))

;; ported from https://github.com/radkovo/CSSBox/blob/cssbox-4.10/src/main/java/org/fit/cssbox/demo/ImageRenderer.java
(defn- render-to-png
  [^String html, ^ByteArrayOutputStream os, width]
  (let [is            (ByteArrayInputStream. (.getBytes html StandardCharsets/UTF_8))
        doc-source    (StreamDocumentSource. is nil "text/html; charset=utf-8")
        parser        (DefaultDOMSource. doc-source)
        doc           (.parse parser)
        window-size   (Dimension. width 1)
        media         (doto (MediaSpec. "screen")
                        (.setDimensions       (.width window-size) (.height window-size))
                        (.setDeviceDimensions (.width window-size) (.height window-size)))
        da            (doto (DOMAnalyzer. doc (.getURL doc-source))
                        (.setMediaSpec media)
                        .attributesToStyles
                        (.addStyleSheet nil (CSSNorm/stdStyleSheet)   DOMAnalyzer$Origin/AGENT)
                        (.addStyleSheet nil (CSSNorm/userStyleSheet)  DOMAnalyzer$Origin/AGENT)
                        (.addStyleSheet nil (CSSNorm/formsStyleSheet) DOMAnalyzer$Origin/AGENT)
                        .getStyleSheets)
        content-canvas (doto (BrowserCanvas. (.getRoot da) da (.getURL doc-source))
                         (.setAutoMediaUpdate false)
                         (.setAutoSizeUpdate true))]
    (doto (.getConfig content-canvas)
      (.setClipViewport false)
      (.setLoadImages true)
      (.setLoadBackgroundImages true))
    (.createLayout content-canvas window-size)
    (write-image (.getImage content-canvas) "png" os)))

(s/defn ^:private render-html-to-png :- bytes
  [{:keys [content]} :- RenderedPulseCard
   width]
  (let [html (html [:html [:body {:style (style {:margin           0
                                                 :padding          0
                                                 :background-color :white})}
                           content]])
        os   (ByteArrayOutputStream.)]
    (render-to-png html os width)
    (.toByteArray os)))


(defn- heading-style-for-type
  [cell]
  (if (instance? NumericWrapper cell)
    (bar-th-numeric-style)
    (bar-th-style)))

(defn- row-style-for-type
  [cell]
  (if (instance? NumericWrapper cell)
    (bar-td-style-numeric)
    (bar-td-style)))

(defn- render-table
  [header+rows]
  [:table {:style (style {:max-width (str "100%"), :white-space :nowrap, :padding-bottom :8px, :border-collapse :collapse})}
   (let [{header-row :row bar-width :bar-width} (first header+rows)]
     [:thead
      [:tr
       (for [header-cell header-row]
         [:th {:style (style (row-style-for-type header-cell) (heading-style-for-type header-cell) {:min-width :60px})}
          (h header-cell)])
       (when bar-width
         [:th {:style (style (bar-td-style) (bar-th-style) {:width (str bar-width "%")})}])]])
   [:tbody
    (map-indexed (fn [row-idx {:keys [row bar-width]}]
                   [:tr {:style (style {:color color-gray-3})}
                    (map-indexed (fn [col-idx cell]
                                   [:td {:style (style (row-style-for-type cell) (when (and bar-width (= col-idx 1)) {:font-weight 700}))}
                                    (h cell)])
                                 row)
                    (when bar-width
                      [:td {:style (style (bar-td-style) {:width :99%})}
                       [:div {:style (style {:background-color color-purple
                                             :max-height       :10px
                                             :height           :10px
                                             :border-radius    :2px
                                             :width            (str bar-width "%")})}
                        "&#160;"]])])
                 (rest header+rows))]])

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
            (NumericWrapper. column-name)
            column-name))
   :bar-width (when include-bar? 99)})

(defn- query-results->row-seq
  "Returns a seq of stringified formatted rows that can be rendered into HTML"
  [timezone remapping-lookup cols rows bar-column max-value]
  (for [row rows]
    {:bar-width (when bar-column
                  ;; cast to double to avoid "Non-terminating decimal expansion" errors
                  (float (* 100 (/ (double (bar-column row)) max-value))))
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
  [:strong {:style (style {:color color-gray-3})} (h (format-number number))])

(defn- render-truncation-warning
  [col-limit col-count row-limit row-count]
  (let [over-row-limit (> row-count row-limit)
        over-col-limit (> col-count col-limit)]
    (when (or over-row-limit over-col-limit)
      [:div {:style (style {:padding-top :16px})}
       (cond

         (and over-row-limit over-col-limit)
         [:div {:style (style {:color color-gray-2
                               :padding-bottom :10px})}
          "Showing " (strong-limit-text row-limit)
          " of "     (strong-limit-text row-count)
          " rows and " (strong-limit-text col-limit)
          " of "     (strong-limit-text col-count)
          " columns."]

         over-row-limit
         [:div {:style (style {:color color-gray-2
                               :padding-bottom :10px})}
          "Showing " (strong-limit-text row-limit)
          " of "     (strong-limit-text row-count)
          " rows."]

         over-col-limit
         [:div {:style (style {:color          color-gray-2
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
    [:div {:style (style {:color         color-gray-2
                          :margin-bottom :16px})}
     "More results have been included as a file attachment"]))

(s/defn ^:private render:table :- RenderedPulseCard
  [render-type timezone card {:keys [cols rows] :as data}]
  (let [table-body [:div
                    (render-table (prep-for-html-rendering timezone cols rows nil nil cols-limit))
                    (render-truncation-warning cols-limit (count-displayed-columns cols) rows-limit (count rows))]]
    {:attachments nil
     :content     (if-let [results-attached (attached-results-text render-type cols cols-limit rows rows-limit)]
                    (list results-attached table-body)
                    (list table-body))}))

(s/defn ^:private render:bar :- RenderedPulseCard
  [timezone card {:keys [cols rows] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (graphing-columns card data)
        max-value (apply max (map y-axis-rowfn rows))]
    {:attachments nil
     :content     [:div
                   (render-table (prep-for-html-rendering timezone cols rows y-axis-rowfn max-value 2))
                   (render-truncation-warning 2 (count-displayed-columns cols) rows-limit (count rows))]}))

(s/defn ^:private render:scalar :- RenderedPulseCard
  [timezone card {:keys [cols rows]}]
  {:attachments nil
   :content     [:div {:style (style (scalar-style))}
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
      (let [^String msg (tru "No appropriate image writer found!")]
        (throw (Exception. msg))))
    (.toByteArray os)))

(defn- hash-bytes
  "Generate a hash to be used in a Content-ID"
  [^bytes img-bytes]
  (Math/abs ^Integer (Arrays/hashCode img-bytes)))

(defn- hash-image-url
  "Generate a hash to be used in a Content-ID"
  [^java.net.URL url]
  (-> url io/input-stream IOUtils/toByteArray hash-bytes))

(defn- content-id-reference [content-id]
  (str "cid:" content-id))

(defn- mb-hash-str [image-hash]
  (str image-hash "@metabase"))

(defn- write-byte-array-to-temp-file
  [^bytes img-bytes]
  (let [f (doto (java.io.File/createTempFile "metabase_pulse_image_" ".png")
            .deleteOnExit)]
    (with-open [fos (java.io.FileOutputStream. f)]
      (.write fos img-bytes))
    f))

(defn- byte-array->url [^bytes img-bytes]
  (-> img-bytes write-byte-array-to-temp-file io/as-url))

(defmulti ^:private make-image-bundle
  "Create an image bundle. An image bundle contains the data needed to either encode the image inline (when
  `render-type` is `:inline`), or create the hashes/references needed for an attached image (`render-type` of
  `:attachment`)"
  (fn [render-type url-or-bytes]
    [render-type (class url-or-bytes)]))

(defmethod make-image-bundle [:attachment java.net.URL]
  [render-type ^java.net.URL url]
  (let [content-id (mb-hash-str (hash-image-url url))]
    {:content-id  content-id
     :image-url   url
     :image-src   (content-id-reference content-id)
     :render-type render-type}))

(defmethod make-image-bundle [:attachment (class (byte-array 0))]
  [render-type image-bytes]
  (let [image-url (byte-array->url image-bytes)
        content-id (mb-hash-str (hash-bytes image-bytes))]
    {:content-id  content-id
     :image-url   image-url
     :image-src   (content-id-reference content-id)
     :render-type render-type}))

(defmethod make-image-bundle [:inline java.net.URL]
  [render-type ^java.net.URL url]
  {:image-src   (-> url io/input-stream IOUtils/toByteArray render-img-data-uri)
   :image-url   url
   :render-type render-type})

(defmethod make-image-bundle [:inline (class (byte-array 0))]
  [render-type image-bytes]
  {:image-src   (render-img-data-uri image-bytes)
   :render-type render-type})

(def ^:private external-link-url (io/resource "frontend_client/app/assets/img/external_link.png"))
(def ^:private no-results-url    (io/resource "frontend_client/app/assets/img/pulse_no_results@2x.png"))
(def ^:private attached-url      (io/resource "frontend_client/app/assets/img/attachment@2x.png"))

(def ^:private external-link-image
  (delay
   (make-image-bundle :attachment external-link-url)))

(def ^:private no-results-image
  (delay
   (make-image-bundle :attachment no-results-url)))

(def ^:private attached-image
  (delay
   (make-image-bundle :attachment attached-url)))

(defn- external-link-image-bundle [render-type]
  (case render-type
    :attachment @external-link-image
    :inline (make-image-bundle render-type external-link-url)))

(defn- no-results-image-bundle [render-type]
  (case render-type
    :attachment @no-results-image
    :inline (make-image-bundle render-type no-results-url)))

(defn- attached-image-bundle [render-type]
  (case render-type
    :attachment @attached-image
    :inline (make-image-bundle render-type attached-url)))

(defn- image-bundle->attachment [{:keys [render-type content-id image-url]}]
  (case render-type
    :attachment {content-id image-url}
    :inline     nil))

(s/defn ^:private render:sparkline :- RenderedPulseCard
  [render-type timezone card {:keys [rows cols] :as data}]
  (let [[x-axis-rowfn y-axis-rowfn] (graphing-columns card data)
        ft-row (if (datetime-field? (x-axis-rowfn cols))
                 #(.getTime ^Date (du/->Timestamp % timezone))
                 identity)
        rows   (if (> (ft-row (x-axis-rowfn (first rows)))
                      (ft-row (x-axis-rowfn (last rows))))
                 (reverse rows)
                 rows)
        xs     (map (comp ft-row x-axis-rowfn) rows)
        xmin   (apply min xs)
        xmax   (apply max xs)
        xrange (- xmax xmin)
        xs'    (map #(/ (double (- % xmin)) xrange) xs)
        ys     (map y-axis-rowfn rows)
        ymin   (apply min ys)
        ymax   (apply max ys)
        yrange (max 1 (- ymax ymin))                    ; `(max 1 ...)` so we don't divide by zero
        ys'    (map #(/ (double (- % ymin)) yrange) ys) ; cast to double to avoid "Non-terminating decimal expansion" errors
        rows'  (reverse (take-last 2 rows))
        values (map (comp format-number y-axis-rowfn) rows')
        labels (format-timestamp-pair timezone (map x-axis-rowfn rows') (x-axis-rowfn cols))
        image-bundle (make-image-bundle render-type (render-sparkline-to-png xs' ys' 524 130))]

    {:attachments (when image-bundle
                    (image-bundle->attachment image-bundle))
     :content     [:div
                   [:img {:style (style {:display :block
                                         :width :100%})
                          :src   (:image-src image-bundle)}]
                   [:table
                    [:tr
                     [:td {:style (style {:color         color-brand
                                          :font-size     :24px
                                          :font-weight   700
                                          :padding-right :16px})}
                      (first values)]
                     [:td {:style (style {:color       color-gray-3
                                          :font-size   :24px
                                          :font-weight 700})}
                      (second values)]]
                    [:tr
                     [:td {:style (style {:color         color-brand
                                          :font-size     :16px
                                          :font-weight   700
                                          :padding-right :16px})}
                      (first labels)]
                     [:td {:style (style {:color     color-gray-3
                                          :font-size :16px})}
                      (second labels)]]]]}))

(s/defn ^:private render:empty :- RenderedPulseCard
  [render-type _ _]
  (let [image-bundle (no-results-image-bundle render-type)]
    {:attachments (image-bundle->attachment image-bundle)
     :content     [:div {:style (style {:text-align :center})}
                   [:img {:style (style {:width :104px})
                          :src   (:image-src image-bundle)}]
                   [:div {:style (style (font-style)
                                        {:margin-top :8px
                                         :color      color-gray-4})}
                    "No results"]]}))

(s/defn ^:private render:attached :- RenderedPulseCard
  [render-type _ _]
  (let [image-bundle (attached-image-bundle render-type)]
    {:attachments (image-bundle->attachment image-bundle)
     :content     [:div {:style (style {:text-align :center})}
                   [:img {:style (style {:width :30px})
                          :src   (:image-src image-bundle)}]
                   [:div {:style (style (font-style)
                                        {:margin-top :8px
                                         :color      color-gray-4})}
                    "This question has been included as a file attachment"]]}))

(s/defn ^:private render:unknown :- RenderedPulseCard
  [_ _]
  {:attachments nil
   :content     [:div {:style (style (font-style)
                                     {:color       color-gold
                                      :font-weight 700})}
                 "We were unable to display this card."
                 [:br]
                 "Please view this card in Metabase."]})

(s/defn ^:private render:error :- RenderedPulseCard
  [_ _]
  {:attachments nil
   :content     [:div {:style (style (font-style)
                                     {:color       color-error
                                      :font-weight 700
                                      :padding     :16px})}
                 "An error occurred while displaying this card."]})

(s/defn ^:private make-title-if-needed :- (s/maybe RenderedPulseCard)
  [render-type card]
  (when *include-title*
    (let [image-bundle (when *include-buttons*
                         (external-link-image-bundle render-type))]
      {:attachments (when image-bundle
                      (image-bundle->attachment image-bundle))
       :content     [:table {:style (style {:margin-bottom   :8px
                                            :border-collapse :collapse
                                            :width           :100%})}
                     [:tbody
                      [:tr
                       [:td {:style (style {:padding :0
                                            :margin  :0})}
                        [:span {:style (style (header-style))}
                             (-> card :name h)]]
                       [:td {:style (style {:text-align :right})}
                        (when *include-buttons*
                          [:img {:style (style {:width :16px})
                                 :width 16
                                 :src   (:image-src image-bundle)}])]]]]})))

(defn- is-attached?
  [card]
  (or (:include_csv card)
      (:include_xls card)))

(s/defn ^:private render-pulse-card-body :- RenderedPulseCard
  [render-type timezone card {:keys [data error]}]
  (try
    (when error
      (let [^String msg (tru "Card has errors: {0}" error)]
        (throw (Exception. msg))))
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

(s/defn ^:private render-pulse-card :- RenderedPulseCard
  "Render a single CARD for a `Pulse` to Hiccup HTML. RESULT is the QP results."
  [render-type timezone card results]
  (let [{title :content title-attachments :attachments} (make-title-if-needed render-type card)
        {pulse-body :content body-attachments :attachments} (render-pulse-card-body render-type timezone card results)]
    {:attachments (merge title-attachments body-attachments)
     :content     [:a {:href   (card-href card)
                       :target "_blank"
                       :style  (style (section-style)
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

(s/defn render-pulse-section :- RenderedPulseCard
  "Render a specific section of a Pulse, i.e. a single Card, to Hiccup HTML."
  [timezone {card :card {:keys [data] :as result} :result}]
  (let [{:keys [attachments content]} (binding [*include-title* true]
                                        (render-pulse-card :attachment timezone card result))]
    {:attachments attachments
     :content     [:div {:style (style (merge {:margin-top       :10px
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
  (render-html-to-png (render-pulse-card :inline timezone pulse-card result) card-width))
