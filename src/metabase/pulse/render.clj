(ns metabase.pulse.render
  (:require [clj-time
             [coerce :as c]
             [core :as t]
             [format :as f]]
            [clojure
             [pprint :refer [cl-format]]
             [string :as s]]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [hiccup.core :refer [h html]]
            [metabase.util :as u]
            [metabase.util.urls :as urls])
  (:import cz.vutbr.web.css.MediaSpec
           [java.awt BasicStroke Color Dimension RenderingHints]
           java.awt.image.BufferedImage
           [java.io ByteArrayInputStream ByteArrayOutputStream]
           java.nio.charset.StandardCharsets
           java.util.Date
           javax.imageio.ImageIO
           org.apache.commons.io.IOUtils
           [org.fit.cssbox.css CSSNorm DOMAnalyzer DOMAnalyzer$Origin]
           [org.fit.cssbox.io DefaultDOMSource StreamDocumentSource]
           org.fit.cssbox.layout.BrowserCanvas
           org.fit.cssbox.misc.Base64Coder))

;; NOTE: hiccup does not escape content by default so be sure to use "h" to escape any user-controlled content :-/

;;; # ------------------------------------------------------------ STYLES ------------------------------------------------------------

(def ^:private ^:const card-width 400)
(def ^:private ^:const rows-limit 10)
(def ^:private ^:const cols-limit 3)
(def ^:private ^:const sparkline-dot-radius 6)
(def ^:private ^:const sparkline-thickness 3)
(def ^:private ^:const sparkline-pad 8)

;;; ## STYLES
(def ^:private ^:const color-brand  "rgb(45,134,212)")
(def ^:private ^:const color-purple "rgb(135,93,175)")
(def ^:private ^:const color-gray-1 "rgb(248,248,248)")
(def ^:private ^:const color-gray-2 "rgb(189,193,191)")
(def ^:private ^:const color-gray-3 "rgb(124,131,129)")
(def ^:const color-gray-4 "A ~25% Gray color." "rgb(57,67,64)")

(def ^:private ^:const font-style    {:font-family "Lato, \"Helvetica Neue\", Helvetica, Arial, sans-serif"})
(def ^:const section-style
  "CSS style for a Pulse section."
  font-style)

(def ^:private ^:const header-style
  (merge font-style {:font-size       :16px
                     :font-weight     700
                     :color           color-gray-4
                     :text-decoration :none}))

(def ^:private ^:const scalar-style
  (merge font-style {:font-size   :24px
                     :font-weight 700
                     :color       color-brand}))

(def ^:private ^:const bar-th-style
  (merge font-style {:font-size      :10px
                     :font-weight    400
                     :color          color-gray-4
                     :border-bottom  (str "4px solid " color-gray-1)
                     :padding-top    :0px
                     :padding-bottom :10px}))

(def ^:private ^:const bar-td-style
  (merge font-style {:font-size     :16px
                     :font-weight   400
                     :text-align    :left
                     :padding-right :1em
                     :padding-top   :8px}))


;;; # ------------------------------------------------------------ HELPER FNS ------------------------------------------------------------

