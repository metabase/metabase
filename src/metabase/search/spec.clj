(ns metabase.search.spec
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.models.resolution :as models.resolution]
   [metabase.search.config :as search.config]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]
   [toucan2.core :as t2]
   [toucan2.tools.transformed :as t2.transformed]))

(set! *warn-on-reflection* true)

(def search-models
  "Search model string names, ordered by indexing priority.
   Important / cheaper models come first so partial index is usable as soon as possible during a full index."
  (-> ["collection"
       "dashboard"
       "segment"
       "measure"
       "database"
       "action"
       "document"
       "exploration"
       "transform"]
      ;; An OSS build has no model namespace to resolve data apps from.
      (cond-> config/ee-available? (conj "data-app"))
      (into [;; The following come last as they can be slow to index due to:
             ;; - cardinality (table, indexed-entity),
             ;; - cost (e.g. large text payloads and native-query parsing for cards)
             "table"
             "metric"
             "card"
             "dataset"
             ;; These can easily dwarf the cardinality of other entities, hence being dead last.
             "indexed-entity"])))

(def ^:private SearchModel
  (into [:enum] search-models))

(def ^:private AttrValue
  "Key must be present, to show it's been explicitly considered.

  - false: not present [note: consider making the nil instead, since it implies writing NULL to the column]
  - true: given by a column with the same name (snake case) [note: consider removing this sugar, just repeat the column]
  - keyword: given by the corresponding column
  - vector: calculated by the given expression
  - map: a sub-select"
  [:union :boolean :keyword vector? :map
   [:map
    [:fn fn?]
    [:fields {:optional true} [:vector :keyword]]]])

(defn function-attr?
  "Attributes populate by clojure functions"
  [attr-def]
  (and (map? attr-def) (:fn attr-def)))

(defn collect-fn-attr-req-fields
  "Return set of required appdb fields declared in a spec's function attrs"
  [spec]
  (->> (:attrs spec)
       vals
       (filter function-attr?)
       (mapcat :fields)
       distinct))

(def legacy-input-excluded-keys
  "Keys present on the ingestion document `m` that must NOT be encoded into `legacy_input`. These are
   internal signals (ranking, filtering, ingestion bookkeeping) that the search API response should not
   surface to clients. Consumers: `metabase.search.ingestion/->document`."
  ;; `:collection_type` and `:collection_location` deliberately stay IN `legacy_input`:
  ;; - `metabase.search.impl/serialize` reads `:collection_type` to build the response's `:collection.type`
  ;; - `metabase.search.impl/add-dataset-collection-hierarchy` reads `:collection_location` to hydrate
  ;;   `:collection_effective_ancestors`, and the collection-result hydration path reads `:location` from
  ;;   the toucan instance (which the render-term keeps populated).
  ;; `:document` is the document model's prose-mirror body: it's indexed as searchable text (via
  ;; ast->text) but the raw JSON should never be echoed back in the search response or bloat the index row.
  ;; `:data_layer` also stays IN: Metabot surfaces it on table results so the LLM sees a table's data layer.
  ;; The `:table_collection_*` and `:table_is_published` render terms only feed the measure and segment specs'
  ;; `:root-collection-type` function and their reindex hooks, so they stay out of the response.
  #{:dataset_query
    :document
    :exploration_id
    :last_viewed_at
    :native_query
    :pinned
    :table_collection_id
    :table_collection_location
    :table_collection_type
    :table_is_published
    :view_count})

(def attr-types
  "The abstract types of each attribute."
  {:archived                :boolean
   :collection-id           :pk
   :created-at              :timestamp
   :creator-id              :pk
   :dashboard-id            :int
   :dashboardcard-count     :int
   :database-id             :pk
   :exploration-id          :int
   :id                      :text
   :last-edited-at          :timestamp
   :last-editor-id          :pk
   :last-viewed-at          :timestamp
   :name                    :text
   :native-query            nil
   :official-collection     :boolean
   :pinned                  :boolean
   :updated-at              :timestamp
   :verified                :boolean
   :view-count              :int
   :display-type            :text
   :is-published            :boolean
   :source-type             :text
   :collection-type         :text
   :collection-location     :text
   :root-collection-type    :text
   :data-layer              :text
   :data-authority          :text
   ;; Precomputed at ingestion (see metabase.search.ingestion) from the curation signals above, so the
   ;; "verified or curated content" filter is a single indexed boolean rather than a composite OR.
   :curated                 :boolean})

