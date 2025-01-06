(ns metabase.cmd.endpoint-dox.markdown.schema
  "Generate Hiccup HTML nodes based on Malli schemas.

  This is basically a stripped-down version of [[metabase.util.malli.doc]] that generates a single inline Hiccup
  node specifically for use in API documentation."
  (:require
   [clojure.string :as str]
   [hiccup.core :as hiccup]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmulti ^:private schema->hiccup-method
  {:arglists '([schema])}
  (fn [schema]
    {:pre [(instance? malli.core.Schema schema)]}
    (mc/-type (mc/-parent schema))))

(defn- explicit-dox [schema]
  {:pre [(instance? malli.core.Schema schema)]}
  ;; TODO -- parse `:error/message` for Markdown-ness.
  (or (when-let [description ((some-fn :description :error/message)
                              (mc/properties schema))]
        (str description))
      (when (symbol? (mc/form schema))
        (when-let [msg (me/error-message {:schema schema, :unknown false})]
          (when-not (= msg "unknown error")
            msg)))))

(def ^:private ^:dynamic *debug-schema-chain*
  "Used for debug purposes, the chain of schemas we're resolving."
  nil)

(defn- schema->hiccup
  [schema]
  (let [resolved       (if (instance? malli.core.Schema schema)
                         schema
                         (mc/schema schema))
        schema-for-dox (or (some-> (:doc/schema (mc/-properties resolved)) mc/schema)
                           resolved)]
    (or
     ;; explict `:description`
     (explicit-dox schema-for-dox)
     ;; generate dox based on schema
     (binding [*debug-schema-chain* (concat *debug-schema-chain* (distinct [schema resolved schema-for-dox]))]
       (schema->hiccup-method schema-for-dox)))))

(defmethod schema->hiccup-method :default
  [schema]
  (when-not (explicit-dox schema)
    (or (let [error-message (me/error-message {:schema schema, :unknown false})]
          (when-not (= error-message "unknown error")
            error-message))
        (log/warn
         (u/format-color :red "⚠⚠⚠ WARNING: SCHEMA USED IN API ENDPOINT IS MISSING DOCUMENTATION! ⚠⚠⚠\nPlease add a :description: %s\n%s"
                         (pr-str schema)
                         (str/join "\n >> " *debug-schema-chain*))))))

(defmethod schema->hiccup-method :ref
  [schema]
  (let [[child] (mc/children schema)]
    (schema->hiccup child)))

(defmethod schema->hiccup-method :schema
  [schema]
  (let [[child] (mc/children schema)]
    (schema->hiccup child)))

;;; keyword schema
(defmethod schema->hiccup-method :malli.core/schema
  [schema]
  (let [k (mc/-form schema)]
    (if (qualified-keyword? k)
      (schema->hiccup (mc/deref (mc/schema k)))
      ((get-method schema->hiccup-method :default) schema))))

(defmethod schema->hiccup-method :and
  [schema]
  [:div
   "Must satisfy all of these:"
   (into [:ul]
         (keep (fn [child]
                 (when-let [hiccup (schema->hiccup child)]
                   [:li hiccup])))
         (mc/children schema))])

(defmethod schema->hiccup-method :or
  [schema]
  [:div
   "Must be one of these:"
   (into [:ul]
         (keep (fn [child]
                 (when-let [hiccup (schema->hiccup child)]
                   [:li hiccup])))
         (mc/children schema))])

(defmethod schema->hiccup-method :enum
  [schema]
  [:div
   "Must be equal to one of these:"
   (into [:ul]
         (map (fn [child]
                [:li [:pre (pr-str child)]]))
         (mc/children schema))])

(defn- generate-table-rows-for-keyed-children [children]
  (mapv (fn [[k opts child]]
          [:tr
           [:td
            [:pre k]
            (when ((some-fn :optional :default) opts)
              [:i "Optional."])]
           [:td
            (when-let [description (:description opts)]
              [:div (str description)])
            [:div (schema->hiccup child)]
            (when-let [default (:default opts)]
              [:div
               [:i "Default:"]
               [:tt default]])]])
        children))

(def ^:private ^:dynamic *top-level-map?* true)

(defmethod schema->hiccup-method :map
  [schema]
  (if-let [children (not-empty (mc/children schema))]
    (let [rows (binding [*top-level-map?* false]
                 (into [:tbody] (generate-table-rows-for-keyed-children children)))
          table [:table
                 [:thead
                  [:tr [:th "Key"] [:th "Schema"]]]
                 rows]]
      (if *top-level-map?*
        table
        [:div
         "A map with the following keys:"
         table]))
    "A map"))

(defmethod schema->hiccup-method :merge
  [schema]
  (schema->hiccup (mc/deref schema)))

(defmethod schema->hiccup-method :maybe
  [schema]
  (let [[child] (mc/children schema)]
    [:div
     "Either " [:code "nil"] ", or "
     [:div (schema->hiccup child)]]))

(defmethod schema->hiccup-method :sequential
  [schema]
  (let [[child] (mc/children schema)]
    [:div
     [:div "A sequence of:"]
     [:div (schema->hiccup child)]]))

(defmethod schema->hiccup-method :map-of
  [schema]
  (let [[k-schema v-schema] (mc/children schema)
        k-dox               (schema->hiccup k-schema)
        v-dox               (schema->hiccup v-schema)]
    [:div
     "Must be a map:"
     [:ul
      [:li
       [:div
        "With keys satisfying:"
        [:div k-dox]]]
      [:li
       [:div
        "With values satisfying:"
        [:div v-dox]]]]]))

(defmethod schema->hiccup-method :keyword
  [_schema]
  "Must be a keyword.")

(defmethod schema->hiccup-method :catn
  [schema]
  (let [rows (generate-table-rows-for-keyed-children (mc/children schema))]
    [:div
     "A sequence with the shape"
     [:table
      (into [:tbody] rows)]]))

(defmethod schema->hiccup-method :cat
  [schema]
  (into [:ul]
        (map (fn [item]
               [:li (schema->hiccup item)]))
        (mc/children schema)))

(defmethod schema->hiccup-method :?
  [schema]
  (let [[child] (mc/children schema)]
    [:div
     "Zero or one instances of"
     [:div (schema->hiccup child)]]))

(defmethod schema->hiccup-method :*
  [schema]
  (let [[child] (mc/children schema)]
    [:div
     "Zero or more instances of"
     [:div (schema->hiccup child)]]))

(defmethod schema->hiccup-method :+
  [schema]
  (let [[child] (mc/children schema)]
    [:div
     "One or more instances of"
     [:div (schema->hiccup child)]]))

(defmethod schema->hiccup-method :=
  [schema]
  (let [[child] (mc/children schema)]
    [:div "Must equal " [:code (pr-str child)]]))

(defmethod schema->hiccup-method :any
  [_schema]
  "anything")

;;; we'll assume that all the possible dispatch values are possible, and treat this like an `:or`.
(defmethod schema->hiccup-method :multi
  [schema]
  (let [rows (generate-table-rows-for-keyed-children (mc/children schema))]
    [:div
     "One of the following types of expressions:"
     [:table
      [:thead
       [:tr [:th "Type"] [:th "Schema"]]]
      (into [:tbody] rows)]]))

(defmethod schema->hiccup-method :boolean
  [_schema]
  [:span "must be either " [:code "true"] " or " [:code "false"] "."])

(defn- pretty-html ^String [^String html]
  (.. (org.jsoup.Jsoup/parseBodyFragment html) body html))

(defn schema->html
  "Generate an HTML string for a Malli schema."
  [schema]
  (pretty-html (hiccup/html (schema->hiccup schema))))

;;;;
;;;; Example usages
;;;;

(comment
  ;; You can try this out with basically any schema.
  (schema->hiccup pos-int?)

  (schema->hiccup :metabase.analyze.fingerprint.schema/NumberFingerprint)

  #_{:clj-kondo/ignore [:unresolved-namespace]}
  (schema->hiccup metabase.util.malli.schema/TemporalString)

  #_{:clj-kondo/ignore [:unresolved-namespace]}
  (schema->hiccup [:fn #(boolean (metabase.util.date-2/parse %))])

  #_{:clj-kondo/ignore [:unresolved-namespace]}
  (schema->hiccup metabase.util.malli.schema/PositiveInt))

;;; PLEASE DON'T ADD ANY MORE CODE AFTER THE EXAMPLE USAGES ABOVE, GO ADD IT SOMEWHERE ELSE.