(defn- style
  "Compile one or more CSS style maps into a string.

     (style {:font-weight 400, :color \"white\"}) -> \"font-weight: 400; color: white;\""
  [& style-maps]
  (s/join " " (for [[k v] (into {} style-maps)
                    :let  [v (if (keyword? v) (name v) v)]]
                (str (name k) ": " v ";"))))


(defn- datetime-field?
  [field]
  (or (isa? (:base_type field) :type/DateTime)
      (isa? (:base_type field) :type/DateTime)))

(defn- number-field?
  [field]
  (or (isa? (:base_type field)    :type/Number)
      (isa? (:special_type field) :type/Number)))


;;; # ------------------------------------------------------------ FORMATTING ------------------------------------------------------------

(defn- format-number
  [n]
  (cl-format nil (if (integer? n) "~:d" "~,2f") n))

(defn- format-timestamp
  "Formats timestamps with human friendly absolute dates based on the column :unit"
  [timestamp col]
  (case (:unit col)
    :hour          (f/unparse (f/formatter "h a - MMM YYYY") (c/from-long timestamp))
    :week          (str "Week " (f/unparse (f/formatter "w - YYYY") (c/from-long timestamp)))
    :month         (f/unparse (f/formatter "MMMM YYYY") (c/from-long timestamp))
    :quarter       (str "Q"
                        (inc (int (/ (t/month (c/from-long timestamp))
                                     3)))
                        " - "
                        (t/year (c/from-long timestamp)))
    :year          (str timestamp)
    :hour-of-day   (str timestamp) ; TODO: probably shouldn't even be showing sparkline for x-of-y groupings?
    :day-of-week   (str timestamp)
    :week-of-year  (str timestamp)
    :month-of-year (str timestamp)
    (f/unparse (f/formatter "MMM d, YYYY") (c/from-long timestamp))))

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
  "Formats timestamps with relative names (today, yesterday, this *, last *) based on column :unit, if possible, otherwie returns nil"
  [timestamp, {:keys [unit]}]
  (case unit
    :day     (date->interval-name (c/from-long timestamp)     (t/date-midnight (year) (month) (day)) (t/days 1)   "Today"        "Yesterday")
    :week    (date->interval-name (c/from-long timestamp)     (start-of-this-week)                   (t/weeks 1)  "This week"    "Last week")
    :month   (date->interval-name (c/from-long timestamp)     (t/date-midnight (year) (month))       (t/months 1) "This month"   "Last month")
    :quarter (date->interval-name (c/from-long timestamp)     (start-of-this-quarter)                (t/months 3) "This quarter" "Last quarter")
    :year    (date->interval-name (t/date-midnight timestamp) (t/date-midnight (year))               (t/years 1)  "This year"    "Last year")
    nil))


(defn- format-timestamp-pair
  "Formats a pair of timestamps, using relative formatting for the first timestamps if possible and 'Previous :unit' for the second, otherwise absolute timestamps for both"
  [[a b] col]
  (if-let [a' (format-timestamp-relative a col)]
    [a' (str "Previous " (-> col :unit name))]
    [(format-timestamp a col) (format-timestamp b col)]))

(defn- format-cell
  [value col]
  (cond
    (datetime-field? col) (format-timestamp (.getTime ^Date (u/->Timestamp value)) col)
    (and (number? value) (not (datetime-field? col))) (format-number value)
    :else (str value)))


(defn- render-img-data-uri
  "Takes a PNG byte array and returns a Base64 encoded URI"
  [img-bytes]
  (str "data:image/png;base64," (String. (Base64Coder/encode img-bytes))))

;;; # ------------------------------------------------------------ RENDERING ------------------------------------------------------------

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
    (ImageIO/write (.getImage content-canvas) "png" os)))

(defn- render-html-to-png
  ^bytes [html-body width]
  (let [html (html [:html [:body {:style (style {:margin           0
                                                 :padding          0
                                                 :background-color :white})}
                           html-body]])
        os   (ByteArrayOutputStream.)]
    (render-to-png html os width)
    (.toByteArray os)))

(defn- render-table
  [card rows cols col-indexes bar-column]
  (let [max-value (if bar-column (apply max (map bar-column rows)))]
    [:table {:style (style {:padding-bottom :8px, :border-bottom (str "4px solid " color-gray-1)})}
     [:thead
      [:tr
       (for [col-idx col-indexes :let [col (nth cols col-idx)]]
         [:th {:style (style bar-td-style bar-th-style {:min-width :60px})}
          (h (s/upper-case (name (or (:display_name col) (:name col)))))])
       (when bar-column
         [:th {:style (style bar-td-style bar-th-style {:width "99%"})}])]]
     [:tbody
      (map-indexed (fn [row-idx row]
                     [:tr {:style (style {:color (if (odd? row-idx) color-gray-2 color-gray-3)})}
                      (for [col-idx col-indexes :let [col (nth cols col-idx)]]
                        [:td {:style (style bar-td-style (when (and bar-column (= col-idx 1)) {:font-weight 700}))}
                         (-> row (nth col-idx) (format-cell col) h)])
                      (when bar-column
                        [:td {:style (style bar-td-style {:width :99%})}
                         [:div {:style (style {:background-color color-purple
                                               :max-height       :10px
                                               :height           :10px
                                               :border-radius    :2px
                                               :width            (str (float (* 100 (/ (double (bar-column row)) max-value))) "%")})} ; cast to double to avoid "Non-terminating decimal expansion" errors
                          "&#160;"]])])
                   rows)]]))

(defn- render-truncation-warning
  [card {:keys [cols rows]} rows-limit cols-limit]
  (if (or (> (count rows) rows-limit)
          (> (count cols) cols-limit))
    [:div {:style (style {:padding-top :16px})}
     (cond
       (> (count rows) rows-limit)
       [:div {:style (style {:color color-gray-2
                             :padding-bottom :10px})}
        "Showing " [:strong {:style (style {:color color-gray-3})} (format-number rows-limit)]
        " of "     [:strong {:style (style {:color color-gray-3})} (format-number (count rows))]
        " rows."]

       (> (count cols) cols-limit)
       [:div {:style (style {:color          color-gray-2
                             :padding-bottom :10px})}
        "Showing " [:strong {:style (style {:color color-gray-3})} (format-number cols-limit)]
        " of "     [:strong {:style (style {:color color-gray-3})} (format-number (count cols))]
        " columns."])]))

(defn- render:table
  [card {:keys [cols rows] :as data}]
  (let [truncated-rows (take rows-limit rows)
        truncated-cols (take cols-limit cols)
        col-indexes    (map-indexed (fn [i _] i) truncated-cols)]
    [:div
     (render-table card truncated-rows truncated-cols col-indexes nil)
     (render-truncation-warning card data rows-limit cols-limit)]))

(defn- render:bar
  [card {:keys [cols rows] :as data}]
  (let [truncated-rows (take rows-limit rows)]
    [:div
     (render-table card truncated-rows cols [0 1] second)
     (render-truncation-warning card data rows-limit 2)]))

(defn- render:scalar
  [card {:keys [cols rows]}]
  [:div {:style (style scalar-style)}
   (-> rows first first (format-cell (first cols)) h)])

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
      (throw (Exception. "No approprate image writer found!")))
    (.toByteArray os)))

