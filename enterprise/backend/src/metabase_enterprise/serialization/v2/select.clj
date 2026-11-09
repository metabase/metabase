(ns metabase-enterprise.serialization.v2.select
  "Which rows of each model an export takes: the caller's side of [[metabase.serialization.core/export]], which exports
  whatever rows it is given."
  (:require
   [metabase-enterprise.serialization.db :as serialization.db]
   [metabase.serialization.core :as serialization]
   [metabase.settings.core :as setting]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(defn- in-collections
  "The clause matching rows in `collection-set`, nil standing for the root collection."
  [collection-set]
  (let [ids (vec (remove nil? collection-set))]
    (cond-> [:or [:= 1 0]]
      (seq ids)                  (conj [:in :collection_id ids])
      (some nil? collection-set) (conj [:= :collection_id nil]))))

(defn- order-columns
  "The columns the rows of `model` export in order of: its `entity_id`, which every app DB compares byte by byte so that
  entities sharing a name get the same file name suffixes on every instance, else its primary key."
  [model]
  (let [spec (serialization/spec-of model)]
    (if (some #{:entity_id} (concat (:copy spec) (keys (:transform spec))))
      [:entity_id]
      [(first (t2/primary-keys model))])))

(defmulti where
  "The honey SQL clause restricting the rows of `model` an export of `opts` takes, beyond the `:ids` it names: by
  default the rows in its `:collection-set`, when it names one and the model lives in collections."
  {:arglists '([model opts])}
  (fn [model _opts] model))

(defmethod where :default [model {:keys [collection-set]}]
  (when (and (seq collection-set) (contains? (:transform (serialization/spec-of model)) :collection_id))
    (in-collections collection-set)))

(def ^:private not-in-exploration-document
  "The clause leaving out the Cards an exploration Summary document materializes."
  [:or [:= :document_id nil]
   [:in :document_id ^:allow-subquery {:select [:id] :from [:document] :where [:= :exploration_id nil]}]])

(defmethod where :model/Card [_ {:keys [collection-set]}]
  [:and (when (seq collection-set) (in-collections collection-set)) not-in-exploration-document])

(defmethod where :model/Document [_ {:keys [collection-set]}]
  [:and (when (seq collection-set) (in-collections collection-set)) [:= :exploration_id nil]])

(defmethod where :model/Database [_ {:keys [include-h2?]}]
  [:and
   [:= :router_database_id nil]
   [:not= :is_sample true]
   [:not= :is_stub true]
   (when-not include-h2? [:not= :engine "h2"])])

(defmethod where :model/NativeQuerySnippet [_ {:keys [collection-set ids]}]
  (when (and (seq collection-set) (empty? ids))
    (in-collections collection-set)))

(defmethod where :model/Collection [_ {:keys [collection-set ids]}]
  [:and
   (cond
     (seq collection-set) (let [ids (vec (remove nil? collection-set))]
                            (if (seq ids) [:in :id ids] [:= 1 0]))
     (nil? ids)           [:= :personal_owner_id nil])
   [:or [:= :type nil] [:not= :type "trash"]]])

(defn- of-tables
  "The clause matching rows of the Tables with `table-ids`, through `column`."
  [column table-ids]
  [:in column (if (seq table-ids) (vec table-ids) [nil])])

(defn- of-fields-of-tables
  "The clause matching rows of the Fields of the Tables with `table-ids`."
  [table-ids]
  [:in :field_id ^:allow-subquery {:select [:id] :from [:metabase_field] :where (of-tables :table_id table-ids)}])

(defmethod where :model/Table [_ {:keys [collection-set table-ids]}]
  (cond
    table-ids                (of-tables :id table-ids)
    (seq collection-set)     [:and (in-collections collection-set) [:= :is_published true]]))

(defmethod where :model/Field [_ {:keys [table-ids]}]
  (when table-ids (of-tables :table_id table-ids)))

(defmethod where :model/TableUserSettings [_ {:keys [table-ids]}]
  (when table-ids (of-tables :table_id table-ids)))

(defmethod where :model/Segment [_ {:keys [table-ids]}]
  (when table-ids (of-tables :table_id table-ids)))

(defmethod where :model/Measure [_ {:keys [table-ids]}]
  (when table-ids (of-tables :table_id table-ids)))

(defmethod where :model/FieldUserSettings [_ {:keys [table-ids]}]
  (when table-ids (of-fields-of-tables table-ids)))

(defmethod where :model/Dimension [_ {:keys [table-ids]}]
  (when table-ids (of-fields-of-tables table-ids)))

(defn- archived-column?
  "Whether the rows of `model` export an `archived` column."
  [model]
  (boolean (some #{:archived} (:copy (serialization/spec-of model)))))

(defn- where-clause
  "The honey SQL clause of the rows of `model` an export of `opts` takes (see [[select-rows]])."
  [model {:keys [ids skip-archived] :as opts}]
  [:and
   (when ids [:in (first (t2/primary-keys model)) (if (seq ids) (vec ids) [nil])])
   (when (and skip-archived (archived-column? model)) [:not :archived])
   (where model opts)])

(defn select-rows
  "A reducible of the realized rows of `model` an export of `opts` takes, in stable export order: the ones with the
  primary keys `:ids` when given, the ones [[where]] picks for the `:collection-set` or `:table-ids` given, and
  unarchived ones with `:skip-archived`."
  [model opts]
  (if (= model :model/Setting)
    (setting/exportable-settings)
    (eduction (map t2.realize/realize)
              (serialization.db/rows-for-export (into [model] (serialization/columns model)) (where-clause model opts) (order-columns model)))))

(defn select-ids
  "The primary keys of the rows of `model` an export of `opts` takes (see [[select-rows]])."
  [model opts]
  (serialization.db/ids-for-export model (first (t2/primary-keys model)) (where-clause model opts)))
