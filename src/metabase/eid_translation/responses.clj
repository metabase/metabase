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
  the same model wherever they are, such as `:field_id`, are replaced. An id whose row is missing stays as it is. All
  the refs of a body are found with one query per model.

  Ids inside a structure column, such as a Card's query or a dashcard's visualization settings, are left as they are:
  the walk does not enter the columns whose serialization transform names no model."
  (:require
   [metabase.api.common :as api]
   [metabase.eid-translation.spec :as eid-translation.spec]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.resolve :as serialization.resolve]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private natural-key-models
  "The models without entity ids whose rows serialization names by natural keys."
  #{:model/Database :model/Table :model/Field :model/User})

(defn- ref-model?
  "Whether the rows of `model` have refs: entity ids or natural keys."
  [model]
  (or (contains? natural-key-models model)
      (isa? model :hook/entity-id)))

(defn- model-columns
  "For `model`, `{:references {column model-of-the-rows-it-names} :structures #{column}}`: the columns holding the ids
  of rows with refs, and the columns holding structures, whose ids the walk leaves alone."
  [model]
  (let [spec       (serialization/spec model)
        references (into {}
                         (filter (fn [[_column target]] (ref-model? target)))
                         (concat (keep (fn [[column transform]] (some->> (:model transform) (vector column)))
                                       (:transform spec))
                                 (when-let [{parent :model column :key} (:parent spec)]
                                   [[column parent]])
                                 (:references (eid-translation.spec/spec model))))]
    {:references references
     :structures (into #{}
                       (comp (remove (fn [[column transform]] (or (:model transform) (contains? references column))))
                             (map key))
                       (:transform spec))}))

(def ^:private item-models
  "The model of each `:model` that [[api/model->db-model]] names, of plain maps in lists of items."
  (update-vals api/model->db-model :db-model))

(def ^:private keyed-models
  "The model of a plain map under these keys, which no column of its holder names."
  {:last-edit-info :model/User})

(def ^:private plain-map-references
  "The reference columns of a plain map of unknown model: the columns that name rows of the same model wherever they
  are, unlike `:parent_id` or `:model_id`."
  {:card_id       :model/Card
   :collection_id :model/Collection
   :creator_id    :model/User
   :dashboard_id  :model/Dashboard
   :database_id   :model/Database
   :db_id         :model/Database
   :field_id      :model/Field
   :table_id      :model/Table})

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
                    (cond-> replacements
                      (pos-int? v) (assoc column (visit target v)))))]
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
  "A walk for [[serialization.resolve/walk-in-bulk]] of a response body, with `columns` the memoized [[model-columns]]."
  [columns]
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
                (let [model                           (row-model holder-references k x)
                      {:keys [references structures]} (cond
                                                        model                 (columns model)
                                                        (nil? (t2/model x))   {:references plain-map-references}
                                                        :else                 nil)
                      x                               (reduce-kv (fn [m k' v]
                                                                   (let [v' (if (contains? structures k')
                                                                              v
                                                                              (visit-x references k' v))]
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

(defn ->entity-ids
  "`body`, an API response body, with each numeric id of a row with a ref, and each such id a row references, replaced
  by that row's ref."
  [body]
  (let [columns (memoize model-columns)
        walk    (walker columns)]
    (first (serialization.resolve/walk-in-bulk
            [body]
            (fn [visit form]
              (walk (fn [model id]
                      (or (serialization.resolve/found-or-nil #(visit model id)) id))
                    form))
            (fn [model ids]
              (serialization.resolve/row-refs serialization/app-db-store model ids))))))
