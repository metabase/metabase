(ns metabase.documents.collab.prose-mirror
  "Schema-free conversion between a Y-CRDT YDoc (the XML fragment named
   `\"default\"` that TipTap's collaboration extension uses) and ProseMirror
   JSON (`{:type \"doc\" :content [...]}`).

   We don't use yprosemirror's `YCrdtConverter` because it requires a
   `com.atlassian.prosemirror.model.Schema` matching the Metabase-frontend
   TipTap config (CardEmbed, SmartLink, MentionExtension, MetabotEmbed, …).
   A schema-free walker preserves unknown node types by name rather than
   silently dropping them, and avoids coupling the server to the frontend
   extension set.

   Mark encoding follows the convention established by yprosemirror
   (`ProseMirrorConverter.marksToAttributes`): boolean marks become
   `{markType: true}` YXmlText attributes; marks with attrs become
   `{markType + \"_\" + attr: value}`. Decoding splits on the first
   underscore, so mark types containing underscores are not supported —
   same limitation as the upstream library."
  (:require
   [metabase.util.json :as json])
  (:import
   (java.util HashMap)
   (net.carcdr.ycrdt FormattingChunk YBinding YBindingFactory YDoc
                     YXmlElement YXmlFragment YXmlText)))

(set! *warn-on-reflection* true)

(def ^:private fragment-name "default")

(def ^:private empty-doc
  {:type "doc" :content []})

;;;; ------------------------------------ YDoc -> PM JSON ------------------------------------

(declare yxml-child->pm-nodes)

(defn- yxml-elem->attrs [^YXmlElement el]
  (let [names (.getAttributeNames el)]
    (when (seq names)
      (persistent!
       (reduce (fn [acc ^String name]
                 (if-let [v (.getAttribute el name)]
                   (assoc! acc (keyword name) v)
                   acc))
               (transient {})
               names)))))

(defn- yxml-elem->pm-node [^YXmlElement el]
  (let [tag      (.getTag el)
        attrs    (yxml-elem->attrs el)
        n        (.childCount el)
        content  (loop [i 0, acc (transient [])]
                   (if (< i n)
                     (let [child (.getChild el i)]
                       (recur (inc i) (reduce conj! acc (yxml-child->pm-nodes child))))
                     (persistent! acc)))]
    (cond-> {:type tag}
      attrs          (assoc :attrs attrs)
      (seq content)  (assoc :content content))))

(defn- attrs->marks
  "Decode a YXmlText attributes map into a PM `:marks` vector. Keys with no
   `_` are boolean marks (`{:type key}`); keys `<markType>_<attr>` are
   grouped into a single mark with merged `:attrs`."
  [attrs]
  (when (seq attrs)
    (->> attrs
         (reduce (fn [acc [^String k v]]
                   (let [idx (.indexOf k (int \_))]
                     (if (neg? idx)
                       (assoc-in acc [k :type] k)
                       (let [mark-type (.substring k 0 idx)
                             attr-name (.substring k (inc idx))]
                         (-> acc
                             (assoc-in [mark-type :type]                  mark-type)
                             (assoc-in [mark-type :attrs (keyword attr-name)] v))))))
                 {})
         vals
         (into []))))

(defn- chunk->pm-text-nodes [^FormattingChunk chunk]
  (let [text (.getText chunk)]
    (when (and text (pos? (count text)))
      (let [marks (attrs->marks (.getAttributes chunk))]
        [(cond-> {:type "text" :text text}
           (seq marks) (assoc :marks marks))]))))

(defn- yxml-text->pm-nodes [^YXmlText t]
  (mapcat chunk->pm-text-nodes (.getFormattingChunks t)))

(defn- yxml-child->pm-nodes
  "Returns a (possibly empty) seq of PM nodes for a Y-CRDT XML child."
  [child]
  (cond
    (instance? YXmlElement child) [(yxml-elem->pm-node child)]
    (instance? YXmlText child)    (yxml-text->pm-nodes child)
    :else                         nil))