(defn- render:sparkline
  [_ {:keys [rows cols]}]
  (let [ft-row (if (datetime-field? (first cols))
                 #(.getTime ^Date (u/->Timestamp %))
                 identity)
        rows   (if (> (ft-row (ffirst rows))
                      (ft-row (first (last rows))))
                 (reverse rows)
                 rows)
        xs     (for [row  rows
                     :let [x (first row)]]
                 (ft-row x))
        xmin   (apply min xs)
        xmax   (apply max xs)
        xrange (- xmax xmin)
        xs'    (map #(/ (double (- % xmin)) xrange) xs)
        ys     (map second rows)
        ymin   (apply min ys)
        ymax   (apply max ys)
        yrange (max 1 (- ymax ymin))                    ; `(max 1 ...)` so we don't divide by zero
        ys'    (map #(/ (double (- % ymin)) yrange) ys) ; cast to double to avoid "Non-terminating decimal expansion" errors
        rows'  (reverse (take-last 2 rows))
        values (map (comp format-number second) rows')
        labels (format-timestamp-pair (map first rows') (first cols))]
    [:div
     [:img {:style (style {:display :block
                           :width :100%})
            :src   (*render-img-fn* (render-sparkline-to-png xs' ys' 524 130))}]
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
        (second labels)]]]]))

(defn- render-image-with-filename [^String filename]
  (*render-img-fn* (IOUtils/toByteArray (io/input-stream (io/resource filename)))))

(defn- render:empty [_ _]
  [:div {:style (style {:text-align :center})}
   [:img {:style (style {:width :104px})
          :src   (render-image-with-filename "frontend_client/app/img/pulse_no_results@2x.png")}]
   [:div {:style (style {:margin-top :8px
                         :color      color-gray-4})}
    "No results"]])

(defn detect-pulse-card-type
  "Determine the pulse (visualization) type of a CARD, e.g. `:scalar` or `:bar`."
  [card data]
  (let [col-count (-> data :cols count)
        row-count (-> data :rows count)
        col-1 (-> data :cols first)
        col-2 (-> data :cols second)
        aggregation (-> card :dataset_query :query :aggregation first)]
    (cond
      (or (= aggregation :rows)
          (contains? #{:pin_map :state :country} (:display card))) nil
      (or (zero? row-count)
          ;; Many aggregations result in [[nil]] if there are no rows to aggregate after filters
          (= [[nil]] (-> data :rows)))                             :empty
      (and (= col-count 1)
           (= row-count 1))                                        :scalar
      (and (= col-count 2)
           (> row-count 1)
           (datetime-field? col-1)
           (number-field? col-2))                                  :sparkline
      (and (= col-count 2)
           (number-field? col-2))                                  :bar
      :else                                                        :table)))

(defn render-pulse-card
  "Render a single CARD for a `Pulse` to Hiccup HTML. RESULT is the QP results."
  [card {:keys [data error]}]
  [:a {:href   (card-href card)
       :target "_blank"
       :style  (style section-style
                      {:margin          :16px
                       :margin-bottom   :16px
                       :display         :block
                       :text-decoration :none})}
   (when *include-title*
     [:table {:style (style {:margin-bottom :8px
                             :width         :100%})}
      [:tbody
       [:tr
        [:td [:span {:style header-style}
              (-> card :name h)]]
        [:td {:style (style {:text-align :right})}
         (when *include-buttons*
           [:img {:style (style {:width :16px})
                  :width 16
                  :src   (render-image-with-filename "frontend_client/app/img/external_link.png")}])]]]])
  (try
    (when error
      (throw (Exception. (str "Card has errors: " error))))
    (case (detect-pulse-card-type card data)
      :empty     (render:empty     card data)
      :scalar    (render:scalar    card data)
      :sparkline (render:sparkline card data)
      :bar       (render:bar       card data)
      :table     (render:table     card data)
      [:div {:style (style font-style
                           {:color       "#F9D45C"
                            :font-weight 700})}
       "We were unable to display this card." [:br] "Please view this card in Metabase."])
    (catch Throwable e
      (log/warn "Pulse card render error:" e)
      [:div {:style (style font-style
                           {:color       "#EF8C8C"
                            :font-weight 700
                            :padding     :16px})}
       "An error occurred while displaying this card."]))])


(defn render-pulse-section
  "Render a specific section of a Pulse, i.e. a single Card, to Hiccup HTML."
  [{:keys [card result]}]
  [:div {:style (style {:margin-top       :10px
                        :margin-bottom    :20px
                        :border           "1px solid #dddddd"
                        :border-radius    :2px
                        :background-color :white
                        :box-shadow       "0 1px 2px rgba(0, 0, 0, .08)"})}
   (binding [*include-title* true]
     (render-pulse-card card result))])

(defn render-pulse-card-to-png
  "Render a PULSE-CARD as a PNG. DATA is the `:data` from a QP result (I think...)"
  ^bytes [pulse-card result]
  (render-html-to-png (render-pulse-card pulse-card result) card-width))
