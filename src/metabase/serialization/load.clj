(ns metabase.serialization.load
  "Import: entities loaded into a store, the app DB by default, a batch at a time, in one transaction."
  (:refer-clojure :exclude [import load])
  (:require
   [clojure.walk :as walk]
   [metabase.dependencies.hooks :as dependencies.hooks]
   [metabase.models.interface :as mi]
   [metabase.serialization.dependencies :as serialization.dependencies]
   [metabase.serialization.entity :as serialization.entity]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.protocol.app-db :as protocol.app-db]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.serialization.util :as serialization.util]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log])
  (:import
   (java.time OffsetDateTime ZonedDateTime)))

(set! *warn-on-reflection* true)

(defmulti before-load
  "The load `items` of `model`, each `{:entity entity :row row :local local}`: the entity, the row it deserializes to,
  and the row of the store it updates, or nil when it is new. Returns the items to load, so a model can leave items
  out, adjust their `:row` against their `:local` row, adjust the `:entity` whose after-insert columns it imports, or
  throw to refuse them, much like a t2 `before-update`. By default, the items."
  {:arglists '([model items])}
  (fn [model _items] model))

(defmethod before-load :default [_ items] items)

(defmulti after-load
  "Runs the side effects of loading `items` of `model`, each a load item (see [[before-load]]) with the loaded
  `:instance`. By default, none."
  {:arglists '([model items])}
  (fn [model _items] model))

(defmethod after-load :default [_ _items] nil)

(def ^:private import-opts
  "The options of an import into the app DB, which creates the Users, Databases, Tables and Fields it lacks."
  {:create-missing? true})

(defn- rows-by-refs
  "The row of `model` in `store` each of `entities` updates, found by its ref, or nil."
  [store model entities]
  (let [refs  (mapv #(serialization.entity/entity-ref model %) entities)
        found (protocol/select-by-refs store model (into #{} (remove nil?) refs) nil)]
    (mapv #(get found %) refs)))

(defn- rows-by-identity
  "The row among `rows`, the rows of the store a child entity can update, each of `deserialized` matches on the
  identity columns of `model`, or nil; of several matches the oldest wins."
  [model rows deserialized]
  (let [[k :as ks] (serialization.spec/identity-columns model)
        tuple      (apply juxt ks)
        pk         (serialization.spec/primary-key model)
        by-tuple   (serialization.util/index-first (sort-by #(get % pk) rows) tuple identity)]
    (mapv #(when (some? (get % k)) (get by-tuple (tuple %))) deserialized)))

(defn- comparable
  "`x` as an import compares it with a value of the store: without the uuids and metadata providers of MBQL clauses,
  which every import of a query regenerates, with temporals as instants, localized strings as their text, and byte
  arrays as their bytes."
  [x]
  (walk/postwalk (fn [y]
                   (cond
                     (i18n/localized-string? y)     (str y)
                     (bytes? y)                     (vec y)
                     (map? y)                       (dissoc y :lib/uuid :lib/metadata)
                     (instance? OffsetDateTime y)   (.toInstant ^OffsetDateTime y)
                     (instance? ZonedDateTime y)    (.toInstant ^ZonedDateTime y)
                     :else                          y))
                 x))

(defn- same?
  "Whether `x`, an imported value, equals `local`, the value of the row of the store it updates."
  [x local]
  (or (= x local) (= (comparable x) (comparable local))))

(defn- changes
  "The columns of `row` whose values differ from those of `local`, the row it updates, a column `local` lacks counting
  as nil."
  [row local]
  (into {} (remove (fn [[k v]] (same? v (get local k)))) row))

(defn- write!
  "Inserts the `items` with no row of the store, without their nil columns, and updates the others with the columns of
  their `:row` that changed, but those their entity loads without to break a cycle, returning each with its loaded
  `:instance`."
  [store model items]
  (let [pk       (serialization.spec/primary-key model)
        new-idxs (into [] (keep-indexed (fn [i {:keys [local]}] (when-not local i))) items)
        inserted (when (seq new-idxs)
                   (zipmap new-idxs (protocol/insert-rows! store model (mapv #(into {} (filter (comp some? val)) (:row (items %)))
                                                                             new-idxs))))]
    (vec (map-indexed (fn [i {:keys [row local entity] :as item}]
                        (if local
                          (let [row     (apply dissoc row (:serdes/stripped entity))
                                changed (changes row local)]
                            (when (seq changed)
                              (protocol/update-row! store model (get local pk) changed))
                            (assoc item :instance (merge local row)))
                          (assoc item :instance (get inserted i))))
                      items))))

(defn- prepare-items
  "The load items of `entities` of `model` (see [[before-load]]): deserialized in `store` with `opts`, each with the
  row `locals` holds for it, and passed through [[before-load]]."
  [model store entities opts locals]
  (let [rows (serialization.entity/deserialize-entities model store entities opts)]
    (vec (before-load model (mapv (fn [entity row local] {:entity entity :row row :local local})
                                  entities rows (locals rows))))))

(declare ^:private load-children!)

(defn- load-items!
  "Writes the load `items` of `model`, loads their child entities (see [[metabase.serialization.spec]]), and passes
  them to [[after-load]], in `store` with `opts`. Returns the loaded instances."
  [model store items opts]
  (let [items (write! store model items)]
    (doseq [[k child-model] (serialization.spec/children model)]
      (load-children! child-model store items k opts))
    (after-load model items)
    (mapv :instance items)))

(defn- load-children!
  "Loads the entities under `k` in the entities of the loaded parent `items` as rows of `model` that hold their parent's
  primary key, deleting first the children of these parents that none matches on the identity of `model`. A parent
  whose entity lacks `k`, like one loading without the keys that close a dependency cycle, keeps its children."
  [model store items k opts]
  (let [parent-key (:key (serialization.spec/parent model))
        items      (filter #(contains? (:entity %) k) items)
        parent-pks (into #{} (map (comp :id :instance)) items)
        entities   (vec (for [{:keys [instance entity]} items
                              x                         (get entity k)]
                          (assoc x parent-key (:id instance))))]
    (when (seq parent-pks)
      (let [pk       (serialization.spec/primary-key model)
            existing (protocol/select-by-parent-pks store model parent-pks nil)
            prepared (prepare-items model store entities opts #(rows-by-identity model existing %))
            kept     (into #{} (keep #(some-> (:local %) (get pk))) prepared)
            stale    (into #{} (comp (map #(get % pk)) (remove kept)) existing)]
        (when (seq stale)
          (protocol/delete-rows! store model stale))
        (load-items! model store prepared opts)))))

(defn load
  "Loads `entities` of `model` into `store`, the app DB by default, with `opts`, creating the rows they refer to by
  default, in one batch: each updates the row of the store its ref finds, or is inserted. Returns the loaded
  instances."
  ([model entities]
   (load model protocol.app-db/store entities import-opts))
  ([model store entities opts]
   (binding [mi/*deserializing?* true]
     (let [entities (vec entities)]
       (load-items! model store (prepare-items model store entities opts (fn [_] (rows-by-refs store model entities)))
                    opts)))))

(defn import
  "The rows that `entities` of `model` import to, with their references resolved at once in the app DB."
  [model entities]
  (serialization.entity/deserialize-entities model protocol.app-db/store (vec entities) import-opts))

(defn local-rows
  "The row of the app DB each of `entities` of `model` updates, found by its ref without creating anything, or nil."
  [model entities]
  (rows-by-refs protocol.app-db/store model (vec entities)))

;;; ------------------------------------------------------ Order -------------------------------------------------------

(def ^:private circular-keys
  "The keys that break the dependency cycles a model can be part of: an entity in a cycle loads without them first,
  then again whole. A dashboard question's card points at its dashboard, whose dashcards point at the card."
  {:model/Dashboard #{:dashcards :parameters}
   :model/Document  #{:document}
   :model/Card      #{:dashboard_id :document_id :parameters}})

(def ^:private strip-priority
  "The models whose entities break a cycle first: the keys a card loads without matter least."
  {:model/Card 0 :model/Document 1 :model/Dashboard 2})

(defn- batch-references
  "The `[k {:all keys :stripped keys :children keys}]` of each `[k entity]` of `batch`, entities with their keys: the
  keys of the entities it and its child entities depend on, whole and without the keys that close its dependency
  cycles, and the keys of its child entities."
  [batch]
  (for [[model pairs] (group-by ffirst batch)
        :let [ks       (mapv first pairs)
              entities (mapv second pairs)
              strip    (circular-keys model)
              all      (serialization.dependencies/import-dependencies-with-children model entities)
              stripped (when strip
                         (serialization.dependencies/import-dependencies-with-children
                          model (mapv #(apply dissoc % strip) entities)))]
        [i k] (map-indexed vector ks)]
    [k {:all      (cond-> (nth all i) (not strip) (disj k))
        :stripped (when strip (disj (nth stripped i) k))
        :children (serialization.dependencies/child-keys model (nth entities i))}]))

(defn- prerequisites
  "The map from each of `ks`, the `[model ref]` keys of entities, to `{:all keys :stripped keys}`: the keys among them
  of the entities that the entity `read-batch` returns for it, and its child entities, refer to, whole and without the
  keys that close its dependency cycles. A reference to a child entity is to its parent. `read-batch` is a fn of a
  batch of keys, returning their entities, and only the references of the entities stay in memory."
  [ks read-batch]
  (let [refs    (into {}
                      (comp (partition-all serialization.util/batch-size)
                            (mapcat (fn [batch] (batch-references (map vector batch (read-batch (vec batch)))))))
                      ks)
        parents (into {} (for [[k {:keys [children]}] refs, child-key children] [child-key k]))
        among   (fn [ks-refs] (into #{} (comp (map #(get parents % %)) (filter refs)) ks-refs))]
    (update-vals refs (fn [{:keys [all stripped]}]
                        {:all      (among all)
                         :stripped (some-> stripped among)}))))

(defn load-order
  "The keys `ks` of the entities `read-batch` returns for a batch of them, `[model ref]`, as batches to load in order,
  each `{:model model :keys [...] :strip keys}`: every entity after the entities among them it refers to. A dependency
  cycle is broken by one of its entities, which comes first in a batch without the `:strip` keys that close the cycle,
  and again later whole."
  [ks read-batch]
  (let [prereqs (prerequisites ks read-batch)
        batches (fn [ks strip]
                  (for [[model ks] (group-by first (sort-by pr-str ks))]
                    {:model model :keys (vec ks) :strip strip}))]
    (loop [remaining (set ks) loaded #{} stripped #{} order []]
      (if (empty? remaining)
        order
        (let [ready (filter #(every? loaded (:all (prereqs %))) remaining)]
          (if (seq ready)
            (recur (reduce disj remaining ready) (into loaded ready) stripped (into order (batches ready nil)))
            (let [[k] (->> remaining
                           (filter #(when-let [deps (and (not (stripped %)) (:stripped (prereqs %)))]
                                      (every? (some-fn loaded stripped) deps)))
                           (sort-by (juxt (comp strip-priority first) pr-str)))]
              (when-not k
                (throw (ex-info "Circular dependency that no stripped keys break" {:keys remaining})))
              (recur remaining (conj loaded k) (conj stripped k)
                     (into order (batches [k] (circular-keys (first k))))))))))))

;;; --------------------------------------------------- Transaction ----------------------------------------------------

(defn load-error
  "The error of `entity`, an entity of `model`, failing to load with `e`. Its ex-data names the entity by
  `:model`, `:id`, its ref, and `:name`, with the `:stripped` keys it loaded without, if any."
  [model entity e]
  (let [[_ id] (serialization.entity/key-of entity)]
    (ex-info (format "Failed to load %s" (serialization.entity/log-str entity))
             (cond-> {::type :load-error :model model :id id :name (when (string? (:name entity)) (:name entity))}
               (:serdes/stripped entity) (assoc :stripped (:serdes/stripped entity)))
             e)))

(defn load-error?
  "Whether `e` is a [[load-error]]."
  [e]
  (= :load-error (::type (ex-data e))))

(defn- load-batch!
  "Loads `entities` of `model` in a savepoint; when they fail, rolls back to it and loads them one at a time, each in
  its own savepoint, to tell the [[load-error]] of each entity that fails. Throws the first of them unless
  `continue-on-error`, and returns them otherwise."
  [model store entities opts continue-on-error]
  (let [load (fn [entities]
               (protocol/transact store {} #(load model store entities opts)))]
    (try
      (load entities)
      []
      (catch Exception e
        (let [errors (into []
                           (keep (fn [entity]
                                   (try
                                     (load [entity])
                                     nil
                                     (catch Exception e
                                       (load-error model entity e)))))
                           entities)]
          (when-not continue-on-error
            (throw (or (first errors) e)))
          (doseq [error errors]
            (log/warnf "Skipping %s: %s" (ex-message error) (ex-message (ex-cause error))))
          errors)))))

(defn do-with-import-transaction
  "Calls `thunk`, which should do the whole import, in one transaction of the app DB (see [[with-import-transaction]]),
  marking the dependents of what it changes once at its end, and retrying it on a transient DB error."
  [thunk]
  (protocol/transact protocol.app-db/store {:retries 3} #(dependencies.hooks/with-batched-marks (thunk))))

(defmacro with-import-transaction
  "Runs `body`, which should do the whole import, in one transaction of the app DB, so it lands whole or not at all."
  [& body]
  `(do-with-import-transaction (fn [] ~@body)))

(defn load-all
  "Loads the entities with the `[model ref]` keys `ks` into the app DB in one transaction, every entity after what it
  depends on. `read-batch` is a fn of a batch of keys returning their entities, called a batch at a
  time so that the whole import need not fit in memory. Retries the whole import on a transient DB error. With
  `continue-on-error`, an entity that fails to load is left out and its error returned; otherwise the first failure
  rolls the whole import back. With `skip-schema-validation`, queries load even when this instance's query schema
  rejects them. With `store`, it loads into that store rather than the app DB. Returns the errors."
  [ks read-batch & {:keys [continue-on-error skip-schema-validation store] :or {store protocol.app-db/store}}]
  (let [order (load-order ks read-batch)
        opts  {:create-missing?         true
               :skip-schema-validation? (boolean skip-schema-validation)}]
    (protocol/transact
     store
     {:retries 3}
     (fn []
       (into []
             (mapcat (fn [{:keys [model keys strip]}]
                       (eduction (comp (partition-all serialization.util/batch-size)
                                       (mapcat (fn [batch]
                                                 (load-batch! model
                                                              store
                                                              (mapv #(cond-> %
                                                                       strip (-> (as-> e (apply dissoc e strip))
                                                                                 (assoc :serdes/stripped strip)))
                                                                    (read-batch (vec batch)))
                                                              opts
                                                              continue-on-error))))
                                 keys)))
             order)))))
