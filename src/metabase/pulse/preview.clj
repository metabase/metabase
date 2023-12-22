(ns metabase.pulse.preview
  "Improve the feedback loop for Dashboard Subscription outputs."
  (:require
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [clojure.zip :as zip]
   [hiccup.core :as hiccup]
   [hickory.core :as hik]
   [hickory.render :as hik.r]
   [hickory.zip :as hik.z]
   [metabase.email.messages :as messages]
   [metabase.pulse :as pulse]
   [metabase.pulse.markdown :as markdown]
   [metabase.pulse.render :as render]
   [metabase.pulse.render.image-bundle :as img]
   [metabase.pulse.render.png :as png]
   [metabase.pulse.render.style :as style]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private table-style-map
  {:border          "1px solid black"
   :border-collapse "collapse"
   :padding         "5px"})

(def ^:private table-style
  (style/style table-style-map))

(def ^:private csv-row-limit 10)

(defn- csv-to-html-table [csv-string]
  (let [rows (csv/read-csv csv-string)]
    [:table {:style table-style}
     (for [row (take (inc csv-row-limit) rows)] ;; inc row-limit to include the header and the expected # of rows
       [:tr {:style table-style}
        (for [cell row]
          [:td {:style table-style} cell])])]))

(def ^:private result-attachment #'messages/result-attachment)

(defn- render-csv-for-dashcard
  [part]
  (-> part
      (assoc-in [:card :include_csv] true)
      result-attachment
      first
      :content
      slurp
      csv-to-html-table))

(defn- render-one-dashcard
  [{:keys [card dashcard result] :as dashboard-result}]
  (letfn [(cellfn [content]
            [:td {:style (style/style (merge table-style-map {:max-width "400px"}))}
             content])]
    (if card
      (let [base-render (render/render-pulse-card :inline (pulse/defaulted-timezone card) card dashcard result)
            html-src    (-> base-render :content)
            img-src     (-> base-render
                            (png/render-html-to-png 1200)
                            img/render-img-data-uri)
            csv-src (render-csv-for-dashcard dashboard-result)]
        [:tr
         (cellfn (:name card))
         (cellfn [:img {:style (style/style {:max-width "400px"}) :src img-src}])
         (cellfn html-src)
         (cellfn csv-src)])
      [:tr
       (cellfn nil)
       (cellfn
        [:div {:style (style/style {:font-family             "Lato"
                                    :font-size               "13px" #_ "0.875em"
                                    :font-weight             "400"
                                    :font-style              "normal"
                                    :color                   "#4c5773"
                                    :-moz-osx-font-smoothing "grayscale"})}
         (markdown/process-markdown (:text dashboard-result) :html)])
       (cellfn nil)])))

(def ^:private execute-dashboard #'pulse/execute-dashboard)

(defn render-dashboard-to-hiccup
  "Given a dashboard ID, renders all of the dashcards to hiccup datastructure."
  [dashboard-id]
  (let [user              (t2/select-one :model/User)
        dashboard         (t2/select-one :model/Dashboard :id dashboard-id)
        dashboard-results (execute-dashboard {:creator_id (:id user)} dashboard)
        render            (->> (map render-one-dashcard (map #(assoc % :dashboard-id dashboard-id) dashboard-results))
                               (into [[:tr
                                       [:th {:style (style/style table-style-map)} "Card Name"]
                                       [:th {:style (style/style table-style-map)} "PNG"]
                                       [:th {:style (style/style table-style-map)} "HTML"]
                                       [:th {:style (style/style table-style-map)} "CSV"]]])
                               (into [:table {:style (style/style table-style-map)}]))]
    render))

(defn render-dashboard-to-html
  "Given a dashboard ID, renders all of the dashcards into an html document."
  [dashboard-id]
  (hiccup/html (render-dashboard-to-hiccup dashboard-id)))

(defn- collect-inline-style
  [style-lines {:keys [attrs] :as node}]
  (let [{:keys [style]} attrs]
    (if style
      (let [{:keys [id] :or {id (str (gensym "inline"))}} attrs]
        (swap! style-lines assoc id style)
        (-> node
            (update :attrs dissoc :style)
            (update :attrs assoc :id id)))
      node)))

(defn- css-str-fragment
  [[id css-str]]
  (format "#%s {%s}" id css-str))

(defn- style-node
  [style-lines-map]
  {:type    :element
   :tag     :style
   :attrs   {:nonce "%NONCE%"}
   :content [(str/join "\n" (map css-str-fragment style-lines-map))]})

(defn- move-inline-styles
  [hickory-tree]
  (let [zipper      (hik.z/hickory-zip hickory-tree)
        style-lines (atom {})
        xf-tree     (loop [loc zipper]
                      (if (zip/end? loc)
                        (zip/root loc)
                        (recur (zip/next (zip/edit loc (partial collect-inline-style style-lines))))))]
    (update xf-tree :content
            (fn [v]
              (vec (conj (seq v) (style-node @style-lines)))))))

(defn style-tag-from-inline-styles
  "Collects styles defined on element 'style' attributes and adds them to a single inline style tag.
  Each element that does not already have an 'id' attribute will have one generated, and the style will be added under that id, or the element's existing id.

  For example, the html string \"<p style='color: red;'>This is red text.</p>\"  Will result in a CSS map-entry
  that looks like: #inline12345 {color: red;}.

  This approach will capture all inline styles but is naive and will result in lots of style duplications. Since this
  is a simple preview endpoint not meant for heavy use outside of manual checks, this slower approach seems ok for now (as of 2023-12-18)."
  [html-str]
  (-> html-str
      hik/parse
      hik/as-hickory
      move-inline-styles
      hik.r/hickory-to-html))

(defn- add-style-nonce [request response]
  (update response :body (fn [html-str]
                           (str/replace html-str #"%NONCE%" (:nonce request)))))

(defn style-tag-nonce-middleware
  "Constructs a middleware handler function that adds the generated nonce to an html string.
  This is only designed to be used with an endpoint that returns an html string response containing
  a style tag with an attribute 'nonce=%NONCE%'. Specifcally, this was designed to be used with the
  endpoint `api/pulse/preview_dashboard/:id`."
  [only-this-uri handler]
  (fn [request respond raise]
    (let [{:keys [uri]} request]
      (handler
       request
       (if (str/starts-with? uri only-this-uri)
         (comp respond (partial add-style-nonce request))
         respond)
       raise))))
