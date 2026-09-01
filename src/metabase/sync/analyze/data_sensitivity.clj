(ns metabase.sync.analyze.data-sensitivity
  "Analyze sub-step that labels Fields with a `data_sensitivity` category from
  [[metabase.analyze.core/infer-data-sensitivity]], writing `:PUBLIC` when no rule matches so each field is scanned
  once. Selects fields whose `data_sensitivity` is `NULL` (or `PUBLIC` too under `force?`) across every active table
  in the database, hidden and cruft tables included. Inert unless [[metabase.sync.settings/data-sensitivity-scan-enabled]]
  is true, except through [[scan-data-sensitivity!]]. User-set labels are protected by the `FieldUserSettings`
  overlay applied on every Field update."
  (:require
   [metabase.analyze.core :as analyze]
   [metabase.sync.interface :as i]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private Stats
  [:map
   [:fields-scanned :int]
   [:fields-labeled :int]
   [:fields-failed  :int]])

(def ^:private zero-stats
  {:fields-scanned 0 :fields-labeled 0 :fields-failed 0})

(def ^:private ScanOptions
  [:map
   [:force?          {:optional true} [:maybe :boolean]]
   [:ignore-setting? {:optional true} [:maybe :boolean]]])

(defn- selection-clause [force?]
  (if force?
    [:or [:= :data_sensitivity nil] [:= :data_sensitivity "PUBLIC"]]
    [:= :data_sensitivity nil]))

(defn- skip? [ignore-setting?]
  (and (not ignore-setting?)
       (not (sync.settings/data-sensitivity-scan-enabled))))

(mu/defn- fields-to-scan :- [:sequential i/FieldInstance]
  [table :- i/TableInstance
   force?]
  (t2/select :model/Field
             {:where    [:and
                         [:= :table_id (u/the-id table)]
                         [:= :active true]
                         [:not= :visibility_type "retired"]
                         (selection-clause force?)]
              :order-by [[:id :asc]]}))

(mu/defn- classify-and-save!
  "Returns the inferred category, nil when no rule matched (in which case `:PUBLIC` was written), or the Exception."
  [field :- i/FieldInstance
   table :- i/TableInstance]
  (sync-util/with-error-handling (format "Error classifying data sensitivity for %s" (sync-util/name-for-logging field))
    (let [category (analyze/infer-data-sensitivity field {:name (:name table) :entity_type (:entity_type table)})]
      (t2/update! :model/Field (u/the-id field) {:data_sensitivity (or category :PUBLIC)})
      category)))

(mu/defn scan-table! :- Stats
  "Label every unscanned Field in `table`. `fields-scanned` counts every selected field, `fields-labeled` those that
  matched a category, `fields-failed` those whose classification threw; the remainder were written `:PUBLIC`."
  [table :- i/TableInstance
   & {:keys [force? ignore-setting?]} :- [:maybe ScanOptions]]
  (if (skip? ignore-setting?)
    zero-stats
    (let [stats (reduce (fn [stats field]
                          (let [result (classify-and-save! field table)]
                            (log/debugf "Data sensitivity for %s: %s" (sync-util/name-for-logging field)
                                        (if (instance? Exception result) "failed" (or result :PUBLIC)))
                            (cond-> (update stats :fields-scanned inc)
                              (instance? Exception result) (update :fields-failed inc)
                              (keyword? result)            (update :fields-labeled inc))))
                        zero-stats
                        (fields-to-scan table force?))]
      (when (pos? (:fields-scanned stats))
        (log/infof "Data sensitivity scanned %d fields in %s: %d labeled, %d failed"
                   (:fields-scanned stats) (sync-util/name-for-logging table)
                   (:fields-labeled stats) (:fields-failed stats)))
      stats)))

(mu/defn- table-ids-with-unscanned-fields :- [:maybe [:set pos-int?]]
  [database :- i/DatabaseInstance
   force?]
  (t2/select-fn-set :table_id :model/Field
                    {:select   [[:metabase_field.table_id :table_id]]
                     :from     [:metabase_field]
                     :join     [[:metabase_table] [:= :metabase_field.table_id :metabase_table.id]]
                     :where    [:and
                                [:= :metabase_table.db_id (u/the-id database)]
                                [:= :metabase_table.active true]
                                [:= :metabase_field.active true]
                                [:not= :metabase_field.visibility_type "retired"]
                                (selection-clause force?)]
                     :group-by [:metabase_field.table_id]}))

(mu/defn scan-fields-for-db! :- Stats
  "Label every unscanned Field in every active table of `database`. `log-fn` is accepted for parity with the other
  analyze steps and not called: the step reports per table through the log, not the progress bar."
  [database :- i/DatabaseInstance
   _log-fn
   & {:keys [force? ignore-setting?]} :- [:maybe ScanOptions]]
  (if (skip? ignore-setting?)
    zero-stats
    (let [table-ids (table-ids-with-unscanned-fields database force?)]
      (if (empty? table-ids)
        zero-stats
        (transduce (comp (map t2.realize/realize)
                         (map #(scan-table! % :force? force? :ignore-setting? true)))
                   (partial merge-with +)
                   zero-stats
                   (t2/reducible-select :model/Table
                                        :id [:in table-ids]
                                        {:order-by [[:schema :asc] [:name :asc]]}))))))

(mu/defn scan-data-sensitivity! :- Stats
  "REPL entry point: scan a Database or a single Table regardless of the `data-sensitivity-scan-enabled` setting.
  With `:force? true` fields already labeled `:PUBLIC` are rescanned too; fields carrying a category never are.
  User-set labels survive either way because the `FieldUserSettings` overlay is applied on every Field update."
  [database-or-table :- [:or i/DatabaseInstance i/TableInstance]
   & {:keys [force?]} :- [:maybe [:map [:force? {:optional true} [:maybe :boolean]]]]]
  (case (t2/model database-or-table)
    :model/Table    (scan-table! database-or-table :force? force? :ignore-setting? true)
    :model/Database (scan-fields-for-db! database-or-table (constantly nil) :force? force? :ignore-setting? true)))
