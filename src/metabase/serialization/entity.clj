(ns metabase.serialization.entity
  "Rows of a model as entities and back, by its spec, and the model and ref of an entity.

  An entity's `:serdes/meta` names only its model, `[{:model \"Card\"}]`. Its ref, which other entities refer to it
  by, comes from its own keys: the exported values of its spec's identity columns, like the entity id of a Card, the
  name of a Database, or the `[db-name schema table-name]` of a Table."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.lib.core :as lib]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.util :as u]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn meta-of
  "The `:serdes/meta` of an entity of `model`."
  [model]
  [{:model (name model)}])

(defn model-of
  "The model of `entity`, named by its `:serdes/meta`."
  [entity]
  (some->> entity :serdes/meta last :model (keyword "model")))

(defn validate-export
  "In dev and test, throws when `entity`, exported from a row of `model`, does not match the schema of its spec."
  [model entity]
  (when (or config/is-dev? config/is-test?)
    (let [schema (or (:schema (serialization.spec/spec-of model))
                     (throw (ex-info (format "No :schema in the serialization spec of %s" model)
                                     {:model model})))]
      (when-let [error (some-> (mr/explain schema entity) mu.humanize/humanize)]
        (throw (ex-info (format "Invalid export of %s: %s" model (pr-str error))
                        {:model model :error error}))))))