(defn- yxml-fragment->pm-doc [^YXmlFragment frag]
  (let [n (.length frag)]
    {:type    "doc"
     :content (loop [i 0, acc (transient [])]
                (if (< i n)
                  (let [child (.getChild frag i)]
                    (recur (inc i) (reduce conj! acc (yxml-child->pm-nodes child))))
                  (persistent! acc)))}))

(defn ydoc-bytes->pm-json
  "Deserialize Y-CRDT `state-bytes`, open the `\"default\"` fragment, and walk
   the tree into ProseMirror JSON. `nil` or empty input returns an empty doc."
  [^bytes state-bytes]
  (if (or (nil? state-bytes) (zero? (alength state-bytes)))
    empty-doc
    (let [^YBinding binding (YBindingFactory/auto)
          ^YDoc doc         (.createDoc binding)]
      (try
        (.applyUpdate doc state-bytes)
        (let [frag (.getXmlFragment doc fragment-name)]
          (try
            (yxml-fragment->pm-doc frag)
            (finally (.close frag))))
        (finally (.close doc))))))

;;;; ------------------------------------ PM JSON -> YDoc ------------------------------------

(defn- attrs->hashmap ^HashMap [attrs]
  (when (seq attrs)
    (let [m (HashMap.)]
      (doseq [[k v] attrs]
        (.put m (name k) (when v (str v))))
      m)))

(defn- marks->text-attrs ^HashMap [marks]
  (when (seq marks)
    (let [m (HashMap.)]
      (doseq [{:keys [type attrs]} marks]
        (if (seq attrs)
          (doseq [[k v] attrs]
            (.put m (str type "_" (name k)) v))
          (.put m type true)))
      m)))

(declare pm-node->yxml)

(defn- pm-text->yxml [^YXmlElement parent index {:keys [text marks]}]
  (let [^YXmlText t (.insertText parent index)]
    (.push t text)
    (when-let [formatting (marks->text-attrs marks)]
      (.format t 0 (count text) formatting))))

(defn- pm-node->yxml-into-fragment [^YXmlFragment frag index {:keys [type attrs content text marks]}]
  (if (= "text" type)
    (do
      (.insertText frag index text)
      (when-let [formatting (marks->text-attrs marks)]
        (let [child (.getChild frag index)]
          (when (instance? YXmlText child)
            (.format ^YXmlText child 0 (count text) formatting)))))
    (do
      (.insertElement frag index type)
      (let [child (.getChild frag index)]
        (when (instance? YXmlElement child)
          (let [el ^YXmlElement child]
            (doseq [[k v] attrs]
              (when v
                (.setAttribute el (name k) (str v))))
            (doseq [[i child-node] (map-indexed vector content)]
              (pm-node->yxml el i child-node))))))))

(defn- pm-node->yxml [^YXmlElement parent index {:keys [type attrs content text marks]}]
  (if (= "text" type)
    (pm-text->yxml parent index {:text text :marks marks})
    (let [el (.insertElement parent index type)]
      (doseq [[k v] attrs]
        (when v
          (.setAttribute el (name k) (str v))))
      (doseq [[i child-node] (map-indexed vector content)]
        (pm-node->yxml el i child-node)))))

(defn pm-json->ydoc-bytes
  "Build a YDoc from a ProseMirror JSON document (Clojure map or JSON string)
   and return its serialized state bytes. `nil` or an empty `:content` yields
   a fresh (empty) YDoc's state."
  ^bytes [pm-json]
  (let [pm-doc (cond
                 (nil? pm-json)    empty-doc
                 (string? pm-json) (json/decode+kw pm-json)
                 :else              pm-json)
        ^YBinding binding (YBindingFactory/auto)
        ^YDoc doc         (.createDoc binding)]
    (try
      (let [frag (.getXmlFragment doc fragment-name)]
        (try
          (doseq [[i node] (map-indexed vector (:content pm-doc))]
            (pm-node->yxml-into-fragment frag i node))
          (finally (.close frag))))
      (.encodeStateAsUpdate doc)
      (finally (.close doc)))))
