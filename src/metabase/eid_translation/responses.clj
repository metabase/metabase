(ns metabase.eid-translation.responses
  "API response bodies rewritten so that they name rows the way serialization and remote sync do, never by numeric id.
  An instance that a git-sync restore made from another gives the same body.

  A row of a model with entity ids, and each Database, Table, Field and User, has a ref: its entity id; a Database's
  name; a Table's `[db-name schema table-name]`; a Field's `[db-name schema table-name & field-names]`; and a User's
  email. Such a row's own `:id` becomes its ref. Every row of a model with a serialization spec also has each of its
  reference columns replaced by the ref of the row it names: the `fk-transform` columns of its spec, the column naming
  its parent, and the `:references` of its [[metabase.eid-translation.spec/spec]], columns serialization skips. A
  Collection's `:location` and `:effective_location` name its ancestors by entity ids.

  A row is a Toucan instance; a plain map under a key whose `_id` column the row holding it references, such as the
  `:dashboard` of a Card with a `:dashboard_id`; or a plain map with a `:model` that [[api/model->db-model]] names, as
  in lists of items. Rows of models with neither entity ids nor natural keys keep their own numeric ids, and so does a
  plain map of unknown model, whose `:id` may name nothing at all; only the few columns of such a map that name rows of
  the same model wherever they are, such as `:field_id`, are replaced. A row of a known model has those columns
  replaced too. A reference column holding a list or set of ids has each replaced. An id whose row is missing stays as it is.
  All the refs of a body are found with one query per model.

  The walk does not enter a structure column, one whose serialization transform names no model. The structure columns
  with ids inside that a model's [[metabase.eid-translation.spec/spec]] names in `:structures`, such as a Card's query
  or a dashcard's visualization settings, are given as serialization exports them, each model's column a batch at a
  time. A value that fails to export, and every other structure column, stays as it is."
  (:require
   [metabase.api.common :as api]
   [metabase.eid-translation.spec :as eid-translation.spec]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.resolve :as serialization.resolve]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util IdentityHashMap)))

(set! *warn-on-reflection* true)