(defn- transformed
  "The values of column `k` of the rows or entities `batch` transformed by `f`, a fn of `store`, the batch, the
  values and `opts`."
  [store batch k opts f]
  (let [values (mapv #(get % k) batch)
        result (vec (f store batch values opts))]
    (when-not (= (count values) (count result))
      (throw (ex-info (format "The transform of %s returned %d values for %d" k (count result) (count values))
                      {:key k})))
    result))

(defn- exported?
  "Whether the value `v` of the column `k` goes in an export: when it is neither nil nor its default in `defaults`."
  [defaults k v]
  (and (some? v) (not= v (get defaults k))))

(declare serialize-rows)

(defn- serialize-children
  "For each of `rows`, rows of `model`, the vector of the exported rows of `child-model` whose parent it is, sorted by
  the `:order` of its parent, or by entity id."
  [model child-model store rows]
  (let [pk                    (serialization.spec/primary-key model)
        {k :key order :order} (serialization.spec/parent child-model)
        parent-pks            (into #{} (keep #(get % pk)) rows)
        children              (when (seq parent-pks)
                                (sort-by (or order :entity_id)
                                         (protocol/select-by-parent-pks store child-model parent-pks nil)))
        exported              (serialize-rows child-model store (vec children))
        by-parent             (group-by #(get (nth children %) k) (range (count children)))]
    (mapv (fn [row] (mapv exported (get by-parent (get row pk)))) rows)))

(defn serialize-rows
  "The `rows` of `model` exported as entities by its spec, with their database ids resolved to references in `store`
  all at once, leaving out the columns that are nil or at their default, and with their children nested under the keys
  of its spec's `:children`, but those that are `:import-only?`."
  [model store rows]
  (let [spec     (serialization.spec/spec-of model)
        defaults (:defaults spec)
        columns  (concat (for [[k transform] (:transform spec)
                               :when (:export transform)]
                           [(:as transform k) (transformed store rows k {} (:export transform))])
                         (for [[k child-model] (:children spec)
                               :when (not (:import-only? (serialization.spec/parent child-model)))]
                           [k (serialize-children model child-model store rows)]))
        exported (fn [i row]
                   (reduce (fn [entity [k values]]
                             (let [v (nth values i)]
                               (cond-> entity
                                 (exported? defaults k v) (assoc k v))))
                           (-> (into {} (filter (fn [[k v]] (exported? defaults k v))) (select-keys row (:copy spec)))
                               (assoc :serdes/meta (meta-of model)))
                           columns))]
    (vec (map-indexed exported rows))))

(defn deserialize-entities
  "The `entities` of `model`, normalized by the `:schema` of its spec but for the columns its import transforms
  normalize themselves, as the rows to insert, with their references resolved to database ids in `store` with `opts`
  all at once. Each column the spec copies or exports is set to the entity's value, or else to its default, or else to
  nil; a column it only imports is set only when the entity holds a value, and the columns imported after insert are
  left out."
  [model store entities opts]
  (let [spec     (serialization.spec/spec-of model)
        defaults (:defaults spec)
        raw-keys (into [] (keep (fn [[k transform]] (when (:import transform) (:as transform k)))) (:transform spec))
        entities (mapv #(merge (lib/normalize (:schema spec) (apply dissoc % raw-keys)) (select-keys % raw-keys))
                       entities)
        columns  (concat (for [k (:copy spec)]
                           [k true (mapv #(get % k) entities)])
                         (for [[k transform] (:transform spec)
                               :when (:import transform)]
                           [k (some? (:export transform))
                            (transformed store entities (:as transform k) opts (:import transform))]))
        row      (fn [i]
                   (reduce (fn [row [k exported values]]
                             (let [v (nth values i)
                                   v (if (some? v) v (get defaults k))]
                               (cond-> row
                                 (or (some? v) exported) (assoc k v))))
                           {}
                           columns))]
    (mapv row (range (count entities)))))

(defn- table-ref
  "The `[db-name schema table-name]` ref of the Table on a full `:serdes/meta` `path`, with a nil schema for a
  schemaless Table."
  [path]
  (let [id-of (fn [model] (some #(when (= model (:model %)) (:id %)) path))]
    [(id-of "Database") (id-of "Schema") (id-of "Table")]))

(defn- field-ref
  "The `[db-name schema table-name & field-names]` ref of the Field on a full `:serdes/meta` `path`."
  [path]
  (into (table-ref path) (keep #(when (= "Field" (:model %)) (:id %))) path))

(def ^:private path-identity
  "For each model whose files kept their identity only in a full `:serdes/meta` path up to release 64, a fn of the path
  of its parent to its identity columns."
  {"Dimension"         (fn [parent] {:field_id (field-ref parent)})
   "FieldValues"       (fn [parent] {:field_id (field-ref parent)})
   "FieldUserSettings" (fn [parent] {:field_id (field-ref parent)})
   "TableUserSettings" (fn [parent] {:table_id (table-ref parent)})
   "OsiAiContext"      (fn [parent]
                         (let [{:keys [model id]} (peek parent)]
                           (if (= "Table" model)
                             {:entity_type "table" :entity_local_id (table-ref parent)}
                             {:entity_type     (get {"Card" "card" "Measure" "measure" "Segment" "segment"} model model)
                              :entity_local_id id})))})

(defn restore-identity
  "`entity` with the identity columns that an export up to release 64 kept only in its full `:serdes/meta` path filled
  in from that path."
  [entity]
  (let [path (vec (:serdes/meta entity))]
    (if-let [identity-of (and (next path) (path-identity (:model (peek path))))]
      (reduce-kv (fn [entity k v] (cond-> entity (nil? (get entity k)) (assoc k v)))
                 entity
                 (identity-of (pop path)))
      entity)))

(defmulti entity-ref
  "The ref of `entity`, an entity of `model`: the exported value of its one identity column, or the vector of the
  values of several, with keywords as their names."
  {:arglists '([model entity])}
  (fn [model _entity] model))

(defmethod entity-ref :default [model entity]
  (let [spec   (serialization.spec/spec-of model)
        values (for [k (serialization.spec/identity-columns model)]
                 (let [v (get entity (get-in spec [:transform k :as] k))]
                   (cond-> v
                     (string? v)  str/trim
                     (keyword? v) u/qualified-name)))]
    (if (next values) (vec values) (first values))))

(defn key-of
  "The `[model ref]` key of `entity`, which the dependencies of other entities name."
  [entity]
  (let [model (model-of entity)]
    [model (entity-ref model entity)]))

(defn log-str
  "`entity` as a string for logs and errors."
  [entity]
  (let [[model ref] (key-of entity)]
    (str (name model) " " (pr-str ref))))
