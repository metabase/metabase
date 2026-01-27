(ns metabase.search.spec
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.search.config :as search.config]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]
   [toucan2.tools.transformed :as t2.transformed]))

(def search-models
  "Set of search model string names. Sorted by order to index based on importance and amount of time to index"
  (cond->  ["collection" "dashboard" "segment" "database" "action" "document"]
    config/ee-available? (conj "transform")
    ;; metric/card/dataset moved to the end because they take a long time due to computing has_temporal_dim etc.
    ;; table and indexed-entity moved to the end because there can be a large number of them
    true (conj "table" "indexed-entity" "metric" "card" "dataset")))

(def ^:private search-model->toucan-model
  (into {}
        (map (fn [search-model]
               [search-model (-> search-model search.config/model->db-model :db-model)]))
        search-models))

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

(def attr-types
  "The abstract types of each attribute."
  {:archived                :boolean
   :collection-id           :pk
   :created-at              :timestamp
   :creator-id              :pk
   :dashboard-id            :int
   :dashboardcard-count     :int
   :database-id             :pk
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
   :non-temporal-dim-ids    :text
   :has-temporal-dim        :boolean
   :display-type            :text
   :is-published            :boolean})

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
         :last-viewed-at
         :pinned
         :verified                                          ;;  in addition to being a filter, this is also a ranker
         :view-count
         :updated-at
         :non-temporal-dim-ids
         :has-temporal-dim
         :is-published])
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

(defn- find-fields-kw [kw]
  ;; Filter out SQL functions
  (when-not (or (str/starts-with? (name kw) "%")
                (#{:else :integer :float} kw))
    (let [table (get-table kw)]
      [[(or table :this) (remove-table table kw)]])))

(defn- find-fields-expr [expr]
  (cond
    (keyword? expr)
    (find-fields-kw expr)

    (and (vector? expr) (> (count expr) 1))
    (into [] (mapcat find-fields-expr) (subvec expr 1))

    (and (map? expr) (:fields expr))
    (into [] (mapcat find-fields-expr) (:fields expr))))

(defn- find-fields-attr [[k v]]
  (when v
    (if (true? v)
      [[:this (keyword (u/->snake_case_en (name k)))]]
      (find-fields-expr v))))

(defn- find-fields-search [item]
  (let [x (if (map-entry? item) (key item) item)]
    (cond
      (keyword? x)
      (find-fields-kw x)

      (vector? x)
      (find-fields-expr (first x)))))

(defn- find-fields
  "Search within a definition for all the fields referenced on the given table alias."
  [spec]
  (u/group-by #(nth % 0) #(nth % 1) conj #{}
              (-> []
                  ;; select fields that will influence content
                  (into (mapcat find-fields-attr (:attrs spec)))
                  (into (mapcat find-fields-search (:search-terms spec)))
                  (into (mapcat find-fields-attr (:render-terms spec)))
                  (into (find-fields-expr (:where spec))))))

(defn- replace-qualification [expr from to]
  (cond
    (and (keyword? expr) (has-table? from expr))
    (keyword (str/replace (name expr) (str (name from) ".") (str (name to) ".")))

    (sequential? expr)
    (into (empty expr) (map #(replace-qualification % from to) expr))

    :else
    expr))

(defn- insert-values [expr table m]
  (walk/postwalk
   (fn [x]
     (if (and (keyword? x) (has-table? table x))
       (get m (remove-table table x))
       x))
   expr))

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

(defmulti spec*
  "Impl for [[spec]]."
  {:arglists '([search-model])}
  identity)

(defn spec
  "Register a Metabase model as a search-model.
  Once we're trying up the fulltext search project, we can inline a detailed explanation.
  For now, see its schema, and the existing definitions that use it."
  ([search-model]
   ;; make sure the model namespace is loaded.
   (t2/resolve-model (search-model->toucan-model search-model))
   (spec* search-model)))

(defn specifications
  "A mapping from each search-model to its specification."
  []
  (into {}
        (map (fn [[search-model toucan-model]]
               ;; make sure the model namespace is loaded.
               (t2/resolve-model toucan-model)
               [search-model (spec search-model)]))
        search-model->toucan-model))

(defn validate-spec!
  "Check whether a given specification is valid"
  [spec]
  (when-let [info (mr/explain Specification spec)]
    (throw (ex-info (str "Invalid search specification for " (:name spec) ": " (me/humanize info)) info)))
  (doseq [table (keys (find-fields spec))
          :when (not= :this table)]
    (assert (contains? (:joins spec) table) (str "Reference to table without a join: " table))))

(defmacro define-spec
  "Define a search specification for indexing and searching a Metabase model.

   Spec keys:
   - `:model` - Toucan model keyword (required)
   - `:attrs` - Map of search index attributes (required)
   - `:search-terms` - Vector of searchable text fields (required)
   - `:render-terms` - Additional attributes needed for display (required)
   - `:visibility` - `:all` (default) or `:app-user` (non-sandboxed, non-impersonated users only)
   - `:where` - HoneySQL where clause to filter indexed records
   - `:bookmark` - HoneySQL join expression to detect if entity is bookmarked by current user
   - `:joins` - Map of join aliases to [model join-condition] tuples

   Attribute value formats:
   - `true` - Use column with same name (snake_case)
   - `:column_name` - Use specified database column
   - `{:fn function :fields [:field1 :field2]}` - Execute a clojure function at index time with the given fields"
  [search-model spec]
  `(let [spec# (-> ~spec
                   (assoc :name ~search-model)
                   (update :visibility #(or % :all))
                   (update :attrs #(merge ~default-attrs %)))]
     (validate-spec! spec#)
     (derive (:model spec#) :hook/search-index)
     (defmethod spec* ~search-model [~'_] spec#)))

;; TODO we should memoize this for production (based on spec values)
(defn model-hooks
  "Return an inverted map of data dependencies to search models, used for updating them based on underlying models."
  []
  (->> (specifications)
       vals
       (map search-model-hooks)
       merge-hooks))

(defn- instance->db-values
  "Given a transformed toucan map, get back a mapping to the raw db values that we can use in a query."
  [instance]
  (let [xforms (try
                 (#'t2.transformed/in-transforms (t2/model instance))
                 (catch Exception _     ; this happens for :model/ModelIndexValue, which has no transforms
                   nil))]
    (reduce-kv
     (fn [m k v]
       (assoc m k (if-let [f (get xforms k)] (f v) v)))
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
  (doseq [d (descendants :hook/search-index)]
    (underive d :hook/search-index))
  (doseq [d (keys (model-hooks))]
    (derive d :hook/search-index))

  (search-models-to-update (t2/select-one :model/Card))
  (methods spec)
  (model-hooks)

  (let [where (-> (:model/ModelIndexValue (model-hooks)) first :where)]
    (insert-values where :updated {:model_index_id 1 :model_pk 5})))

;;;; indexing helpers

(defn explode-camel-case
  "Transform CamelCase into 'CamelCase Camel Case' so that every word can be searchable"
  [s]
  (str s " " (str/replace s #"([a-z])([A-Z])" "$1 $2")))
