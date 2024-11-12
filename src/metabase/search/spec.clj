(ns metabase.search.spec
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.config :as config]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private SearchModel
  [:enum "dashboard" "table" "dataset" "segment" "collection" "database" "action" "indexed-entity" "metric" "card"])

(def ^:private AttrValue
  "Key must be present, to show it's been explicitly considered.

  - false: not present [not: consider making the nil instead, since it implies writing NULL to the column]
  - true: given by a column with the same name (snake case) [note: consider removing this sugar, just repeat the column]
  - keyword: given by the corresponding column
  - vector: calculated by the given expression
  - map: a sub-select"
  [:union :boolean :keyword vector? :map])

(def ^:private explicit-attrs
  "These attributes must be explicitly defined, omitting them could be a source of bugs."
  [:archived
   :collection-id
   :database-id
   :table-id])

(def ^:private optional-attrs
  "These attributes may be omitted (for now) in the interest of brevity in the definitions."
  [:id
   :name
   :created-at
   :creator-id
   :native-query
   :dashboardcard-count
   :last-edited-at
   :last-editor-id
   :pinned
   :verified
   :view-count
   :updated-at])

(def ^:private default-attrs
  {:id   true
   :name true})

(def ^:private attr-keys
  "Keys of a search-model that correspond to concrete columns in the index"
  (into explicit-attrs optional-attrs))

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
   [:model :keyword]
   [:attrs Attrs]
   [:search-terms [:sequential {:min 1} :keyword]]
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
  (let [parts (str/split (name kw) #"\.")]
    (when (> (count parts) 1)
      (keyword (first parts)))))

(defn- remove-table [table kw]
  (if (and table (not (namespace kw)))
    (keyword (subs (name kw) (inc (count (name table)))))
    kw))

(defn- find-fields-kw [kw]
  ;; Filter out SQL functions
  (when-not (str/starts-with? (name kw) "%")
    (let [table (get-table kw)]
      (list [(or table :this) (remove-table table kw)]))))

(defn- find-fields-expr [expr]
  (cond
    (keyword? expr)
    (find-fields-kw expr)

    (vector? expr)
    (mapcat find-fields-expr (rest expr))))

(defn- find-fields-attr [[k v]]
  (when v
    (if (true? v)
      [[:this (keyword (u/->snake_case_en (name k)))]]
      (find-fields-expr v))))

(defn- find-fields-select-item [x]
  (cond
    (keyword? x)
    (find-fields-kw x)

    (vector? x)
    (find-fields-expr (first x))))

(defn- find-fields-top [x]
  (cond
    (map? x)
    (mapcat find-fields-attr x)

    (sequential? x)
    (mapcat find-fields-select-item x)

    :else
    (throw (ex-info "Unexpected format for fields" {:x x}))))

(defn- find-fields
  "Search within a definition for all the fields referenced on the given table alias."
  [spec]
  (u/group-by first second conj #{}
              (concat
               (mapcat
                find-fields-top
                ;; Remove the keys with special meanings (should probably switch this to an allowlist rather)
                (vals (dissoc spec :name :native-query :where :joins :bookmark :model)))
               (find-fields-expr (:where spec)))))

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

(defn- search-model-hooks
  "Generate a map indicating which search-models to update based on which fields are modified for a given model."
  [spec]
  (let [s      (:name spec)
        fields (find-fields spec)]
    (into {}
          (cons
           [(:model spec) #{{:search-model s
                             :fields       (:this (find-fields spec))
                             :where        [:= :updated.id :this.id]}}]
           (for [[table-alias [model join-condition]] (:joins spec)]
             (let [table-fields (fields table-alias)]
               [model #{{:search-model s
                         :fields       table-fields
                         :where        (replace-qualification join-condition table-alias :updated)}}]))))))

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
  "Register a metabase model as a search-model.
  Once we're trying up the fulltext search project, we can inline a detailed explanation.
  For now, see its schema, and the existing definitions that use it."
  (fn [search-model] search-model))

(defn specifications
  "A mapping from each search-model to its specification."
  []
  (into {} (for [[s spec-fn] (methods spec)] [s (spec-fn s)])))

(defn validate-spec!
  "Check whether a given specification is valid"
  [spec]
  (when-let [info (mc/explain Specification spec)]
    (throw (ex-info (str "Invalid search specification for " (:name spec) ": " (me/humanize info)) info)))
  (doseq [table (keys (find-fields spec))
          :when (not= :this table)]
    (assert (contains? (:joins spec) table) (str "Reference to table without a join: " table))))

(defmacro define-spec
  "Define a spec for a search model."
  [search-model spec]
  `(let [spec# (-> ~spec
                   (assoc :name ~search-model)
                   (update :attrs #(merge ~default-attrs %)))]
     (validate-spec! spec#)
     (defmethod spec ~search-model [~'_] spec#)))

;; TODO we should memoize this for production (based on spec values)
(defn model-hooks
  "Return an inverted map of data dependencies to search models, used for updating them based on underlying models."
  []
  (merge-hooks
   (for [[search-model spec-fn] (methods spec)]
     (search-model-hooks (spec-fn search-model)))))

(defn search-models-to-update
  "Given an updated or created instance, return a description of which search-models to (re)index."
  [instance]
  (into #{}
        (keep
         (fn [{:keys [search-model fields where]}]
           ;; If there are no changes, treat it as if everything has changed.
           ;; Likewise, if there are no field dependencies, always do it - this is a hack for dashcards to cards.
           (when (or (not fields) (some fields (keys (or (t2/changes instance) instance))))
             [search-model (insert-values where :updated instance)])))
        (get (model-hooks) (t2/model instance))))
