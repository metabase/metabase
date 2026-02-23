(ns metabase.documents.pdf
  "Core orchestration for document PDF export.
  Converts ProseMirror AST to Hiccup, wraps in XHTML, and renders to PDF bytes."
  (:require
   [clojure.string :as str]
   [metabase.channel.urls :as urls]
   [metabase.documents.pdf.card-render :as card-render]
   [metabase.documents.pdf.render :as pdf.render]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defrecord RawContent [^String content])

;;; ------------------------------------------------ Text marks -------------------------------------------------------

(defn- apply-marks
  "Wrap content in mark elements (bold, italic, code, link, etc.)."
  [content marks]
  (reduce (fn [acc {:keys [type attrs]}]
            (case type
              "bold"          [:strong acc]
              "italic"        [:em acc]
              "code"          [:code acc]
              "link"          [:a {:href (:href attrs)} acc]
              "underline"     [:u acc]
              "strikethrough" [:s acc]
              acc))
          content
          marks))

;;; ---------------------------------------- AST node → Hiccup multimethod -------------------------------------------

(defmulti ast-node->hiccup
  "Convert a ProseMirror AST node to a Hiccup structure."
  (fn [node _card-images] (:type node)))

(defn- render-children [node card-images]
  (mapv #(ast-node->hiccup % card-images) (:content node)))

(defmethod ast-node->hiccup :default
  [node card-images]
  (when (:content node)
    (into [:div] (render-children node card-images))))

(defmethod ast-node->hiccup "doc"
  [node card-images]
  (into [:div] (render-children node card-images)))

(defmethod ast-node->hiccup "paragraph"
  [node card-images]
  (if (:content node)
    (into [:p] (render-children node card-images))
    [:p]))

(defmethod ast-node->hiccup "heading"
  [node card-images]
  (let [level (get-in node [:attrs :level] 1)
        tag   (keyword (str "h" (min level 6)))]
    (into [tag] (render-children node card-images))))

(defmethod ast-node->hiccup "bulletList"
  [node card-images]
  (into [:ul] (render-children node card-images)))

(defmethod ast-node->hiccup "orderedList"
  [node card-images]
  (into [:ol] (render-children node card-images)))

(defmethod ast-node->hiccup "listItem"
  [node card-images]
  (into [:li] (render-children node card-images)))

(defmethod ast-node->hiccup "blockquote"
  [node card-images]
  (into [:blockquote] (render-children node card-images)))

(defmethod ast-node->hiccup "codeBlock"
  [node card-images]
  [:pre [:code (into [:<>] (render-children node card-images))]])

(defmethod ast-node->hiccup "horizontalRule"
  [_node _card-images]
  [:hr])

(defmethod ast-node->hiccup "hardBreak"
  [_node _card-images]
  [:br])

(defmethod ast-node->hiccup "text"
  [node _card-images]
  (let [text (:text node)]
    (if-let [marks (seq (:marks node))]
      (apply-marks text marks)
      text)))

(defn- sanitize-svg-for-pdf
  "Sanitize an SVG string for inline embedding in the PDF XHTML.
  Removes invalid XML characters, replaces fill=transparent (unsupported by Batik),
  and strips <style> elements (contain :hover rules irrelevant for PDF)."
  [^String svg-string]
  (-> svg-string
      (str/replace #"[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]" "")
      (str/replace "fill=\"transparent\"" "fill-opacity=\"0.0\"")
      (str/replace #"(?s)<style[^>]*>.*?</style>" "")))

(defmethod ast-node->hiccup "cardEmbed"
  [node card-images]
  (let [card-id   (get-in node [:attrs :id])
        render    (get card-images card-id)
        card-name (or (get-in node [:attrs :name])
                      (:card-name render)
                      (str "Card " card-id))]
    (if (and render (= :ok (:status render)))
      (let [card-url  (when-let [cid (:card-id render)]
                        (urls/card-url cid))
            title     (if card-url
                        [:div {:class "card-title"}
                         [:a {:href card-url
                              :style "color: #2B3238; text-decoration: none;"}
                          card-name]]
                        [:div {:class "card-title"} card-name])]
        (case (or (:format render) :png)
          :svg    [:div {:class "card-embed"}
                   title
                   [:div {:class "card-content"}
                    (->RawContent (sanitize-svg-for-pdf (:content render)))]]
          :html   [:div {:class "card-embed"}
                   title
                   [:div {:class "card-content"} (->RawContent (:content render))]]
          :hiccup [:div {:class "card-embed"}
                   title
                   [:div {:class "card-content"} (:content render)]]
          :png    [:div {:class "card-embed"}
                   title
                   [:img {:src (:data-uri render) :class "card-image"}]]))
      [:div {:class "card-embed card-error"}
       [:div {:class "card-title"} card-name]
       [:div {:class "error-message"}
        (or (:message render) "Unable to render this card")]])))

(defmethod ast-node->hiccup "flexContainer"
  [node card-images]
  (let [children     (:content node)
        col-widths   (get-in node [:attrs :columnWidths])
        child-count  (count children)
        widths       (if (and col-widths (= (count col-widths) child-count))
                       (mapv #(str % "%") col-widths)
                       (repeat child-count (str (/ 100.0 child-count) "%")))]
    [:table {:class "flex-container"}
     (into [:tr]
           (map-indexed (fn [i child]
                          [:td {:style (str "width: " (nth widths i) "; vertical-align: top;")}
                           (ast-node->hiccup child card-images)])
                        children))]))

(defmethod ast-node->hiccup "resizeNode"
  [node card-images]
  (into [:div] (render-children node card-images)))

(defmethod ast-node->hiccup "supportingText"
  [node card-images]
  (into [:div {:class "supporting-text"}] (render-children node card-images)))

(def ^:private smart-link-model->toucan-model
  {"card"       :model/Card
   "dataset"    :model/Card
   "metric"     :model/Card
   "table"      :model/Table
   "database"   :model/Database
   "dashboard"  :model/Dashboard
   "collection" :model/Collection
   "document"   :model/Document})

(def ^:private smart-link-icon-paths
  {"card"       "M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm1.5 6V7h1.947v2H3.5zm0 1.5v2h1.947v-2H3.5zm3.447 0v2H12.5v-2H6.947zM12.5 9V7H6.947v2H12.5zM5.447 5.5H3.5v-2h1.947v2zm1.5 0H12.5v-2H6.947v2z"
   "dataset"    "M8.5 1.423a1 1 0 0 0-1 0L2.554 4.278a1 1 0 0 0-.5.866v5.712a1 1 0 0 0 .5.866L7.5 14.577a1 1 0 0 0 1 0l4.946-2.855a1 1 0 0 0 .5-.866V5.144a1 1 0 0 0-.5-.866L8.5 1.423zM3.554 6.207v4.36l3.696 2.134V8.425L3.554 6.207zM8.75 12.7l3.696-2.134v-4.36L8.75 8.425V12.7zm2.868-7.746L8 2.866 4.382 4.955 8 7.125l3.618-2.17z"
   "metric"     "M8.5 1.423a1 1 0 0 0-1 0L2.554 4.278a1 1 0 0 0-.5.866v5.712a1 1 0 0 0 .5.866L7.5 14.577a1 1 0 0 0 1 0l4.946-2.855a1 1 0 0 0 .5-.866V5.144a1 1 0 0 0-.5-.866L8.5 1.423zM3.554 6.207v4.36l3.696 2.134V8.425L3.554 6.207zM8.75 12.7l3.696-2.134v-4.36L8.75 8.425V12.7zm2.868-7.746L8 2.866 4.382 4.955 8 7.125l3.618-2.17z"
   "table"      "M12.667 1.25c1.15 0 2.083.933 2.083 2.083v9.334c0 1.15-.933 2.083-2.083 2.083H3.333a2.083 2.083 0 0 1-2.083-2.083V3.333c0-1.15.933-2.083 2.083-2.083h9.334zm-9.917 9.5v1.917c0 .322.261.583.583.583H7.25v-2.5h-4.5zm6 0v2.5h3.917a.583.583 0 0 0 .583-.583V10.75h-4.5zm-6-1.5h4.5v-2.5h-4.5v2.5zm6 0h4.5v-2.5h-4.5v2.5zm-5.417-6.5a.583.583 0 0 0-.583.583V5.25h4.5v-2.5H3.333zm5.417 2.5h4.5V3.333a.583.583 0 0 0-.583-.583H8.75v2.5z"
   "database"   "M2.665 13.67A.75.75 0 0 1 2.25 13V3a.75.75 0 0 1 .415-.67l.002-.002.002-.001.008-.004.024-.011a7.465 7.465 0 0 1 .38-.164c.255-.103.623-.236 1.088-.37A14.023 14.023 0 0 1 8 1.25c1.583 0 2.903.264 3.831.529.465.133.833.266 1.088.368a7.5 7.5 0 0 1 .38.165l.024.011.008.004.003.001L13 3l.335-.671A.751.751 0 0 1 13.75 3v10a.75.75 0 0 1-.415.67l-.002.002-.002.001-.008.004-.024.011a7.443 7.443 0 0 1-.38.164 11.33 11.33 0 0 1-1.088.37A14.02 14.02 0 0 1 8 14.75a14.02 14.02 0 0 1-3.831-.529 11.327 11.327 0 0 1-1.088-.368 7.409 7.409 0 0 1-.38-.165l-.024-.011-.008-.004-.002-.001-.002-.001zM3.75 3.497c.207-.079.487-.177.831-.275A12.524 12.524 0 0 1 8 2.75c1.417 0 2.597.236 3.419.471.344.098.624.196.831.275v1.24l-.096.038c-.327.133-.642.26-1.106.388-.674.185-1.604.338-3.048.338s-2.374-.153-3.049-.338a8.97 8.97 0 0 1-1.106-.388l-.095-.039V3.496zm7.695 3.113c.289-.08.559-.171.805-.262v2.388l-.096.04c-.327.132-.642.26-1.106.387-.674.185-1.604.338-3.048.338s-2.374-.153-3.049-.338a8.97 8.97 0 0 1-1.201-.427V6.347c.246.091.516.182.805.262C5.378 6.834 6.444 7 8 7c1.556 0 2.621-.166 3.445-.391zM3.75 10.347v2.157c.207.079.487.177.831.275.822.235 2.002.471 3.419.471 1.417 0 2.597-.236 3.419-.471.344-.098.624-.196.831-.275v-2.157c-.246.09-.516.182-.805.261-.824.226-1.89.393-3.445.393-1.556 0-2.622-.167-3.445-.393a9.777 9.777 0 0 1-.805-.26z"
   "dashboard"  "M4.75 9a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5zM4 6.25a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.75 5.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5zM1.25 3c0-.966.784-1.75 1.75-1.75h10c.966 0 1.75.784 1.75 1.75v10A1.75 1.75 0 0 1 13 14.75H3A1.75 1.75 0 0 1 1.25 13V3zm1.5 10V3.5h10.5V13a.25.25 0 0 1-.25.25H3a.25.25 0 0 1-.25-.25z"
   "collection" "M3.2 3.75a.501.501 0 0 0-.339.126.322.322 0 0 0-.111.235v7.778c0 .076.032.162.111.235a.5.5 0 0 0 .339.126h9.6a.501.501 0 0 0 .339-.126.322.322 0 0 0 .111-.235v-5.96a.322.322 0 0 0-.111-.235.501.501 0 0 0-.339-.126H7.71l-2-1.818H3.2zm-1.358-.975A2 2 0 0 1 3.2 2.25h3.09l2 1.818h4.51a2 2 0 0 1 1.358.525c.371.344.592.823.592 1.336v5.96c0 .513-.22.992-.592 1.336a2 2 0 0 1-1.358.525H3.2a2 2 0 0 1-1.358-.525 1.821 1.821 0 0 1-.592-1.336V4.11c0-.513.22-.992.592-1.336z"
   "document"   "M8.848 1.25c.451 0 .886.175 1.212.487l3.152 3.027c.344.33.538.786.538 1.262V12.8c0 .527-.219 1.026-.597 1.39-.377.362-.882.56-1.403.56h-7.5c-.52 0-1.026-.199-1.403-.56-.331-.318-.54-.74-.587-1.194l-.01-.196V3.2c0-.527.218-1.026.597-1.39.377-.361.882-.56 1.403-.56h4.598zM4.25 2.75a.528.528 0 0 0-.364.143.427.427 0 0 0-.136.307v9.6l.009.082c.017.081.059.16.127.225a.528.528 0 0 0 .364.143h7.5a.528.528 0 0 0 .364-.143.428.428 0 0 0 .136-.307V6.575H9.249A.575.575 0 0 1 8.674 6V2.75H4.25zm6.4 7.425a.576.576 0 0 1 0 1.15H5.4a.575.575 0 0 1 0-1.15h5.25zm0-2.25a.576.576 0 0 1 0 1.15H5.4a.575.575 0 0 1 0-1.15h5.25zm-3.651-2.25a.576.576 0 0 1 0 1.15h-1.6a.575.575 0 0 1 0-1.15H7zm2.825-.25h1.91L9.824 3.59v1.834z"})

(defn- smart-link-icon-data-uri
  "Return a base64-encoded SVG data URI for the given model's icon, or nil if unknown."
  [model]
  (when-let [path-d (smart-link-icon-paths model)]
    (let [svg (str "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\">"
                   "<path d=\"" path-d "\" fill=\"#4C90F0\"/></svg>")
          b64 (.encodeToString (java.util.Base64/getEncoder) (.getBytes ^String svg "UTF-8"))]
      (str "data:image/svg+xml;base64," b64))))

(defn- resolve-smart-link-label
  "Look up the entity name from the DB when label is nil."
  [model entity-id]
  (when-let [toucan-model (smart-link-model->toucan-model model)]
    (let [entity (t2/select-one toucan-model :id entity-id)]
      (or (:display_name entity) (:name entity)))))

(defn- smart-link-url
  "Build a URL for a smart link entity."
  [model entity-id]
  (case model
    "card"       (urls/card-url entity-id)
    "dataset"    (urls/card-url entity-id)
    "metric"     (urls/card-url entity-id)
    "dashboard"  (urls/dashboard-url entity-id)
    "collection" (urls/collection-url entity-id)
    "database"   (urls/database-url entity-id)
    "table"      (when-let [table (t2/select-one :model/Table :id entity-id)]
                   (urls/table-url (:db_id table) entity-id))
    "document"   (str (urls/site-url) "/document/" entity-id)
    nil))

(defmethod ast-node->hiccup "smartLink"
  [node _card-images]
  (let [entity-id (get-in node [:attrs :entityId])
        model     (get-in node [:attrs :model])
        label     (get-in node [:attrs :label])
        name      (or (when (not (str/blank? label)) label)
                      (resolve-smart-link-label model entity-id)
                      "")
        href      (smart-link-url model entity-id)
        icon-uri  (smart-link-icon-data-uri model)
        icon      (when icon-uri
                    [:img {:src   icon-uri
                           :style "width:14px; height:14px; vertical-align:-2px; margin-right:4px"}])
        tag       (if href :a :span)
        attrs     (cond-> {:class "smart-link"}
                    href (assoc :href href))]
    (if icon
      [tag attrs icon name]
      [tag attrs name])))

(defmethod ast-node->hiccup "image"
  [node _card-images]
  (let [src (get-in node [:attrs :src])
        alt (or (get-in node [:attrs :alt]) "")]
    [:img {:src src :alt alt :class "inline-image"}]))

;;; ---------------------------------------- Hiccup → XHTML serializer ------------------------------------------------

(def ^:private void-elements
  #{:br :hr :img :meta :link :input :col :area :base :embed :param :source :track :wbr})

(defn- xml-escape
  [^String s]
  (-> s
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")
      (str/replace "\"" "&quot;")))

(declare hiccup->xhtml-str)

(defn- render-attrs [attrs]
  (let [sb (StringBuilder.)]
    (doseq [[k v] attrs
            :when (some? v)]
      (.append sb " ")
      (.append sb (name k))
      (.append sb "=\"")
      (.append sb (xml-escape (str v)))
      (.append sb "\""))
    (.toString sb)))

(defn- render-child-nodes [children]
  (let [sb (StringBuilder.)]
    (doseq [child children]
      (.append sb ^String (hiccup->xhtml-str child)))
    (.toString sb)))

(defn- hiccup->xhtml-str
  ^String [form]
  (cond
    (nil? form)
    ""

    (instance? RawContent form)
    (:content form)

    (string? form)
    (xml-escape form)

    (number? form)
    (str form)

    (vector? form)
    (let [tag (first form)]
      (if (= :<> tag)
        (render-child-nodes (rest form))
        (let [has-attrs? (map? (second form))
              attrs      (when has-attrs? (second form))
              children   (if has-attrs? (drop 2 form) (rest form))
              tag-name   (name tag)
              attr-str   (if attrs (render-attrs attrs) "")]
          (if (and (contains? void-elements tag) (empty? children))
            (str "<" tag-name attr-str " />")
            (str "<" tag-name attr-str ">" (render-child-nodes children) "</" tag-name ">")))))

    (sequential? form)
    (render-child-nodes form)

    :else
    (xml-escape (str form))))

;;; ------------------------------------------- XHTML document wrapper ------------------------------------------------

(def ^:private css-stylesheet
  "Matches frontend document editor styles from Editor.module.css and theme variables.
  Colors: text-primary = #2B3238, text-secondary = #63686C,
  border = #DBDDDE, bg-secondary = #F1F1F2, brand = #4C90F0.
  Note: OpenHTMLtoPDF does not support rgba() — all colors must be hex."
  "body {
  font-family: Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: #2B3238;
  margin: 0;
  padding: 0;
}

@page {
  size: A4;
  margin: 2cm 1.5cm;
}

h1, h2, h3 {
  color: #2B3238;
  font-weight: 700;
}

h1 {
  font-size: 28px;
  line-height: 1.3;
  margin: 24px 0 16px 0;
}

h2 {
  font-size: 22px;
  line-height: 1.3;
  margin: 20px 0 12px 0;
}

h3 {
  font-size: 18px;
  line-height: 1.4;
  margin: 16px 0 8px 0;
}

h4 { font-size: 17px; line-height: 1.2; margin: 16px 0 8px 0; font-weight: 700; }
h5, h6 { font-size: 14px; line-height: 1.15; margin: 16px 0 8px 0; font-weight: 700; }

p {
  margin: 0 0 16px 0;
}

blockquote {
  border-left: 3px solid #DBDDDE;
  background: #F1F1F2;
  padding: 16px;
  padding-left: 20px;
  margin: 0 0 16px 0;
  font-style: italic;
  color: #63686C;
  border-radius: 4px;
}

blockquote p {
  margin: 0;
}

pre {
  background: #F1F1F2;
  border: 1px solid #DBDDDE;
  border-radius: 6px;
  padding: 16px;
  font-family: Monaco, monospace;
  font-size: 14px;
  overflow: hidden;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0 0 16px 0;
}

code {
  background: #F1F1F2;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #DBDDDE;
  font-family: Monaco, monospace;
  font-size: 14px;
}

pre code {
  background: none;
  padding: 0;
  border: none;
  border-radius: 0;
}

hr {
  border: none;
  border-top: 1px solid #DBDDDE;
  margin: 24px 0;
}

.card-embed {
  border: 1px solid #DBDDDE;
  border-radius: 8px;
  margin: 16px 0;
  overflow: hidden;
  page-break-inside: avoid;
}

.card-title {
  font-size: 1rem;
  line-height: 1.55;
  font-weight: 700;
  color: #2B3238;
  padding: 0.5rem 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-image {
  max-width: 100%;
  height: auto;
}

.card-content {
  padding: 8px 16px 16px;
}

.card-content svg {
  width: 100%;
  height: auto;
  display: block;
}

.card-error {
  background: #F1F1F2;
  padding: 16px;
}

.error-message {
  color: #63686C;
  font-style: italic;
}

.flex-container {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin: 16px 0;
}

.flex-container td {
  padding: 0 8px;
  vertical-align: top;
}

.flex-container td:first-child {
  padding-left: 0;
}

.flex-container td:last-child {
  padding-right: 0;
}

.supporting-text {
  background: #F1F1F2;
  border-radius: 8px;
  padding: 24px 16px;
}

.supporting-text p:last-child {
  margin-bottom: 0;
}

.smart-link {
  color: #4C90F0;
  font-weight: 700;
  padding: 0.125em;
  border-bottom: 1px solid #4C90F0;
  text-decoration: none;
}

.inline-image {
  max-width: 80%;
  height: auto;
  display: block;
  margin: 16px auto;
}

.document-title {
  font-size: 28px;
  font-weight: 700;
  color: #2B3238;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #DBDDDE;
}

ul, ol {
  margin: 0 0 16px 0;
  padding-left: 24px;
}

ul { list-style-type: disc; }
ol { list-style-type: decimal; }

li {
  margin: 0 0 4px 0;
  line-height: 1.5;
}

li p {
  margin-bottom: 4px;
}

a {
  color: #4C90F0;
  text-decoration: none;
}")

(defn- wrap-xhtml
  "Wrap Hiccup content in a full XHTML document suitable for OpenHTMLtoPDF."
  [title body-hiccup]
  (str
   "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
   "<html xmlns=\"http://www.w3.org/1999/xhtml\">\n"
   "<head>\n"
   "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" />\n"
   "<style type=\"text/css\">\n/*<![CDATA[*/\n" css-stylesheet "\n/*]]>*/\n</style>\n"
   "</head>\n"
   "<body>\n"
   (hiccup->xhtml-str [:div {:class "document-title"} title]) "\n"
   (hiccup->xhtml-str body-hiccup) "\n"
   "</body>\n"
   "</html>"))

;;; ------------------------------- Card dimension extraction from AST --------------------------------------------------

(def ^:private default-doc-chart-width
  "Default chart width for full-width document cards (matches frontend document content max-width: 900px)."
  900)

(def ^:private default-doc-chart-height
  "Default chart height for document cards (matches frontend RESIZE_NODE_DEFAULT_HEIGHT = 442)."
  442)

(defn- collect-card-dimensions
  "Walk the ProseMirror AST collecting {card-id {:width w :height h}} based on container context.
  resizeNode provides height, flexContainer provides proportional width via columnWidths.
  Cards without explicit overrides get the document defaults."
  ([node] (collect-card-dimensions node default-doc-chart-width default-doc-chart-height))
  ([node ctx-width ctx-height]
   (case (:type node)
     "cardEmbed"
     (let [card-id (get-in node [:attrs :id])]
       (if (and card-id (pos-int? card-id))
         {card-id {:width ctx-width :height ctx-height}}
         {}))

     "resizeNode"
     (let [h (get-in node [:attrs :height])]
       (reduce into {} (map #(collect-card-dimensions % ctx-width (or h ctx-height))
                            (:content node))))

     "flexContainer"
     (let [children    (:content node)
           col-widths  (get-in node [:attrs :columnWidths])
           n           (count children)
           widths      (if (and col-widths (= (count col-widths) n))
                         col-widths
                         (repeat n (/ 100.0 n)))]
       (reduce into {}
               (map-indexed (fn [i child]
                              (let [pct (nth widths i)
                                    w   (long (Math/round (* (double default-doc-chart-width)
                                                             (/ (double pct) 100.0))))]
                                (collect-card-dimensions child w ctx-height)))
                            children)))

     ;; default: recurse
     (reduce into {} (map #(collect-card-dimensions % ctx-width ctx-height)
                          (:content node []))))))

;;; -------------------------------------------- Public API -----------------------------------------------------------

(defn document->pdf-bytes
  "Convert a document to PDF bytes.
  Loads the document, renders embedded cards to PNGs, converts the ProseMirror AST
  to XHTML, and renders to PDF.
  Must be called within an authenticated API request context (card queries
  run under the current user's permissions)."
  [document-id]
  (let [document   (t2/select-one :model/Document :id document-id)
        _          (when-not document
                     (throw (ex-info "Document not found" {:document-id document-id :status-code 404})))
        ast        (:document document)
        card-ids   (prose-mirror/card-ids document)
        card-dims  (collect-card-dimensions ast)
        card-imgs  (card-render/render-all-cards card-ids card-dims)
        body       (ast-node->hiccup ast card-imgs)
        xhtml      (wrap-xhtml (:name document) body)]
    (log/debugf "Rendering PDF for document %d with %d cards" document-id (count card-ids))
    (pdf.render/xhtml->pdf-bytes xhtml)))
