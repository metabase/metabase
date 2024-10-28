(ns metabase.search.spec
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [toucan2.core :as t2]))

(defmulti spec
  "TODO write docstring"
  ;; TODO use actual model instead of weird name
  (fn [model-name] model-name))

(defmacro define-spec
  "Define a spec for a search model."
  [search-model spec]
  ;; TODO validate spec shape, consistency, and completeness
  `(defmethod spec ~search-model [~'_] ~(assoc spec :name search-model)))

(defn- qualify-column* [table column]
  (if (str/includes? (name column) ".")
    column
    (keyword (str (name table) "." (name column)))))

(defn qualify-column
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

(defn qualify-columns
  "Given a list of select-item, qualify all naked column references to refer to the given table."
  [table select-item]
  (for [column select-item
        :when (and column (or (not (vector? column))
                              (some? (first column))))]
    (qualify-column table column)))

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

(defn- find-fields-select-item [table x]
  (cond
    (keyword? x)
    (find-fields-kw table x)

    (vector? x)
    (find-fields-expr table (first x))))

(defn- find-fields-select-items [table x]
  (cond
    (keyword? x)
    (find-fields-kw table x)

    (sequential? x)
    (union-find find-fields-select-item table x)))

(defn- find-fields-top [table x]
  (cond
    (keyword? x)
    (find-fields-kw table x)

    (map? x)
    (union-find find-fields-expr table x)

    (sequential? x)
    (find-fields-select-items table x)))

(defn- find-fields
  "Search within a definition for all the fields referenced on the given table alias."
  [table spec]
  (set/union (find-fields-expr table (:archived spec))
             (union-find
              find-fields-top
              table
              ;; Remove the keys with special meanings (should probably switch this to an allowlist rather)
              (vals (dissoc spec :skip :joins :bookmark :model :archived)))))

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
