(ns metabase.indexed-entities.models.model-index
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.indexed-entities.db :as indexed-entities.db]
   [metabase.indexed-entities.schema :as indexed-entities.schema]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.core :as qp]
   [metabase.search.core :as search]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.task.core :as task]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; model lifecycle ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(methodical/defmethod t2/table-name :model/ModelIndex [_model] :model_index)
(methodical/defmethod t2/table-name :model/ModelIndexValue [_model] :model_index_value)
(derive :model/ModelIndex :metabase/model)
(derive :model/ModelIndexValue :metabase/model)

(derive :model/ModelIndex :hook/created-at-timestamped?)
;; TODO disabled due to issues having an update hook causes, seemingly due to a toucan2 bug
#_(derive :model/ModelIndex :hook/search-index)

(t2/deftransforms :model/ModelIndex
  {:pk_ref    lib-be/transform-field-ref
   :value_ref lib-be/transform-field-ref})

(defn trigger-key
  "Quartz trigger key for the job that refreshes the values of model index `model-index-id`."
  [model-index-id]
  (triggers/key (format "metabase.task.IndexValues.trigger.%d" model-index-id)))

(defn remove-indexing-job
  "Remove the indexing job for `model-index`.

  This and [[trigger-key]] live here rather than with the job itself so that deleting a ModelIndex can cancel its
  trigger without reaching into [[metabase.indexed-entities.task.index-values]], which reads this namespace."
  [model-index]
  (task/delete-trigger! (trigger-key (:id model-index))))

(t2/define-before-delete :model/ModelIndex
  [model-index]
  (remove-indexing-job model-index))

(def max-indexed-values
  "Maximum number of values we will index. Actually take one more than this to test if there are more than the
  threshold."
  25000)

;;;; indexing functions

(defn valid-tuples?
  "Filter function for valid tuples for indexing: an id and a value."
  [[id v]] (and id v))

(defn- filter-pk-val [query pk-col pk-val]
  (-> query
      (lib/filter (lib/= pk-col pk-val))
      (lib/limit 1)))

(mu/defn- values-query
  "The query selecting `[pk value]` tuples from `model-index`'s model: every record when `pk` is nil, otherwise just
  the record with that primary key."
  [model-index :- ::indexed-entities.schema/model-index
   pk-val      :- [:maybe :int]]
  (let [model     (indexed-entities.db/card (:model_id model-index))
        mp        (lib-be/application-database-metadata-provider
                   (:database_id model))
        query (lib/query mp (lib.metadata/card mp (:id model)))
        columns   (lib/returned-columns query)
        fix       (fn [ref typ]
                    (-> (lib/normalize ::lib.schema.ref/ref ref)
                        (lib/update-options assoc :base-type typ)))
        ;; :type/Text and :type/Integer are ensured at creation time on the api.
        ;; Expression refs are how the _query_ refers to a custom column. But
        ;; nested queries don't, (and shouldn't) care that those are expressions.
        ;; They are just another field. pulling columns from the model normalizes
        ;; expressions into fields.
        value-col (lib.equality/find-matching-column (fix (:value_ref model-index)
                                                          :type/Text) columns)
        pk-col (lib.equality/find-matching-column (fix (:pk_ref model-index)
                                                       :type/Integer) columns)]
    (-> query
        (lib/breakout pk-col)
        (lib/breakout value-col)
        (lib/limit (inc max-indexed-values))
        ;; feels like this doesn't belong in this function, but this is where we
        ;; have access to pk-col, so doing the filter in the caller doesn't work
        (cond-> pk-val (filter-pk-val pk-col pk-val)))))

(mu/defn ^:private fetch-values
  [model-index :- ::indexed-entities.schema/model-index]
  (try
    [nil (->> (qp/process-query (values-query model-index nil))
              :data :rows (filter valid-tuples?))]
    (catch Exception e
      (log/warnf "Error fetching indexed values for model %s: %s" (:model_id model-index) (ex-message e))
      [(ex-message e) []])))

(mu/defn value-for-pk :- [:maybe :string]
  "The indexed value of the record of `model-index`'s model whose primary key is `pk`, as the current user sees it:
  the model is queried through the QP, so data permissions, sandboxing, impersonation and routing all apply. This
  deliberately never reads `model_index_value`, which is a lens-free copy shared by every user and reachable only
  through search. Nil when no record matches or the user may not run the model."
  [model-index :- ::indexed-entities.schema/model-index
   pk          :- :int]
  (try
    (let [[[_pk value]] (->> (qp/process-query (values-query model-index pk))
                             :data :rows (filter valid-tuples?))]
      (some-> value str))
    (catch Exception e
      (log/debugf "Could not read indexed value %s of model %s: %s" pk (:model_id model-index) (ex-message e))
      nil)))

