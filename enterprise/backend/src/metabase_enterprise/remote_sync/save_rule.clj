(ns metabase-enterprise.remote-sync.save-rule
  "The save rule of a merge pull. The pull plans from the content of each local entity at the time the merge read it,
  and writes an entity only while the entity still has that content. The witness is the content hash of the entity
  (the hash of its serialization, see [[metabase-enterprise.remote-sync.source/file-spec-hash]]), not a ledger row or
  a clock. When a user changed an entity that the pull must write, the pull stops: it returns a conflict on that
  entity, and the version does not move.

  The pull checks the rule three times:
  - [[pre-check!]], with no lock, before the load;
  - in the load transaction of each entity ([[wrap-load-one]]), with the entity row and its child rows locked;
  - in the reconcile transaction, with the entity rows of the delete closure ([[lock-closure!]]) and then the ledger
    rows ([[lock-ledger-rows!]]) locked: [[check-closure!]].

  Every transaction of the pull locks entity rows before ledger rows, as the save paths do."
  (:require
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.merge :as remote-sync.merge]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.models.serialization :as serdes]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn plan
  "The save-rule state of a merge pull with the result `merge-result` of [[remote-sync.merge/three-way-merge]]:
  - `:planned`: merge key -> the content hash of each entity of ours as the merge read it;
  - `:decisions`, `:ours-units` and `:theirs-paths` of the merge;
  - `:loaded`: an atom of the hashes that this pull wrote, `{:by-key {merge-key hash} :by-row {[model-type id]
    hash}}`."
  [{:keys [decisions ours-units theirs-paths]}]
  {:planned    (into {}
                     (keep (fn [[k unit]]
                             (when (remote-sync.merge/entity-key? k)
                               [k (source/file-spec-hash unit)])))
                     ours-units)
   :decisions    decisions
   :ours-units   ours-units
   :theirs-paths theirs-paths
   :loaded       (atom {:by-key {} :by-row {}})})

(def ^:private stop-error
  "The `:error` of the ex-data of a stop."
  :remote-sync/changed-during-pull)

(defn- stop!
  "Throw the stop of the pull on the entity with the merge key `k`. `phase` is `:pre-check`, `:load` or `:reconcile`;
  `reason` is `:changed`, `:decision` (an entity of the delete closure whose decision does not allow its delete) or
  `:unknown` (an entity of the delete closure that the merge did not see)."
  [phase reason k]
  (throw (ex-info (format "Content changed locally during the pull: %s" (pr-str k))
                  {:error  stop-error
                   :phase  phase
                   :reason reason
                   :key    k})))

(defn stop-data
  "The ex-data of the stop in the cause chain of `e` (a load wraps the exceptions of an entity), or nil."
  [e]
  (some (fn [ex]
          (let [data (ex-data ex)]
            (when (= stop-error (:error data))
              data)))
        (take-while some? (iterate ex-cause e))))

(defn stop-message
  "The message of the conflict result of a stop with the ex-data `data` (see [[stop-data]])."
  [{:keys [phase reason]}]
  (cond
    (= :unknown reason)
    "Import blocked: content was added locally during the pull under content that the remote branch deleted. Your local change is kept."

    (= :reconcile phase)
    "Import blocked: content changed locally during the pull, and the remote branch deleted the content that holds it. Your local change is kept."

    :else
    "Import blocked: content changed locally during the pull, and the remote branch also changed it. Your local change is kept."))

(defn stop-conflict
  "The stopped entity of a stop with the ex-data `data`, in the conflict shape of [[remote-sync.merge/three-way-merge]],
  for [[remote-sync.merge/conflict-label]]."
  [{:keys [ours-units]} {k :key}]
  {:key k :ours (get ours-units k)})

(defn- model-key
  "The Toucan 2 model of the serdes model `model-type`."
  [model-type]
  (keyword "model" model-type))

(defn- local-id
  "The primary key of the local row `local` of the serdes model `model-type`."
  [model-type local]
  (get local (serdes/primary-key model-type)))

