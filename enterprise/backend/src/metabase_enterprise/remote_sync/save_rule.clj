(ns metabase-enterprise.remote-sync.save-rule
  "The save rule of a merge pull. The pull plans from the content of each local entity at the time the merge read it,
  and writes an entity only while the entity still has that content. The witness is the content hash of the entity
  (the hash of its serialization, see [[metabase-enterprise.remote-sync.source/file-spec-hash]]), not a ledger row or
  a clock. When a user changed an entity that the pull must write, the pull stops: it returns a conflict on that
  entity, and the version does not move.

  The pull checks the rule three times:
  - [[pre-check!]], with no lock, before the load, also on the delete closure;
  - in the load transaction of each entity ([[wrap-load-one]]), with the entity row and its child rows locked;
  - in the reconcile transaction, with the entity rows of the delete closure ([[lock-closure!]]) and then the ledger
    rows ([[lock-ledger-rows!]]) locked: [[check-closure!]], then [[check-subtree!]].

  The three checks use one delete closure, [[delete-closure]]. After a stop, the pull gives each entity that its load
  wrote for a remote change its content of the merge base again ([[restore-keys]], [[wrap-restore-one]] and
  [[lock-added-closure!]]).

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
  - `:decisions` and `:ours-units` of the merge;
  - `:loaded`: an atom of the hashes that this pull wrote, `{:by-key {merge-key hash} :by-row {[model-type id]
    hash}}`."
  [{:keys [decisions ours-units]}]
  {:planned    (into {}
                     (keep (fn [[k unit]]
                             (when (remote-sync.merge/entity-key? k)
                               [k (source/file-spec-hash unit)])))
                     ours-units)
   :decisions  decisions
   :ours-units ours-units
   :loaded     (atom {:by-key {} :by-row {}})})

(def ^:private stop-error
  "The `:error` of the ex-data of a stop."
  :remote-sync/changed-during-pull)

(defn- stop!
  "Throw the stop of the pull on the entity with the merge key `k`. `phase` is `:pre-check`, `:load` or `:reconcile`;
  `reason` is `:changed`, `:decision` (an entity of the delete closure whose decision does not allow its delete) or
  `:unknown` (an entity of the delete closure that the merge did not see). `closure?` is true for an entity of the
  delete closure of a remote delete. `entity-name` is the name of an entity that ours does not hold, for the label of
  the conflict."
  [phase reason k & {:keys [closure?] entity-name :name}]
  (throw (ex-info (format "Content changed locally during the pull: %s" (pr-str k))
                  (cond-> {:error    stop-error
                           :phase    phase
                           :reason   reason
                           :key      k
                           :closure? (boolean closure?)}
                    entity-name (assoc :name entity-name)))))

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
  [{:keys [reason closure?]}]
  (cond
    (= :unknown reason)
    "Import blocked: content was added locally during the pull under content that the remote branch deleted. Your local change is kept."

    closure?
    "Import blocked: content changed locally during the pull, and the remote branch deleted the content that holds it. Your local change is kept."

    :else
    "Import blocked: content changed locally during the pull, and the remote branch also changed it. Your local change is kept."))

(defn stop-conflict
  "The stopped entity of a stop with the ex-data `data`, in the conflict shape of [[remote-sync.merge/three-way-merge]],
  for [[remote-sync.merge/conflict-label]]. It has the `:name` of a stopped entity that ours does not hold."
  [{:keys [ours-units]} {k :key entity-name :name}]
  (cond-> {:key k :ours (get ours-units k)}
    entity-name (assoc :name entity-name)))

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

(def ^:private collection-content-model-keys
  "The models that the ledger tracks by entity id and whose instances a Collection holds by `collection_id`."
  (into []
        (keep (fn [[model-key {:keys [identity tracking]}]]
                (when (and (= :entity-id identity)
                           (= :collection_id (get-in tracking [:field-mappings :model_collection_id])))
                  model-key)))
        spec/remote-sync-specs))

(defn- collection-contents
  "The Collections `collection-ids` and their descendants, and the instances of [[collection-content-model-keys]] in
  them that the full import also removes (the spec removal conditions), as a map of model key to a set of ids. With
  `lock?`, it locks the rows of the Collections for update before it reads the instances in them."
  [collection-ids lock?]
  (if (empty? collection-ids)
    {}
    (let [subtree (vec (sort (remote-sync.db/subtree-collection-ids-of-ids (vec collection-ids))))]
      (when lock?
        ;; The insert of an entity into a locked Collection, or its move into one, checks the foreign key to the
        ;; Collection, so it waits until the pull commits. Every app DB reads at READ COMMITTED, so the read below
        ;; sees each entity that is in the Collections now. A Collection that a user creates under a locked
        ;; Collection does not wait: it has no foreign key to its parent. [[check-subtree!]] reads the subtree again
        ;; before the delete.
        (remote-sync.db/lock-instances! :model/Collection subtree))
      (into {:model/Collection (set subtree)}
            (keep (fn [model-key]
                    (let [ids (remote-sync.db/ids-in-collections
                               model-key subtree (spec/removal-conditions (spec/spec-for-model-key model-key)))]
                      (when (seq ids)
                        [model-key ids]))))
            collection-content-model-keys))))