(defn find-changes
  "Find additions and deletions in indexed values. `source-values` are from the db, `indexed-values` are what we
  currently have indexed.

  We have to identity values no longer in the set, values that must be added to the index, and primary keys which now
  have a different value. Updates will come out as a deletion and an addition. In the future we could make these an
  update if desired."
  [{:keys [current-index source-values]}]
  (let [current (set current-index)
        ;; into {} to ensure that each id appears only once. Later values "win".
        source  (set (into {} source-values))]
    {:additions (set/difference source current)
     :deletions (set/difference current source)}))

(mu/defn add-values!
  "Add indexed values to the model_index_value table."
  [model-index :- ::indexed-entities.schema/model-index]
  (let [[error-message values-to-index] (fetch-values model-index)
        current-index-values            (into #{}
                                              (map (juxt :model_pk :name))
                                              (indexed-entities.db/model-index-values (:id model-index)))]
    (if-not (str/blank? error-message)
      (indexed-entities.db/mark-model-index-error! (:id model-index) error-message)
      (try
        (t2/with-transaction [_conn]
          (let [{:keys [additions deletions]} (find-changes {:current-index current-index-values
                                                             :source-values values-to-index})]
            (when (seq deletions)
              (doseq [deletions-part (partition-all 10000 deletions)
                      :let [search-model-ids (map (fn [[pk]]
                                                    (str (:id model-index) ":" pk))
                                                  deletions-part)]]
                (indexed-entities.db/delete-model-index-values! (:id model-index) (->> deletions-part (map first)))
                (search/delete! :model/ModelIndexValue search-model-ids)))
            (when (seq additions)
              (doseq [additions-part (partition-all 10000 additions)]
                (indexed-entities.db/insert-model-index-values!
                 (map (fn [[id v]]
                        {:name           v
                         :model_pk       id
                         :model_index_id (:id model-index)})
                      additions-part)))))
          (indexed-entities.db/mark-model-index-indexed! (:id model-index)
                                                         (if (> (count values-to-index) max-indexed-values)
                                                           "overflow"
                                                           "indexed")))
        (run! search/update! (indexed-entities.db/model-index-values-reducible (:id model-index)))
        (catch Exception e
          (log/errorf "Error saving model-index values for model-index: %d, model: %d: %s"
                      (:id model-index) (:model_id model-index) (ex-message e))
          (indexed-entities.db/mark-model-index-error! (:id model-index) (ex-message e)))))))

;;;; creation

(defn default-schedule
  "Default sync schedule for indexed values. Defaults to randomly once a day."
  []
  (u.cron/schedule-map->cron-string (sync.schedules/randomly-once-a-day)))

(defn create
  "Create a model index"
  [{:keys [model-id pk-ref value-ref creator-id]}]
  (indexed-entities.db/insert-model-index! {:model_id   model-id
                                            ;; todo: sanitize these?
                                            :pk_ref     pk-ref
                                            :value_ref  value-ref
                                            :schedule   (default-schedule)
                                            :state      "initial"
                                            :creator_id creator-id}))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "indexed-entity"
  {:model        :model/ModelIndexValue
   :visibility   :app-user
   :attrs        {:id            [:concat_ws ":" :model_index_id :model_pk]
                  :collection-id :collection.id
                  :creator-id    false
                  ;; this seems wrong, I'd expect it to track whether the model is archived.
                  :archived      false
                  :database-id   :model.database_id
                  :created-at    false
                  :updated-at    false}
   :search-terms [:name]
   :render-terms {:collection-name :collection.name
                  :collection-type :collection.type
                  :model-id        :model.id
                  :model-name      :model.name
                  :pk-ref          :model_index.pk_ref
                  :model-index-id  :model_index.id}
   :joins        {:model_index [:model/ModelIndex [:= :model_index.id :this.model_index_id]]
                  :model       [:model/Card [:= :model.id :model_index.model_id]]
                  :collection  [:model/Collection [:= :collection.id :model.collection_id]]}})

(perms/define-collection-based-visibility! "indexed-entity" :denormalized-from :model/Card)

;; TODO resolve the toucan2 issue preventing us from using this hook
(underive :model/ModelIndexValue :hook/search-index)
