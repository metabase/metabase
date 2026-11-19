(ns metabase.serialization.protocol.app-db
  "The [[metabase.serialization.protocol/Store]] of this instance's application database, querying a batch at a time."
  (:require
   [diehard.core :as dh]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.transient-error :as transient-error]
   [metabase.serialization.db :as serialization.db]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.protocol.util :as protocol.util]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.serialization.util :as serialization.util]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- select-by-column-refs
  "The map from each of the set `refs` to the oldest row of `model` with that ref, a model whose ref is the value of one
  column, with `query`, a fn of a batch of refs and the columns to select, run per batch."
  [model refs columns query]
  (let [pk   (serialization.spec/primary-key model)
        cols (protocol.util/select-columns columns (cons pk (protocol.util/ref-columns model)))
        rows (protocol.util/in-batches (filterv some? refs) #(query % cols))]
    (protocol.util/rows-by-ref model refs #(protocol.util/row-ref model %) rows)))

(defn- select-tables-by-refs
  "The map from each of the set `refs`, `[db-name schema table-name]`, to the oldest Table with that ref."
  [refs columns]
  (let [dbs      (select-by-column-refs :model/Database (into #{} (map first) refs) [:id :name]
                                        serialization.db/databases-by-names)
        db-names (into {} (map (fn [[db-name row]] [(:id row) db-name])) dbs)
        cols     (protocol.util/select-columns columns [:id :db_id :schema :name])
        rows     (when (seq db-names)
                   (protocol.util/in-batches (into #{} (map peek) refs)
                                             #(serialization.db/tables-by-names (keys db-names) % cols)))
        ref-of   (fn [{:keys [db_id schema name]}] [(db-names db_id) schema name])]
    (protocol.util/rows-by-ref :model/Table refs ref-of rows)))

(defn- select-fields-by-refs
  "The map from each of the set `refs`, `[db-name schema table-name & field-names]`, to the oldest Field with that ref,
  with one query per nesting level and batch."
  [refs columns]
  (let [cols       (protocol.util/select-columns columns [:id :table_id :parent_id :name])
        tables     (select-tables-by-refs (into #{} (map #(subvec % 0 3)) refs) [:id])
        table-refs (into {} (map (fn [[table-ref row]] [(:id row) table-ref])) tables)]
    (loop [depth 4 parent-refs table-refs found {}]
      (let [prefixes (into #{} (comp (filter #(>= (count %) depth)) (map #(subvec % 0 depth))) refs)]
        (if (or (empty? prefixes) (empty? parent-refs))
          (select-keys found refs)
          (let [top-level? (= depth 4)
                query      (if top-level?
                             serialization.db/top-level-fields-by-names
                             serialization.db/nested-fields-by-names)
                rows       (protocol.util/in-batches (into #{} (map peek) prefixes)
                                                     #(query (keys parent-refs) % cols))
                ref-of     (fn [row]
                             (some-> (get parent-refs (get row (if top-level? :table_id :parent_id)))
                                     (conj (:name row))))
                level      (protocol.util/rows-by-ref :model/Field prefixes ref-of rows)]
            (recur (inc depth)
                   (into {} (map (fn [[field-ref row]] [(:id row) field-ref])) level)
                   (merge found level))))))))

(defn- rows-by-entity-ids
  "The map from each of the set `eids` to the oldest row of `model` in the app DB with that entity id, with only
  `columns` unless nil, throwing when `model` is identified otherwise."
  [model eids columns]
  (when-not (= [:entity_id] (serialization.spec/identity-columns model))
    (throw (ex-info (format "No query for the refs of %s" model) {:model model})))
  (select-by-column-refs model eids columns #(serialization.db/rows-by-entity-ids model %1 %2)))

(defn rows-by-refs
  "The map from each of the set `refs` to the oldest row of `model` in the app DB with that ref, with only `columns`
  unless nil, by the `:rows-by-refs` of the spec of `model`. By default the refs are entity ids, and emails for Users."
  [model refs columns]
  (if-let [f (:rows-by-refs (serialization.spec/spec model))]
    (f refs columns)
    (if (= :model/User model)
      (select-by-column-refs model refs columns serialization.db/users-by-emails)
      (rows-by-entity-ids model refs columns))))

(defn database-rows-by-refs
  "The `:rows-by-refs` of Databases, whose refs are their names."
  [refs columns]
  (select-by-column-refs :model/Database refs columns serialization.db/databases-by-names))

(defn table-rows-by-refs
  "The `:rows-by-refs` of Tables, whose refs are `[db-name schema table-name]`."
  [refs columns]
  (select-tables-by-refs refs columns))

(defn field-rows-by-refs
  "The `:rows-by-refs` of Fields, whose refs are `[db-name schema table-name & field-names]`."
  [refs columns]
  (select-fields-by-refs refs columns))

(defn setting-rows-by-refs
  "The `:rows-by-refs` of Settings, whose refs are their keys."
  [refs columns]
  (select-by-column-refs :model/Setting refs columns serialization.db/settings-by-keys))

(defn channel-rows-by-refs
  "The `:rows-by-refs` of Channels, whose refs are their names."
  [refs columns]
  (select-by-column-refs :model/Channel refs columns serialization.db/channels-by-names))

(defn- rows-by-ref-ids
  "The map from each of `refs` to the oldest row of `model` whose `column` holds the id that `ids`, a map from ref to
  id, holds for it, with `query` a fn of a batch of ids and the columns to select."
  [model refs ids column columns query]
  (let [pk       (serialization.spec/primary-key model)
        cols     (protocol.util/select-columns columns [pk column])
        id->ref  (into {} (map (fn [[ref id]] [id ref])) ids)
        rows     (protocol.util/in-batches (set (vals ids)) #(query % cols))]
    (protocol.util/rows-by-ref model (set refs) #(get id->ref (get % column)) rows)))

(defn field-user-settings-rows-by-refs
  "The `:rows-by-refs` of FieldUserSettings, whose refs are the refs of their Fields."
  [refs columns]
  (let [field-ids (update-vals (select-fields-by-refs refs [:id]) :id)]
    (rows-by-ref-ids :model/FieldUserSettings refs field-ids :field_id columns
                     serialization.db/field-user-settings-by-field-ids)))

(defn dimension-rows-by-refs
  "The `:rows-by-refs` of Dimensions, whose refs are the refs of their Fields."
  [refs columns]
  (let [field-ids (update-vals (select-fields-by-refs refs [:id]) :id)]
    (rows-by-ref-ids :model/Dimension refs field-ids :field_id columns serialization.db/dimensions-by-field-ids)))

(defn table-user-settings-rows-by-refs
  "The `:rows-by-refs` of TableUserSettings, whose refs are the refs of their Tables."
  [refs columns]
  (let [table-ids (update-vals (select-tables-by-refs refs [:id]) :id)]
    (rows-by-ref-ids :model/TableUserSettings refs table-ids :table_id columns
                     serialization.db/table-user-settings-by-table-ids)))

(defn field-values-rows-by-refs
  "The `:rows-by-refs` of FieldValues, whose refs are `[field-ref type]`."
  [refs columns]
  (let [model     :model/FieldValues
        field-ids (update-vals (select-fields-by-refs (into #{} (map first) refs) [:id]) :id)
        pk        (serialization.spec/primary-key model)
        cols      (protocol.util/select-columns columns [pk :field_id :type])
        id->ref   (into {} (map (fn [[ref id]] [id ref])) field-ids)
        rows      (protocol.util/in-batches (set (vals field-ids))
                                            #(serialization.db/field-values-by-field-ids % cols))]
    (protocol.util/rows-by-ref model refs #(vector (id->ref (:field_id %)) (some-> (:type %) name)) rows)))

(def ^:private osi-content-models
  "The model of the content each `:entity_type` of an OsiAiContext other than a Table names by entity id."
  {"card" :model/Card "measure" :model/Measure "segment" :model/Segment})

(defn osi-ai-context-rows-by-refs
  "The `:rows-by-refs` of OsiAiContexts, whose refs are `[entity-type local-ref]`."
  [refs columns]
  (let [model :model/OsiAiContext
        pk    (serialization.spec/primary-key model)
        cols  (protocol.util/select-columns columns [pk :entity_type :entity_local_id])]
    (into {}
          (mapcat (fn [[entity-type type-refs]]
                    (let [local-refs (into #{} (map second) type-refs)
                          ids        (if (= "table" entity-type)
                                       (update-vals (select-tables-by-refs local-refs [:id]) :id)
                                       (when-let [content-model (osi-content-models entity-type)]
                                         (update-vals (rows-by-refs content-model local-refs [:id :entity_id]) :id)))
                          id->ref    (into {} (map (fn [[ref id]] [id ref])) ids)
                          rows       (when (seq id->ref)
                                       (protocol.util/in-batches
                                        (set (keys id->ref))
                                        #(serialization.db/osi-ai-contexts-by-local-ids entity-type % cols)))]
                      (protocol.util/rows-by-ref model (set type-refs)
                                                 #(vector entity-type (id->ref (:entity_local_id %))) rows))))
          (group-by first refs))))

(defn rows-by-parent-pks
  "The rows of `model`, with only `columns` unless nil, whose parent has its primary key in the set `parent-pks`, a
  batch at a time, by the `:rows-by-parent-pks` of the spec of `model`, by default those whose `:parent` `:key` column
  holds one of them."
  [model parent-pks columns]
  (let [spec       (serialization.spec/spec model)
        parent-key (-> spec :parent :key)
        query      (or (:rows-by-parent-pks spec)
                       (when parent-key
                         #(serialization.db/rows-by-column-values model parent-key %1 %2))
                       (throw (ex-info (format "No query for the children of %s" model) {:model model})))
        cols       (protocol.util/select-columns columns [(serialization.spec/primary-key model) parent-key])]
    (protocol.util/in-batches parent-pks #(query % cols))))

(defn- with-retries
  "What `f` returns, retried up to `retries` times with backoff when it throws a transient DB error, like a deadlock."
  [retries f]
  (let [db-type (mdb/db-type)]
    (dh/with-retry {:max-retries retries
                    :backoff-ms  [200 1600 2.0]
                    :retry-if    (fn [_result e] (transient-error/transient-error? db-type e))
                    :on-retry    (fn [_result e] (log/warnf "Transient DB error, retrying: %s" (ex-message e)))}
      (f))))

(def store
  "The store of the application database."
  (reify protocol/Store
    (select-by-pks [_ model pks columns]
      (let [cols (protocol.util/select-columns columns [(serialization.spec/primary-key model)])]
        (protocol.util/in-batches pks #(serialization.db/rows-by-pks model % cols))))
    (select-by-refs [_ model refs columns]
      (rows-by-refs model refs columns))
    (select-by-parent-pks [_ model parent-pks columns]
      (rows-by-parent-pks model parent-pks columns))
    (insert-rows! [_ model rows]
      (into []
            (mapcat #(serialization.db/insert-rows! model (vec %)))
            (partition-all serialization.util/batch-size rows)))
    (update-row! [_ model pk changes]
      (serialization.db/update-row! model (serialization.spec/primary-key model) pk changes))
    (delete-rows! [_ model pks]
      (let [pk (serialization.spec/primary-key model)]
        (run! #(serialization.db/delete-rows! model pk (vec %)) (partition-all serialization.util/batch-size pks))))
    (transact [_ {:keys [isolation retries]} f]
      (let [run (fn []
                  (if (= isolation :repeatable-read)
                    (serialization.db/do-in-repeatable-read-transaction f)
                    (serialization.db/do-in-transaction f)))]
        (if retries
          (with-retries retries run)
          (run))))))
