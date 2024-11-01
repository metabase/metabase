(ns metabase.search.spec
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private SearchModel
  [:enum "dashboard" "table" "dataset" "segment" "collection" "database" "action" "indexed-entity" "metric" "card"])

(def ^:private AttrValue
  "Key must be present, to show it's been explicitly considered.

  - false: not present
  - true: given by a column with the same name (snake case)
  - keyword: given by the corresponding column
  - vector: calculated by the given expression"
  [:union :boolean :keyword vector?])

(def ^:private Attrs
  (into [:map] (for [k [:archived
                        :collection-id
                        :creator-id
                        :database-id
                        :table-id
                        :created-at]]
                 [k AttrValue])))

(def ^:private JoinMap
  "We use our own schema instead of raw HoneySQL, so that we can invert it to calculate the update hooks."
  [:map-of :keyword [:tuple :keyword vector?]])

(def ^:private Specification
  [:map
   [:name SearchModel]
   [:model :keyword]
   [:attrs Attrs]
   [:search-terms [:sequential {:min 1} :keyword]]
   [:render-terms [:map-of :keyword AttrValue]]
   [:where {:optional true} vector?]
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

(defn- remove-table [table kw]
  (if (and table (not (namespace kw)))
    (keyword (subs (name kw) (inc (count (name table)))))
    kw))

(defn- find-fields-kw [table kw]
  (when (has-table? table kw)
    #{(remove-table table kw)}))

(defn- union-find
  "Aggregate the references within each element of xs using f"
  [f table xs]
  (reduce set/union #{} (map (partial f table) xs)))

(defn- find-fields-expr [table expr]
  (cond
    (keyword? expr)
    (find-fields-kw table expr)

    (vector? expr)
    (union-find find-fields-expr table (rest expr))))

(defn- find-fields-attr [table [k v]]
  (when v
    (if (true? v)
      (when (nil? table)
        #{k})
      (find-fields-expr table v))))

(defn- find-fields-select-item [table x]
  (cond
    (keyword? x)
    (find-fields-kw table x)

    (vector? x)
    (find-fields-expr table (first x))))

(defn- find-fields-select-items [table x]
  (union-find find-fields-select-item table x))

(defn- find-fields-top [table x]
  (cond
    (map? x)
    (union-find find-fields-attr table x)

    (sequential? x)
    (find-fields-select-items table x)

    :else
    (throw (ex-info "Unexpected format for fields" {:table table :x x}))))

(defn- find-fields
  "Search within a definition for all the fields referenced on the given table alias."
  [table spec]
  (into #{}
        (map #(keyword (u/->snake_case_en (name %))))
        (union-find
         find-fields-top
         table
         ;; Remove the keys with special meanings (should probably switch this to an allowlist rather)
         (vals (dissoc spec :name :native-query :where :joins :bookmark :model)))))

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
  (let [s (:name spec)]
    (into {}
          (cons
           [(:model spec) #{{:search-model s
                             :fields       (set/union (find-fields nil spec) (find-fields :this spec))
                             :where        [:= :updated.id :this.id]}}]
           (for [[table-alias [model join-condition]] (:joins spec)]
             (let [fields (find-fields table-alias spec)]
               [model #{{:search-model s
                         :fields       fields
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
  "TODO write docstring"
  (fn [search-model] search-model))

(defn validate-spec!
  "Check whether a given specification is valid"
  [spec]
  (when-let [info (mc/explain Specification spec)]
    (throw (ex-info (str "Invalid search specification for " (:name spec) ": " (me/humanize info)) info)))
  ;; validate consistency etc
  ;; ... not sure what to check here actually, Malli has covered a lot!
  )

(defmacro define-spec
  "Define a spec for a search model."
  [search-model spec]
  ;; TODO validate spec shape, consistency, and completeness
  `(let [spec# ~spec
         spec# (assoc spec# :name ~search-model)]
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
           (when (some fields (keys (or (t2/changes instance) instance)))
             [search-model (insert-values where :updated instance)])))
        (get (model-hooks) (t2/model instance))))