(defn- key->local
  "The local row of the entity with the merge key `k`, or nil."
  [k]
  (serdes/load-find-local (mapv (fn [[model id]] {:model model :id id}) k)))

(defn- content-hash
  "The content hash of the entity `model-type` `id` as it is now, or nil when it does not exist."
  [model-type id]
  (when (some? id)
    (source/row->content-hash {:model_type model-type :model_id id})))

(defn- own-write
  "The hash that this pull wrote for the entity with the merge key `k`, or nil."
  [{:keys [loaded]} k]
  (get-in @loaded [:by-key k]))

(defn- changed?
  "True when the entity with the merge key `k` (`model-type` `id`, with a nil `id` when it does not exist) has neither
  its planned hash nor the hash that this pull wrote for it. False for an entity that the merge did not read and that
  this pull did not write: it has no hash to compare."
  [{:keys [planned] :as state} k model-type id]
  (let [plan (get planned k)
        own  (own-write state k)]
    (when (or plan own)
      (let [hash (content-hash model-type id)]
        (not-any? #(= hash %) (remove nil? [plan own]))))))

(defn pre-check!
  "Stop the pull, before any write, when an entity of ours that the pull will load or delete (the merge keys
  `load-keys` and `delete-keys`) no longer has its planned hash. Takes no lock. An entity to delete that a user deleted
  too passes."
  [{:keys [planned] :as state} load-keys delete-keys]
  (let [check! (fn [delete? k]
                 (when (contains? planned k)
                   (let [model-type (first (last k))
                         local      (key->local k)]
                     (when (and (not (and delete? (nil? local)))
                                (changed? state k model-type (some->> local (local-id model-type))))
                       (stop! :pre-check :changed k)))))]
    (run! (partial check! false) load-keys)
    (run! (partial check! true) delete-keys)))

(defn- nested-children
  "The `{:model :backward-fk}` of the nested models that the serialization of the serdes model `model-type` includes
  and whose `:backward-fk` column holds the primary key of the parent, in the order of their table names."
  [model-type]
  (->> (vals (:transform (serdes/make-spec model-type nil)))
       (filter ::serdes/nested)
       ;; a custom delete names a link that is not a column of the child table (the FieldUserSettings of a table)
       (remove #(get-in % [:opts :delete-children!]))
       (sort-by #(name (t2/table-name (:model %))))))

(defn- lock-nested-rows!
  "Lock the existing rows of the nested models of the entities `model-type` with the primary keys `ids`, one table at a
  time, each in primary-key order. A nested model of a nested model comes after its parent table."
  [model-type ids]
  (doseq [{child :model fk :backward-fk} (nested-children model-type)
          :let  [child-ids (remote-sync.db/lock-children! child fk ids)]
          :when (seq child-ids)]
    (lock-nested-rows! (name child) child-ids)))

(defn- lock-for-load!
  "Lock the row of the local entity `model-type` `id`, then its existing child rows: the rows of the nested models that
  its serialization includes (for a dashboard: its tabs, then its dashboard cards and their series). A save of the
  entity or of a child row then waits until the load commits."
  [model-type id]
  (remote-sync.db/lock-instances! (model-key model-type) [id])
  (lock-nested-rows! model-type [id]))

(defn- compare-for-load!
  "Stop the pull when the locked local entity with the merge key `k` (`model-type` `id`, nil when a user deleted it) no
  longer has its planned hash or the hash that this pull wrote for it. The serdes load writes one entity of a
  dashboard-question or document-card cycle two times, so the second write finds the first one."
  [state k model-type id]
  (when (changed? state k model-type id)
    (stop! :load :changed k)))

(defn- record-loaded!
  "Record the hash of the entity with the merge key `k` (`model-type` `id`) as this pull wrote it."
  [{:keys [loaded]} k model-type id]
  (let [hash (content-hash model-type id)]
    (swap! loaded #(-> %
                       (assoc-in [:by-key k] hash)
                       (assoc-in [:by-row [model-type id]] hash)))))

(defn wrap-load-one
  "The `:wrap-load-one` function of a serdes load for the save-rule state `state` (see [[plan]]). Inside the load
  transaction of each entity, it locks the local entity and its child rows, compares its content hash, loads it, and
  records the hash of what it loaded."
  [state]
  (fn [ingested local load!]
    (let [k          (remote-sync.merge/entity-identity ingested)
          model-type (first (last k))
          id         (some->> local (local-id model-type))]
      (when (some? id)
        (lock-for-load! model-type id))
      (compare-for-load! state k model-type id)
      (load!)
      (record-loaded! state k model-type (or id (local-id model-type (serdes/load-find-local (serdes/path ingested))))))))

(defn loaded-hashes
  "`{[model-type id] hash}` of the entities that the load of the pull wrote, as it wrote them."
  [{:keys [loaded]}]
  (:by-row @loaded))

(defn lock-closure!
  "Lock the entity rows of the delete closure of the entities `ids-by-model` (a map of model key to a set of ids),
  parents first: each round of the closure is locked before the query of its children. Returns the closure (see
  [[remote-sync.db/delete-closure]])."
  [ids-by-model]
  (remote-sync.db/delete-closure ids-by-model {:lock? true}))

(defn- row-keys
  "The `{:model_type :model_id}` of the entities of `ids-by-model`."
  [ids-by-model]
  (for [[model-key ids] ids-by-model
        :let [model-type (:model-type (spec/spec-for-model-key model-key))]
        id   ids]
    {:model_type model-type :model_id id}))

(defn lock-ledger-rows!
  "Lock the ledger rows of the entities of the locked delete `closure` and of the entities that the load of the pull
  wrote. The save handler takes the same row lock."
  [state closure]
  (remote-sync.db/lock-rsos-of-keys! (vec (concat (row-keys (:ids-by-model closure))
                                                  (for [[model-type id] (keys (loaded-hashes state))]
                                                    {:model_type model-type :model_id id})))))

(defn- delete-loses-no-change?
  "True when the merge `decision` of the entity with the merge key `k` lets the pull delete it: the local side did not
  change it (`:keep`), only the remote changed it (`:theirs`), or both sides removed it (`:same` with no file in the
  remote tip)."
  [{:keys [theirs-paths]} k decision]
  (or (#{:theirs :keep} decision)
      (and (= :same decision) (nil? (get theirs-paths k)))))

(defn check-closure!
  "Stop the pull unless the delete of each entity of the locked delete `closure` loses no local change (see
  [[delete-loses-no-change?]]) and the entity has its planned hash (or the hash that this pull wrote for it). An entity
  that the merge did not see stops the pull: a user created it during the pull."
  [{:keys [decisions] :as state} closure]
  (let [key-of (into {}
                     (comp (filter remote-sync.merge/entity-key?)
                           (map (juxt last identity)))
                     (keys decisions))]
    (doseq [[model-key ids]   (:ids-by-model closure)
            :let  [model-type (:model-type (spec/spec-for-model-key model-key))]
            [id entity-id]    (remote-sync.db/entity-ids-by-id model-key (vec ids))
            :let  [k (key-of [model-type entity-id])]]
      (cond
        (nil? k)
        (stop! :reconcile :unknown [[model-type entity-id]])

        (not (delete-loses-no-change? state k (get decisions k)))
        (stop! :reconcile :decision k)

        (changed? state k model-type id)
        (stop! :reconcile :changed k)))))

(defn row-status
  "The ledger `:content_hash` and `:status` of a loaded entity that the pull wrote with the hash `loaded`, when its
  content hash is `now` at the reconcile: \"synced\" when the entity still has the loaded content, else \"update\" (a
  user saved it after the load)."
  [loaded now]
  {:content_hash loaded
   :status       (if (= loaded now) "synced" "update")})