(defn delete-closure
  "The delete closure (see [[remote-sync.db/delete-closure]]) of the local entities `ids-by-model` (a map of model key
  to a set of ids) and of the contents of each Collection among them: the Collections under it, and the entities in
  those Collections that the full import also removes (the spec removal conditions). `:delete-set` is `ids-by-model`
  with those contents.

  With `:lock?`, it locks the rows of those Collections for update, then reads their contents, then locks the rows of
  each round of the closure, parents first. Else it takes no lock."
  ([ids-by-model]
   (delete-closure ids-by-model {}))
  ([ids-by-model {:keys [lock?] :as opts}]
   (let [delete-set (merge-with into ids-by-model (collection-contents (:model/Collection ids-by-model) lock?))]
     (assoc (remote-sync.db/delete-closure delete-set opts) :delete-set delete-set))))

(defn lock-closure!
  "Lock the entity rows of the delete closure (see [[delete-closure]]) of the entities `ids-by-model` (a map of model
  key to a set of ids), parents first. Returns the closure."
  [ids-by-model]
  (delete-closure ids-by-model {:lock? true}))

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

(defn delete-loses-no-change?
  "True when the merge `decision` of the entity with the merge key `k` lets a pull delete it with the delete closure of
  a remote delete: the local side did not change it (`:keep`), only the remote changed it (`:theirs`), or the user
  removed it, so that ours (the `:ours-units` of the merge result `merge-result`) has no file of it (`:ours`, or
  `:same` when the remote removed its file too)."
  [{:keys [ours-units] :as _merge-result} k decision]
  (or (#{:theirs :keep} decision)
      (and (#{:ours :same} decision) (not (contains? ours-units k)))))

(defn check-closure!
  "Stop the pull in the phase `phase` (`:pre-check` or `:reconcile`) unless the delete of each entity of the delete
  `closure` loses no local change. An entity that ours holds needs a decision that allows its delete (see
  [[delete-loses-no-change?]]) and its planned hash (or the hash that this pull wrote for it). An entity that ours does
  not hold needs an archived row: else a user created it (it has no merge key) or restored it during the pull."
  [{:keys [decisions ours-units] :as state} closure phase]
  (let [key-of (into {}
                     (comp (filter remote-sync.merge/entity-key?)
                           (map (juxt last identity)))
                     (keys decisions))]
    (doseq [[model-key ids]   (:ids-by-model closure)
            :let  [{:keys [model-type archived-key]} (spec/spec-for-model-key model-key)
                   entity-ids (remote-sync.db/entity-ids-by-id model-key (vec ids))
                   ;; read only for the entities that ours does not hold
                   unheld     (into [] (keep (fn [[id entity-id]]
                                               (when-not (contains? ours-units (key-of [model-type entity-id]))
                                                 id)))
                                    entity-ids)
                   archived   (if (and archived-key (seq unheld))
                                (remote-sync.db/archived-ids model-key archived-key unheld)
                                #{})]
            [id entity-id]    entity-ids
            :let  [k (key-of [model-type entity-id])]]
      (cond
        (not (contains? ours-units k))
        (when-not (contains? archived id)
          (let [entity-name (:name (first (remote-sync.db/instance-names model-key [id])))]
            (if k
              (stop! phase :changed k :closure? true :name entity-name)
              (stop! phase :unknown [[model-type entity-id]] :closure? true :name entity-name))))

        (not (delete-loses-no-change? state k (get decisions k)))
        (stop! phase :decision k :closure? true)

        (changed? state k model-type id)
        (stop! phase :changed k :closure? true)))))

(defn check-subtree!
  "Stop the pull in the phase `phase` when a Collection is under a Collection of the delete set of the locked delete
  `closure` (see [[lock-closure!]]) and not in that delete set: a user created it after the lock. The delete of its
  parent would remove it and its contents. Call it after [[check-closure!]], in the same transaction, as near to the
  delete as possible."
  [closure phase]
  (let [deleted (get-in closure [:delete-set :model/Collection] #{})]
    (when (seq deleted)
      ;; A Collection has no foreign key to its parent, so its insert does not wait for the lock on the parent. A
      ;; Collection that a user creates after this read and before the delete commits is still deleted.
      (when-let [added (seq (sort (remove deleted (remote-sync.db/subtree-collection-ids-of-ids (vec deleted)))))]
        (let [id (first added)]
          (stop! phase :unknown [["Collection" (remote-sync.db/entity-id :model/Collection id)]]
                 :closure? true
                 :name (:name (first (remote-sync.db/instance-names :model/Collection [id])))))))))

(defn pre-check!
  "Stop the pull, before any write, when an entity of ours that the pull will load or delete (the merge keys
  `load-keys` and `delete-keys`) no longer has its planned hash, or when the delete closure of the local entities
  `deleted-ids` (a map of model key to a set of ids) does not pass [[check-closure!]]. Takes no lock. An entity to
  delete that a user deleted too passes."
  [{:keys [planned] :as state} load-keys delete-keys deleted-ids]
  (let [check! (fn [delete? k]
                 (when (contains? planned k)
                   (let [model-type (first (last k))
                         local      (key->local k)]
                     (when (and (not (and delete? (nil? local)))
                                (changed? state k model-type (some->> local (local-id model-type))))
                       (stop! :pre-check :changed k)))))]
    (run! (partial check! false) load-keys)
    (run! (partial check! true) delete-keys)
    (when (seq deleted-ids)
      (check-closure! state (delete-closure deleted-ids) :pre-check))))

(defn row-status
  "The ledger `:content_hash` and `:status` of a loaded entity that the pull wrote with the hash `loaded`, when its
  content hash is `now` at the reconcile: \"synced\" when the entity still has the loaded content, else \"update\" (a
  user saved it after the load)."
  [loaded now]
  {:content_hash loaded
   :status       (if (= loaded now) "synced" "update")})

(defn restore-keys
  "The merge keys of the entities that the load of the pull wrote for a remote change (the decision `:theirs`), for
  the save-rule state `state`. After a stop, the ledger rows of these entities still record the merge base, so the
  pull gives each of them its content of the merge base again."
  [{:keys [decisions loaded]}]
  (into [] (filter #(= :theirs (get decisions %))) (keys (:by-key @loaded))))

(def ^:private restore-skip-error
  "The `:error` of the ex-data of an entity that [[wrap-restore-one]] does not write."
  :remote-sync/changed-after-load)

(defn wrap-restore-one
  "The `:wrap-load-one` function of the serdes load that gives the entities of [[restore-keys]] their content of the
  merge base again, for the save-rule state `state`. Inside the load transaction of each entity, it locks the entity
  and its child rows. It throws, and writes nothing, when the entity does not have the hash that the pull wrote for it:
  a user changed or deleted it after the load. Run the load with `:continue-on-error`, so that only that entity fails."
  [state]
  (let [restored (atom #{})]
    (fn [ingested local load!]
      (let [k          (remote-sync.merge/entity-identity ingested)
            model-type (first (last k))
            id         (some->> local (local-id model-type))]
        (when (some? id)
          (lock-for-load! model-type id))
        ;; the serdes load writes one entity of a dashboard-question or document-card cycle two times
        (when-not (or (contains? @restored k)
                      (and (some? id) (= (own-write state k) (content-hash model-type id))))
          (throw (ex-info (format "Content changed locally after the load of the pull: %s" (pr-str k))
                          {:error restore-skip-error :key k})))
        (load!)
        (swap! restored conj k)))))

(defn lock-added-closure!
  "Lock the delete closure (see [[delete-closure]]) of the local entities with the merge keys `ks`, which the load of
  the pull added: the merge base has no file of them. Returns the closure when each entity in it is one of them and
  still has the hash that the pull wrote for it, else nil: then a delete of the closure would remove a change of a
  user."
  [state ks]
  (let [ks           (set ks)
        ids-by-model (reduce (fn [acc k]
                               (let [model-type (first (last k))]
                                 (if-let [id (some->> (key->local k) (local-id model-type))]
                                   (update acc (model-key model-type) (fnil conj #{}) id)
                                   acc)))
                             {}
                             ks)]
    (when (seq ids-by-model)
      (let [closure (delete-closure ids-by-model {:lock? true})]
        (when (every? (fn [[closure-model ids]]
                        (let [model-type (:model-type (spec/spec-for-model-key closure-model))]
                          (every? (fn [[id entity-id]]
                                    (let [k [[model-type entity-id]]]
                                      (and (contains? ks k)
                                           (= (own-write state k) (content-hash model-type id)))))
                                  (remote-sync.db/entity-ids-by-id closure-model (vec ids)))))
                      (:ids-by-model closure))
          closure)))))