(def ^:private explicit-attrs
  "These attributes must be explicitly defined, omitting them could be a source of bugs."
  [:archived
   :collection-id])

(def ^:private optional-attrs
  "These attributes may be omitted (for now) in the interest of brevity in the definitions."
  (->> (keys (apply dissoc search.config/filters explicit-attrs))
       ;; identifiers and rankers
       (into
        [:id                                                ;;  in addition to being a filter, this is a key property
         :name
         :official-collection
         :dashboard-id
         :dashboardcard-count
         :exploration-id
         :last-viewed-at
         :pinned
         :verified                                          ;;  in addition to being a filter, this is also a ranker
         :view-count
         :updated-at
         :is-published
         :source-type
         :collection-type                                   ;;  surfaced for downstream consumers (metabase.search.impl/serialize)
         :collection-location                               ;;  surfaced for downstream consumers (add-dataset-collection-hierarchy)
         :root-collection-type                              ;;  indexed for :library scorer — type of the top-level ancestor collection
         :data-layer                                        ;;  indexed for the :data-layer scorer (table.data_layer; per-tier weights under :data-layer/*)
         :data-authority])                                  ;;  input to the precomputed :curated flag (authoritative tables)
       distinct
       vec))

(def ^:private default-attrs
  {:id   true
   :name true})

(def ^:private attr-keys
  "Keys of a search-model that correspond to concrete columns in the index"
  (into explicit-attrs optional-attrs))

;; Make sure to keep attr-types up to date
(assert (= (set (keys attr-types)) (set attr-keys)))

(def attr-columns
  "Columns of an ingestion query that correspond to concrete columns in the index"
  (mapv (comp keyword u/->snake_case_en name) attr-keys))

(assert (not-any? (set explicit-attrs) optional-attrs) "Attribute must only be mentioned in one list")

(def ^:private Attrs
  (into [:map {:closed true}]
        (concat (for [k explicit-attrs] [k AttrValue])
                (for [k optional-attrs] [k {:optional true} AttrValue]))))

(def ^:private NonAttrKey
  ;; This is rather slow, not great for REPL development.
  (if config/is-dev?
    :keyword
    [:and :keyword [:not (into [:enum] attr-columns)]]))

(def ^:private JoinMap
  "We use our own schema instead of raw HoneySQL, so that we can invert it to calculate the update hooks."
  [:map-of :keyword [:tuple :keyword vector?]])

(def ^:private Specification
  [:map {:closed true}
   [:name SearchModel]
   [:visibility [:enum :all :app-user :superuser]]
   [:model :keyword]
   [:attrs Attrs]
   [:search-terms [:or
                   [:sequential {:min 1} :keyword]
                   [:map-of :keyword [:or fn? true?]]]]
   [:embedding-exclude {:optional true} [:set :keyword]]
   [:render-terms [:map-of NonAttrKey AttrValue]]
   [:where {:optional true} vector?]
   [:bookmark {:optional true} vector?]
   [:joins {:optional true} JoinMap]])

(defn- qualify-column* [table column]
  (if (str/includes? (name column) ".")
    column
    (keyword (str (name table) "." (name column)))))

(defn- qualify-column
  "Given a select-item, qualify the (potentially nested) column reference if it is naked."
  [table select-item]
  (cond
    (keyword? select-item)
    (let [qualified (qualify-column* table select-item)]
      (if (= select-item qualified)
        select-item
        [qualified select-item]))

    (and (vector? select-item) (keyword? (first select-item)))
    (assoc select-item 0 (qualify-column* table (first select-item)))

    :else
    select-item))

(defn- has-table? [table kw]
  (and (not (namespace kw))
       (if table
         (str/starts-with? (name kw) (str (name table) "."))
         (not (str/includes? (name kw) ".")))))

(defn- get-table [kw]
  (let [kws (name kw)
        dot (str/index-of kws ".")]
    (when (and dot (< dot (count kws)))
      (keyword (subs kws 0 dot)))))

(defn- remove-table [table kw]
  (if (and table (not (namespace kw)))
    (keyword (subs (name kw) (inc (count (name table)))))
    kw))

(defn- add-table [table kw]
  (if (and table (not (namespace kw)))
    (keyword (str (name table) "." (name kw)))
    kw))

(defn- find-fields-kw [acc kw]
  ;; Filter out SQL functions
  (if (or (str/starts-with? (name kw) "%")
          (#{:else :integer :float} kw))
    acc
    (conj! acc
           (if-let [table (get-table kw)]
             [table (remove-table table kw)]
             [:this kw]))))

(defn- find-fields-expr
  ([expr] (persistent! (find-fields-expr (transient []) expr)))
  ([acc expr]
   (cond
     (keyword? expr)
     (find-fields-kw acc expr)

     (and (vector? expr) (> (count expr) 1))
     (reduce find-fields-expr acc (subvec expr 1))

     (and (map? expr) (:fields expr))
     (reduce-kv #(find-fields-expr %1 %3) acc (:fields expr))

     :else acc)))

(defn- find-fields-attr [acc k v]
  (if v
    (if (true? v)
      (conj! acc [:this (keyword (u/->snake_case_en (name k)))])
      (find-fields-expr acc v))
    acc))

(defn- find-fields-search [acc item]
  (let [x (if (map-entry? item) (key item) item)]
    (cond
      (keyword? x)
      (find-fields-kw acc x)

      (vector? x)
      (find-fields-expr acc (first x))

      :else acc)))

(defn- find-fields
  "Search within a definition for all the fields referenced on the given table alias."
  [spec]
  (u/group-by #(nth % 0) #(nth % 1) conj #{}
              (as-> (transient []) acc
                ;; select fields that will influence content
                (reduce-kv find-fields-attr acc (:attrs spec))
                (reduce find-fields-search acc (:search-terms spec))
                (reduce-kv find-fields-attr acc (:render-terms spec))
                (find-fields-expr acc (:where spec))
                (persistent! acc))))

(defn- replace-qualification [expr from to]
  (cond
    (and (keyword? expr) (has-table? from expr))
    (keyword (str/replace (name expr) (str (name from) ".") (str (name to) ".")))

    (sequential? expr)
    (into (empty expr) (map #(replace-qualification % from to) expr))

    (map? expr)
    (update-vals expr #(replace-qualification % from to))

    :else
    expr))

(defn- insert-values [expr table m]
  (match/replace-all expr
    (kw :guard (and (keyword? kw) (has-table? table kw))) (get m (remove-table table kw))))

(defn- construct-source-where [id-fields]
  (cond
    (keyword? id-fields) [:= (add-table :updated id-fields) (add-table :this id-fields)]
    (boolean? id-fields) [:= :updated.id :this.id]
    ;; Vector is probably something like `[:concat :field1 "sep" :field2]`; maybe we should switch to more restrictive
    ;; notation in `:attrs`?
    (vector? id-fields)  (into [:and]
                               (for [field (next id-fields) ;; first one is going to be a function
                                     :when (keyword? field)]
                                 [:= (add-table :updated field) (add-table :this field)]))
    :else                (throw (ex-info "Unknown :id form" {:id id-fields}))))

(defn- search-model-hooks
  "Generate a map indicating which search-models to update based on which fields are modified for a given model."
  [spec]
  (let [s      (:name spec)
        fields (find-fields spec)]
    (reduce (fn [res [table-alias [model join-condition]]]
              (let [table-fields (fields table-alias)]
                (assoc res model #{{:search-model s
                                    :fields       table-fields
                                    :where        (replace-qualification join-condition table-alias :updated)}})))
            {(:model spec) #{{:search-model s
                              :fields       (:this (find-fields spec))
                              :where        (construct-source-where (-> spec :attrs :id))}}}
            (:joins spec))))

(defn- merge-hooks
  "Combine the search index hooks corresponding to different search models."
  [hooks]
  (reduce (partial merge-with set/union) {} hooks))

(defn qualify-columns
  "Given a list of select-item, qualify all naked column references to refer to the given table."
  [table select-item]
  (for [column select-item
        :when (and column (or (not (vector? column))
                              (some? (first column))))]
    (qualify-column table column)))

(defmulti spec
  "The search specifications of the Toucan `model`, as `{search-model spec}` where each `search-model` is a string of
  [[search-models]], such as `{\"card\" {...} \"dataset\" {...} \"metric\" {...}}` for `:model/Card`. A model implements
  this to be indexed for search, and the specification of each of its search models is read with [[search-model-spec]].

  Spec keys:
  - `:attrs` - Map of search index attributes (required)
  - `:search-terms` - Searchable text fields: a vector of column keywords, or a map of
    column keyword to either `true` (use the raw value) or a transform fn applied for
    full-text search (required)
  - `:embedding-exclude` - Set of `:search-terms` keys to omit from the semantic-search
    embedding text (they remain in full-text search). Use for fields whose raw value is
    not suitable for semantic search.
  - `:render-terms` - Additional attributes needed for display (required)
  - `:visibility` - `:all` (default) or `:app-user` (non-sandboxed, non-impersonated, non-routed users only) or `:superuser`
  - `:where` - HoneySQL where clause to filter indexed records
  - `:bookmark` - HoneySQL join expression to detect if entity is bookmarked by current user
  - `:joins` - Map of join aliases to [model join-condition] tuples

  Attribute value formats:
  - `true` - Use column with same name (snake_case)
  - `:column_name` - Use specified database column
  - `{:fn function :fields [:field1 :field2]}` - Execute a clojure function at index time; its scalar
    return value is written to the column named after the attr key (snake_case).

  A function in a specification must be a named `defn`, not an anonymous fn, since [[index-version-hash]] identifies it
  by name."
  {:arglists '([model])}
  identity)

(defn- complete-spec
  "The `spec` of `search-model` of `model` with its name, model, default visibility and default attrs."
  [model search-model spec]
  (-> spec
      (assoc :name search-model :model model)
      (update :visibility #(or % :all))
      (update :attrs #(merge default-attrs %))))

(defn validate-spec!
  "Check whether a given specification is valid"
  [spec]
  (when-let [info (mr/explain Specification spec)]
    (throw (ex-info (str "Invalid search specification for " (:name spec) ": " (me/humanize info)) info)))
  (doseq [table (keys (find-fields spec))
          :when (not= :this table)]
    (assert (contains? (:joins spec) table) (str "Reference to table without a join: " table))))

(defn- build-specifications
  "The validated, completed specification of every search model that a model defines, after loading every model
  namespace."
  []
  (into {}
        (map (fn [[search-model [model model-spec]]]
               [search-model (complete-spec model search-model model-spec)]))
        (models.resolution/spec-entries-by-name spec)))

(def ^:private specifications*
  ;; The key is only an invalidation token, as for `model-hooks*`: the value comes from the static search-models list,
  ;; so the first call builds a complete map even though resolving those models registers more methods while it runs.
  (memoize/fifo
   (fn [_spec-methods]
     (let [specs (build-specifications)]
       (doseq [search-model search-models]
         (when-not (contains? specs search-model)
           (throw (ex-info (str "No search specification for " search-model) {:search-model search-model}))))
       (run! validate-spec! (vals specs))
       specs))
   :fifo/threshold 1))

(defn specifications
  "A mapping from each search-model to its specification."
  []
  (specifications* (methods spec)))

(defn search-model-spec
  "The specification of `search-model`, a string of [[search-models]], with its `:name`, `:model`, `:visibility` and
  `:attrs` completed with the defaults."
  [search-model]
  (or (get (specifications) search-model)
      (throw (ex-info (str "No search specification for " (pr-str search-model)) {:search-model search-model}))))

(defn indexed-model?
  "Whether the Toucan `model`, or a model it derives from, has a search specification."
  [model]
  (some? (get-method spec model)))

(def ^:private model-hooks*
  ;; Specs are immutable in production, and keying on the methods map also does the useful thing after a
  ;; REPL/test reload.
  ;; The key is only an invalidation token: the value comes from the static search-models list, so the first
  ;; call builds a complete map even though resolving those models registers more methods while it runs.
  ;; Its key is stale by then, which costs one recompute and nothing else.
  (memoize/fifo
   (fn [_spec-methods]
     (->> (specifications)
          vals
          (map search-model-hooks)
          merge-hooks))
   :fifo/threshold 1))

(defn model-hooks
  "Return an inverted map of data dependencies to search models, used for updating them based on underlying models."
  []
  (model-hooks* (methods spec)))

(defn- instance->db-values
  "Given a transformed toucan map, get back a mapping to the raw db values that we can use in a query, leaving as it is
  a value that its write transform refuses, such as the `:unknown` an unrecognized stored value reads as, since only the
  columns the hooks read are looked up in the result."
  [instance]
  (let [xforms (try
                 (let [model (t2/model instance)]
                   ;; We know ModelIndexValue to have no transforms.
                   (when-not (and (keyword? model) (= (name model) "ModelIndexValue"))
                     (#'t2.transformed/in-transforms model)))
                 (catch Exception _     ; may happen for other models that have no transforms
                   nil))]
    (reduce-kv
     (fn [m k v]
       (assoc m k (if-let [f (get xforms k)]
                    (try
                      (f v)
                      (catch Exception _
                        v))
                    v)))
     {}
     instance)))

(defn search-models-to-update
  "Given an updated or created instance, return a description of which search-models to (re)index."
  [instance & [always?]]
  (let [raw-values (delay (instance->db-values instance))]
    (into #{}
          (keep
           (fn [{:keys [search-model fields where]}]
             (when (or always? (and fields (some fields (keys (or (t2/changes instance) instance)))))
               [search-model (insert-values where :updated @raw-values)])))
          (get (model-hooks) (t2/model instance)))))

(comment
  (methods spec)
  (model-hooks)

  (let [where (-> (:model/ModelIndexValue (model-hooks)) first :where)]
    (insert-values where :updated {:model_index_id 1 :model_pk 5})))

;;;; indexing helpers

(defn explode-camel-case
  "Transform CamelCase into 'CamelCase Camel Case' so that every word can be searchable"
  [s]
  (str s " " (str/replace s #"([a-z])([A-Z])" "$1 $2")))

;;;; index version hashing

(defn- fn-name
  "The qualified name of the function `f`, which must be a named `defn`."
  [f]
  (let [qualified (Compiler/demunge (.getName (class f)))]
    (when (re-find #"fn--\d+" qualified)
      (throw (ex-info "A search specification holds an anonymous function; name it with defn" {:fn qualified})))
    qualified))

(defn- canonicalize
  "Convert a form to a canonical, JSON-serializable representation.
   Symbols and keywords become strings, functions become their qualified names, maps are sorted, and sets become sorted
   vectors."
  [form]
  (cond
    (fn? form) (fn-name form)
    (symbol? form) (str form)
    (keyword? form) (str form)
    (map? form) (into (sorted-map)
                      (for [[k v] form]
                        [(canonicalize k) (canonicalize v)]))
    (set? form) (vec (sort-by pr-str (map canonicalize form)))
    (sequential? form) (mapv canonicalize form)
    :else form))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *testing-only-index-version-hash*
  "Override for tests that need a specific index version."
  nil)

(defn- compute-index-version-hash
  "The hash of the search `specs`, with the default attrs and the attr types."
  [specs]
  (-> {:specs        specs
       :default-attrs default-attrs
       :attr-types    attr-types}
      canonicalize
      json/encode
      buddy-hash/sha256
      codecs/bytes->hex))

(def ^{:arglists '([testing-only-index-version-hash]) :private true} index-version-hash*
  (memoize (fn [testing-only-index-version-hash]
             (or testing-only-index-version-hash
                 (compute-index-version-hash (specifications))))))

(defn index-version-hash
  "Compute a deterministic hash of all search specifications.
   Includes the specifications with their functions named, default-attrs, and attr-types."
  []
  (index-version-hash* *testing-only-index-version-hash*))
