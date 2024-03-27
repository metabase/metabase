(ns metabase.util.malli.doc
  (:require
   [clojure.java.io :as io]
   [hiccup.core :as hiccup]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.pulse.markdown :as markdown]
   [metabase.util.log :as log])
  (:import
   (org.apache.commons.io FileUtils)))

(set! *warn-on-reflection* true)

(defmulti ^:private generate-dox-method
  {:arglists '([schema cache])}
  (fn [schema _cache]
    {:pre [(instance? malli.core.Schema schema)]}
    (mc/-type (mc/-parent schema))))

(defn- maybe-parse-markdown [x]
  (cond-> x
    (string? x) (markdown/process-markdown :html)))

(defn- explicit-dox [schema]
  {:pre [(instance? malli.core.Schema schema)]}
  ;; TODO -- parse `:error/message` for Markdown-ness.
  (or (when-let [x ((some-fn :doc/message :error/message)
                    (mc/properties schema))]
        (maybe-parse-markdown x))
      (when (symbol? (mc/form schema))
        (when-let [msg (me/error-message {:schema schema, :unknown false})]
          (when-not (= msg "unknown error")
            msg)))))

(defn- generate-dox
  ([schema]
   (generate-dox schema {}))

  ([schema cache]
   (let [schema                          (if (instance? malli.core.Schema schema)
                                           schema
                                           (mc/schema schema))
         schema                          (or (some-> (:doc/schema (mc/-properties schema)) mc/schema)
                                             schema)
         explicit-dox                    (explicit-dox schema)
         {generated :this, cache :cache} (generate-dox-method schema cache)
         _                               (assert (some? generated))
         _                               (assert (map? cache))
         dox                             (if explicit-dox
                                           [:div
                                            [:div explicit-dox]
                                            [:div generated]]
                                           generated)]
     {:this dox, :cache cache})))

(defmethod generate-dox-method :default
  [schema cache]
  {:this (if (explicit-dox schema)
           [:div]
           (or
            (me/error-message {:schema schema, :unknown false})
            (do
              (log/warnf "WARNING: UNKNOWN SCHEMA: %s" (pr-str schema))
              [:div
               {:style "border: 2px solid red;"}
               [:div
                [:b "UNKNOWN SCHEMA: "]
                [:tt (mc/-type (mc/-parent schema))]]
               [:div [:pre (pr-str schema)]]
               [:div [:pre (mc/properties schema)]]])))
   :cache cache})

(defmethod generate-dox-method :ref
  [schema cache]
  (let [[child] (mc/children schema)]
    (generate-dox child cache)))

(defmethod generate-dox-method :schema
  [schema cache]
  (let [[child] (mc/children schema)]
    (generate-dox child cache)))

(defn- keyword-schema-relative-file-name [k]
  {:pre [(qualified-keyword? k)]}
  (format "%s__%s.html"
          (munge (namespace k))
          (munge (name k))))

(defn- schema-title [schema]
  (or (some-> (:doc/title (mc/properties schema)) maybe-parse-markdown)
      (when-not (instance? malli.core.Schema schema)
        (schema-title (mc/schema schema)))
      (when (mc/-ref-schema? schema)
        (schema-title (mc/deref schema)))
      (when (keyword? schema)
        [:pre (name schema)])))

(defn- ^:dynamic *keyword-schema-link* [k]
  [:a
   {:href (keyword-schema-relative-file-name k)}
   (schema-title k)])

;;; keyword schema
(defmethod generate-dox-method :malli.core/schema
  [schema cache]
  (let [k (mc/-form schema)]
    (assert (keyword? k))
    (cond
      ;; qualified keyword already in the cache
      (and (qualified-keyword? k)
           (contains? cache k))
      {:this  (*keyword-schema-link* k)
       :cache cache}

      ;; qualified keyword that is not yet in the cache
      (qualified-keyword? k)
      (let [cache                (assoc cache k nil) ; so we don't try to generate it recursively
            {:keys [this cache]} (generate-dox (mc/deref (mc/schema k)) cache)]
        {:this  (*keyword-schema-link* k)
         :cache (assoc cache k this)})

      :else
      ((get-method generate-dox-method :default) schema cache))))

(defn- generate-dox-for-schemas
  "For things that have n children, like `:and` or `:or."
  [schemas cache]
  (reduce
   (fn [{:keys [cache these]} schema]
     (let [{:keys [this cache]} (generate-dox schema cache)]
       {:cache  cache
        :these (conj these this)}))
   {:cache cache, :these []}
   schemas))

(defmethod generate-dox-method :and
  [schema cache]
  (let [{:keys [cache these]} (generate-dox-for-schemas (mc/children schema) cache)]
    {:this [:div
            "Must satisfy all of these:"
            (into [:ul]
                  (map (fn [child]
                         [:li child]))
                  these)]
     :cache cache}))

(defmethod generate-dox-method :or
  [schema cache]
  (let [{:keys [cache these]} (generate-dox-for-schemas (mc/children schema) cache)]
    {:this [:div
            "Must be one of these:"
            (into [:ul]
                  (map (fn [child]
                         [:li child]))
                  these)]
     :cache cache}))

(defmethod generate-dox-method :enum
  [schema cache]
  {:this [:div
          "Must be equal to one of these:"
          (into [:ul]
                (map (fn [child]
                       [:li [:pre (pr-str child)]]))
                (mc/children schema))]
   :cache cache})

(defn- generate-table-rows-for-keyed-children [children cache]
  (reduce
   (fn [{:keys [cache rows]} [k opts child]]
     (let [{:keys [cache this]} (generate-dox child cache)
           row                 [:tr
                                {:style "border: 1px solid black;"}
                                [:td
                                 {:style "border: 1px solid black; background: #cccccc;"}
                                 [:pre k]
                                 (when (:optional opts)
                                   [:i "Optional."])]
                                [:td
                                 {:style "border: 1px solid black;"}
                                 [:div (maybe-parse-markdown (:doc/message opts))]
                                 [:div this]]]]
       {:cache cache, :rows (conj rows row)}))
   {:cache cache, :rows []}
   children))

(defmethod generate-dox-method :map
  [schema cache]
  (if-let [children (not-empty (mc/children schema))]
    (let [{:keys [rows cache]} (generate-table-rows-for-keyed-children children cache)]
      {:this [:div
              "A map with the following keys:"
              [:table
               [:thead
                [:tr [:th "Key"] [:th "Schema"]]]
               (into [:tbody] rows)]]
       :cache cache})
    {:this "A map"
     :cache cache}))

(defmethod generate-dox-method :merge
  [schema cache]
  (generate-dox (mc/deref schema) cache))

(defmethod generate-dox-method :maybe
  [schema cache]
  (let [[child]             (mc/children schema)
        {:keys [this cache]} (generate-dox child cache)]
    {:this [:div
            "Either " [:code "nil"] ", or "
            [:div this]]
     :cache cache}))

(defmethod generate-dox-method :sequential
  [schema cache]
  (let [[child]             (mc/children schema)
        {:keys [this cache]} (generate-dox child cache)]
    {:this [:div
            [:div "A sequence of:"]
            [:div this]]
     :cache cache}))

(defmethod generate-dox-method :map-of
  [schema cache]
  (let [[k-schema v-schema]         (mc/children schema)
        {k-dox :this, :keys [cache]} (generate-dox k-schema cache)
        {v-dox :this, :keys [cache]} (generate-dox v-schema cache)]
    {:this [:div
            "Must be a map:"
            [:ul
             [:li
              [:div
               "With keys satisfying:"
               [:div k-dox]]]
             [:li
              [:div
               "With values satisfying:"
               [:div v-dox]]]]]
     :cache cache}))

(defmethod generate-dox-method :keyword
  [_schema cache]
  {:this "Must be a keyword."
   :cache cache})

(defmethod generate-dox-method :catn
  [schema cache]
  (let [{:keys [rows cache]} (generate-table-rows-for-keyed-children (mc/children schema) cache)]
    {:this [:div
            "A sequence with the shape"
            [:table
             (into [:tbody] rows)]]
     :cache cache}))

(defmethod generate-dox-method :cat
  [schema cache]
  (let [{:keys [these cache]} (generate-dox-for-schemas (mc/children schema) cache)]
    {:this  [:div
             "Sequence with the shape"
             (into [:ul]
                   (map (fn [item]
                          [:li item]))
                   these)]
     :cache cache}))

(defmethod generate-dox-method :?
  [schema cache]
  (let [[child]              (mc/children schema)
        {:keys [this cache]} (generate-dox child cache)]
    {:this  [:div
             "Zero or one instances of"
             [:div this]]
     :cache cache}))

(defmethod generate-dox-method :*
  [schema cache]
  (let [[child]              (mc/children schema)
        {:keys [this cache]} (generate-dox child cache)]
    {:this  [:div
             "Zero or more instances of"
             [:div this]]
     :cache cache}))

(defmethod generate-dox-method :+
  [schema cache]
  (let [[child]              (mc/children schema)
        {:keys [this cache]} (generate-dox child cache)]
    {:this  [:div
             "One or more instances of"
             [:div this]]
     :cache cache}))

(defmethod generate-dox-method :=
  [schema cache]
  (let [[child] (mc/children schema)]
    {:this [:div "Must equal " [:code (pr-str child)]]
     :cache cache}))

(defmethod generate-dox-method :any
  [_schema cache]
  {:this "anything"
   :cache cache})

;;; we'll assume that all the possible dispatch values are possible, and treat this like an `:or`.
(defmethod generate-dox-method :multi
  [schema cache]
  (let [{:keys [rows cache]} (generate-table-rows-for-keyed-children (mc/children schema) cache)]
    {:this  [:div
             "One of the following types of expressions:"
             [:table
              [:thead
               [:tr [:th "Type"] [:th "Schema"]]]
              (into [:tbody] rows)]]
     :cache cache}))

(defmethod generate-dox-method :boolean
  [_schema cache]
  {:this  [:span "must be either " [:code "true"] " or " [:code "false"] "."]
   :cache cache})

(defn- html [title content]
  (hiccup/html
   [:html
    [:head]
    [:body
     {:style "margin: 0;"}
     [:h1 title]
     content]]))

(defn- clean-target-dir! [target-dir]
  (log/infof "CLEAN %s" target-dir)
  (let [target-dir (io/file target-dir)]
    ;; delete target directory if it already exists
    (when (.exists target-dir)
      (assert (.isDirectory target-dir))
      (FileUtils/deleteDirectory target-dir))
    ;; create the target directory
    (.mkdirs target-dir)))

(defn- index-html-body [cache]
  [:div
   (into [:ul]
         (map (fn [keyword-schema]
                [:li [:div (*keyword-schema-link* keyword-schema)]]))
         (sort (keys cache)))])

(defn- write-index-html! [target-dir cache]
  (let [filename (str target-dir "/index.html")]
    (log/infof "WRITE %s" filename)
    (spit filename (html "Index" (index-html-body cache)))))

(defn- write-doc-pages! [target-dir cache]
  (doseq [[keyword-schema content] cache
          :let                     [filename (str target-dir "/" (keyword-schema-relative-file-name keyword-schema))]]
    (log/infof "WRITE %s" filename)
    (spit filename (html (schema-title keyword-schema) content))))

(defn- generate-documentation! [schema target-dir]
  (clean-target-dir! target-dir)
  (let [{:keys [cache]} (generate-dox schema)]
    (write-index-html! target-dir cache)
    (write-doc-pages! target-dir cache))
  (log/info "DONE."))

(defn generate-legacy-mbql-dox
  "e.g.

    clj -X metabase.util.malli.doc/generate-legacy-mbql-dox

    clj -X metabase.util.malli.doc/generate-legacy-mbql-dox :target-dir '\"target/docs/schemas/legacy-mbql\"'"
  [{:keys [target-dir]
                                 :or   {target-dir "docs/legacy-mbql"}}]
  (require 'metabase.legacy-mbql.schema)
  (generate-documentation! :metabase.legacy-mbql.schema/Query
                           target-dir))

(defn generate-pmbql-dox
  "e.g.

    clj -X metabase.util.malli.doc/generate-pmbql-dox

    clj -X metabase.util.malli.doc/generate-pmbql-dox :target-dir '\"target/docs/schemas/pmbql\"'"
  [{:keys [target-dir]
    :or   {target-dir "target/docs/schemas/pmbql"}}]
  (require 'metabase.lib.schema)
  (generate-documentation! :metabase.lib.schema/query
                           target-dir))