(def ^:private natural-key-models
  "The models without entity ids whose rows serialization names by natural keys."
  #{:model/Database :model/Table :model/Field :model/User})

(defn- ref-model?
  "Whether the rows of `model` have refs: entity ids or natural keys."
  [model]
  (or (contains? natural-key-models model)
      (isa? model :hook/entity-id)))

(def ^:private plain-map-references
  "The columns that name rows of the same model wherever they are, unlike `:parent_id` or `:model_id`. They are all
  the references of a plain map of unknown model, and every row of a known model, such as a search result, has them
  as well as those of its model."
  {:card_id        :model/Card
   :collection_id  :model/Collection
   :creator_id     :model/User
   :dashboard_id   :model/Dashboard
   :database_id    :model/Database
   :db_id          :model/Database
   :field_id       :model/Field
   :last_editor_id :model/User
   :table_id       :model/Table
   :transform_id   :model/Transform
   :user_id        :model/User})

(def ^:private dispatched-references
  "The reference columns of a plain map of unknown model whose model depends on another of its columns, as
  `{dispatch-column {value {column model}}}`: a run summary of the Transform runs listing names the job or Transform
  it ran by `:entity_id`, as its `:run_type` says."
  {:run_type {"job"       {:entity_id :model/TransformJob}
              "dag"       {:entity_id :model/Transform}
              "transform" {:entity_id :model/Transform}}})

(defn- plain-map-row-references
  "The references of `m`, a plain map of unknown model: [[plain-map-references]], and those of
  [[dispatched-references]] that its columns pick."
  [m]
  (reduce-kv (fn [references column value->references]
               (let [v (get m column)]
                 (merge references
                        (when (or (string? v) (keyword? v))
                          (get value->references (name v))))))
             plain-map-references
             dispatched-references))

(defn- model-columns
  "For `model`, `{:references {column model-of-the-rows-it-names} :structures #{column} :exports {column export-fn}}`:
  the columns holding the ids of rows with refs; the columns holding structures, which the walk does not enter; and,
  of those, the ones the `:structures` of its eid-translation spec names, with the `:export` fn of their serialization
  transforms, and the ones its `:transforms` names, with theirs."
  [model]
  (let [spec       (serialization/spec model)
        eid-spec   (eid-translation.spec/spec model)
        references (into {}
                         (filter (fn [[_column target]] (ref-model? target)))
                         (concat (keep (fn [[column transform]] (some->> (:model transform) (vector column)))
                                       (:transform spec))
                                 (when-let [{parent :model column :key} (:parent spec)]
                                   [[column parent]])
                                 (:references eid-spec)))]
    {:references (merge plain-map-references references)
     :structures (into (set (keys (:transforms eid-spec)))
                       (comp (remove (fn [[column transform]] (or (:model transform) (contains? references column))))
                             (map key))
                       (:transform spec))
     :exports    (into (update-vals (:transforms eid-spec) :export)
                       (keep (fn [column] (some->> (get-in spec [:transform column :export]) (vector column))))
                       (:structures eid-spec))}))

(def ^:private item-models
  "The model of each `:model` that [[api/model->db-model]] names, of plain maps in lists of items."
  (update-vals api/model->db-model :db-model))

(def ^:private keyed-models
  "The model of a plain map under these keys, which no column of its holder names."
  {:last-edit-info    :model/User
   :parent_collection :model/Collection})

(defn- location-ids
  "The ids of the ancestors that the Collection location `location`, such as `\"/1/2/\"`, names."
  [location]
  (when (string? location)
    (mapv parse-long (re-seq #"\d+" location))))

(defn- location-ref
  "The location naming by entity ids the Collections that `location` names by id, or nil when one is missing."
  [location visit]
  (when-let [ids (seq (location-ids location))]
    (let [refs (mapv #(visit :model/Collection %) ids)]
      (when (every? string? refs)
        (apply str "/" (map #(str % "/") refs))))))

(defn- row-replacements
  "The map from each key of `row`, a map of `model` with `references`, holding ids to its value with `visit`, a fn of
  a model and an id, applied to them."
  [model references row visit]
  (let [replace (fn [replacements column target]
                  (let [v (get row column)]
                    (cond
                      (pos-int? v)
                      (assoc replacements column (visit target v))

                      (and (or (sequential? v) (set? v)) (seq v) (every? pos-int? v))
                      (assoc replacements column (into (if (set? v) #{} []) (map #(visit target %)) v))

                      :else
                      replacements)))]
    (cond-> (reduce-kv replace (if (ref-model? model) (replace {} :id model) {}) references)
      (= model :model/Collection)
      (into (keep (fn [k] (some->> (location-ref (get row k) visit) (vector k))))
            [:location :effective_location]))))

(defn- rewrite-row
  "`row`, a map of `model`, with its replacements. An instance keeps its own values, for the code that reads them, such
  as its model's JSON encoding, which checks permissions by id; its JSON carries the new ones (see
  [[mi/with-json-replacements]])."
  [model references row visit]
  (let [replacements (row-replacements model references row visit)]
    (cond
      (empty? replacements)     row
      (keyword? (t2/model row)) (mi/with-json-replacements row replacements)
      :else                     (merge row replacements))))

(defn- walker
  "A walk for [[serialization.resolve/walk-in-bulk]] of a response body, with `columns` the memoized [[model-columns]]
  and `export` a fn of a model, a column, the row of the body holding it and its value, returning the value the walk
  gives the column, for the columns of the `:exports` of the model."
  [columns export]
  (fn walk [visit body]
    (letfn [(row-model [holder-references k m]
              (let [model (t2/model m)]
                (cond
                  (keyword? model) model
                  (some? model)    nil
                  :else            (or (get keyed-models k)
                                       (when (keyword? k)
                                         (get holder-references (keyword (str (name k) "_id"))))
                                       (when-let [item-model (:model m)]
                                         (when (or (string? item-model) (keyword? item-model))
                                           (get item-models (name item-model))))))))
            (visit-x [holder-references k x]
              (cond
                (map? x)
                (let [model                                   (row-model holder-references k x)
                      {:keys [references structures exports]} (cond
                                                                model               (columns model)
                                                                (nil? (t2/model x)) {:references (plain-map-row-references x)}
                                                                :else               nil)
                      x                                       (reduce-kv (fn [m k' v]
                                                                           (let [v' (cond
                                                                                      (contains? exports k')    (export model k' x v)
                                                                                      (contains? structures k') v
                                                                                      :else                     (visit-x references k' v))]
                                                                             (if (identical? v v') m (assoc m k' v'))))
                                                                         x
                                                                         x)]
                  (if (or model (seq references))
                    (rewrite-row model references x visit)
                    x))

                (vector? x)     (mapv #(visit-x holder-references k %) x)
                (set? x)        (into (empty x) (map #(visit-x holder-references k %)) x)
                (sequential? x) (doall (map #(visit-x holder-references k %) x))
                :else           x))]
      (visit-x nil nil body))))

(defn- distinct-by-identity
  "`xs` without the repeats of an object, which a body holding the same row twice has."
  [xs]
  (let [seen (IdentityHashMap.)]
    (into [] (filter #(nil? (.put seen % true))) xs)))

(defn- export-values
  "The values of `column` of `rows` of `model` exported by `export-fn`, a serialization `:export` fn, as a vector in
  the order of `rows`, with `::failed` for each value that fails to export. A failing batch is exported again one row
  at a time, so that one value that fails, such as a broken query, does not fail the others."
  [model column export-fn rows]
  (let [export (fn [rows] (export-fn serialization/app-db-store rows (mapv #(get % column) rows) {}))]
    (try
      (vec (export rows))
      (catch Throwable _
        (mapv (fn [row]
                (try
                  (first (export [row]))
                  (catch Throwable e
                    (log/debugf e "Failed to export %s %s of a response" model column)
                    ::failed)))
              rows)))))

(defn- exported-structures
  "The map from each row of `body` holding a column of its model's `:exports` (see [[model-columns]]), by identity, to
  the map from that column to its value exported, with the values of each model and column exported a batch at a
  time."
  [body columns]
  (let [rows    (volatile! {})
        collect (fn [model column row v]
                  (when (some? v)
                    (vswap! rows update [model column] (fnil conj []) row))
                  v)
        result  (IdentityHashMap.)]
    ((walker columns collect) (fn [_model id] id) body)
    (doseq [[[model column] rows]  @rows
            :let                   [export-fn (get-in (columns model) [:exports column])]
            batch                  (partition-all serialization/batch-size (distinct-by-identity rows))
            [row v]                (map vector batch (export-values model column export-fn (vec batch)))
            :when                  (not= ::failed v)]
      (.put result row (assoc (.get result row) column v)))
    result))

(defn ->entity-ids
  "`body`, an API response body, with each numeric id of a row with a ref, and each such id a row references, replaced
  by that row's ref, and each structure column of its model's `:exports` given as serialization exports it."
  [body]
  (let [columns  (memoize model-columns)
        exported (exported-structures body columns)
        walk     (walker columns (fn [_model column row v]
                                   (let [row-exports (.get ^IdentityHashMap exported row)]
                                     (if (contains? row-exports column)
                                       (get row-exports column)
                                       v))))]
    (first (serialization.resolve/walk-in-bulk
            [body]
            (fn [visit form]
              (walk (fn [model id]
                      (or (serialization.resolve/found-or-nil #(visit model id)) id))
                    form))
            (fn [model ids]
              (serialization.resolve/row-refs serialization/app-db-store model ids))))))
