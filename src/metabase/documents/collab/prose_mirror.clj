(ns metabase.documents.collab.prose-mirror
  "Typed conversion between a Y-CRDT YDoc (the XML fragment named `\"default\"`
   that TipTap's collaboration extension uses) and ProseMirror JSON.

   Goes through `yprosemirror`'s `YCrdtConverter` / `ProseMirrorConverter`
   against Metabase's TipTap `Schema` (see
   `metabase.documents.collab.prose-mirror-schema`). Node / mark / attr
   types round-trip correctly (e.g. `heading.level: 1` stays integer), and
   unknown node types fail loudly at conversion time rather than silently
   dropping data."
  (:require
   [metabase.documents.collab.prose-mirror-schema :as schema]
   [metabase.util.json :as json])
  (:import
   (com.atlassian.prosemirror.model Node)
   (kotlinx.serialization.json Json JsonObject)
   (net.carcdr.ycrdt YBinding YBindingFactory YDoc YXmlFragment)
   (net.carcdr.yprosemirror ProseMirrorConverter YCrdtConverter)))

(set! *warn-on-reflection* true)

(def ^:private fragment-name "default")
(def ^:private empty-doc     {:type "doc" :content []})

(defn- clojure->json-object ^JsonObject [m]
  ;; Round-trip through a JSON string so we don't need to build kotlinx JsonElement nodes by hand.
  (let [element (.parseToJsonElement Json/Default (json/encode m))]
    (if (instance? JsonObject element)
      element
      (throw (ex-info "expected JSON object at the top level"
                      {:value m})))))

(defn- json-object->clojure [^JsonObject jo]
  (json/decode+kw (.toString jo)))

(defn ydoc-bytes->pm-json
  "Deserialize Y-CRDT `state-bytes`, open the `\"default\"` fragment, and
   convert into a ProseMirror JSON Clojure map. `nil` / empty input → empty
   doc. An empty XML fragment (no block children) is mapped to an empty doc
   too — the TipTap schema's `doc` requires `block+`, so the converter would
   otherwise reject it."
  [^bytes state-bytes]
  (if (or (nil? state-bytes) (zero? (alength state-bytes)))
    empty-doc
    (let [^YBinding binding (YBindingFactory/auto)
          ^YDoc doc         (.createDoc binding)]
      (try
        (.applyUpdate doc state-bytes)
        (let [^YXmlFragment frag (.getXmlFragment doc fragment-name)
              empty?             (try
                                   (zero? (.length frag))
                                   (finally (.close frag)))]
          (if empty?
            empty-doc
            (-> (YCrdtConverter/yDocToProsemirror doc fragment-name @schema/tiptap-schema)
                ^Node identity
                .toJSON
                json-object->clojure)))
        (finally (.close doc))))))

(defn- empty-pm-doc? [pm]
  (and (= "doc" (:type pm)) (empty? (:content pm))))

(defn pm-json->ydoc-bytes
  "Build a YDoc from ProseMirror JSON (Clojure map or JSON string) and return
   its serialized state bytes. Throws if the JSON contains node or mark types
   not defined in the TipTap schema. An empty doc (no content) is short-
   circuited — it can't be constructed via the strict schema but we produce
   a valid empty-YDoc state for it."
  ^bytes [pm-json]
  (let [pm-doc (cond
                 (nil? pm-json)    empty-doc
                 (string? pm-json) (json/decode+kw pm-json)
                 :else             pm-json)
        ^YBinding binding (YBindingFactory/auto)
        ^YDoc doc         (.createDoc binding)]
    (try
      (when-not (empty-pm-doc? pm-doc)
        (let [^JsonObject pm-jo (clojure->json-object pm-doc)
              ^Node pm-node     (.fromJSON (Node/Companion) @schema/tiptap-schema pm-jo false false)
              ^YXmlFragment frag (.getXmlFragment doc fragment-name)]
          (try
            (ProseMirrorConverter/nodeToYXml pm-node frag @schema/tiptap-schema)
            (finally (.close frag)))))
      (.encodeStateAsUpdate doc)
      (finally (.close doc)))))
