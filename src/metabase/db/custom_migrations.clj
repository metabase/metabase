(ns metabase.db.custom-migrations
  "Custom liquibase migrations, so we can manipulate data with Clojure.
   We prefer to use SQL migrations in most cases because they are likely to be more performant and stable.
   However, there are some cases where we need to do something that is not possible or very difficult with SQL, such as JSON manipulation.

   Migrations demand a higher level of reliability than normal code, so be careful about what these migrations depend on.
   If the code the migration depends on changes, the migration could corrupt app dbs and be very difficult to recover from.

   If you need to use code from elsewhere, consider copying it into this namespace to minimize risk of the code changing behaviour."
  (:require
   [cheshire.core :as json]
   [clojure.core.match :refer [match]]
   [clojure.set :as set]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [medley.core :as m]
   [metabase.db.connection :as mdb.connection]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.execute :as t2.execute])
  (:import
   (liquibase.change.custom CustomTaskChange CustomTaskRollback)
   (liquibase.exception ValidationErrors)))

(set! *warn-on-reflection* true)

(defmacro define-reversible-migration
  "Define a reversible custom migration. Both the forward and reverse migrations are defined using the same structure,
  similar to the bodies of multi-arity Clojure functions.

  Example:

  ```clj
  (define-reversible-migration ExampleMigrationName
   (migration-body)
   (reverse-migration-body)))
  ```"
  [name migration-body reverse-migration-body]
  `(defrecord ~name []
     CustomTaskChange
     (execute [_# database#]
       ~migration-body)
     (getConfirmationMessage [_#]
       (str "Custom migration: " ~name))
     (setUp [_#])
     (validate [_# _database#]
       (ValidationErrors.))
     (setFileOpener [_# _resourceAccessor#])

     CustomTaskRollback
     (rollback [_# database#]
       ~reverse-migration-body)))

(defn no-op
  "No-op logging rollback function"
  [n]
  (log/info "No rollback for: " n))

(defmacro define-migration
  "Define a custom migration without a reverse migration."
  [name & migration-body]
  `(define-reversible-migration ~name (do ~@migration-body) (no-op ~(str name))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  MIGRATIONS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private base-path-regex
  #"^(/db/\d+(?:/schema/(?:(?:[^\\/])|(?:\\/)|(?:\\\\))*(?:/table/\d+?)?)?/)((native/)|(query/(segmented/)?))?$")

(defn- ->v2-paths
  "Converts v1 data permission paths into v2 data and query permissions paths. This is similar to `->v2-path` in
   metabase.models.permissions but somewhat simplified for the migration use case."
  [v1-path]
  (if-let [base-path (second (re-find base-path-regex v1-path))]
    ;; For (almost) all v1 data paths, we simply extract the base path (e.g. "/db/1/schema/PUBLIC/table/1/")
    ;; and construct new v2 paths by adding prefixes to the base path.
    [(str "/data" base-path) (str "/query" base-path)]

    ;; For the specific v1 path that grants full data access but no native query access, we add a
    ;; /schema/ suffix to the corresponding v2 query permission path.
    (when-let [db-id (second (re-find #"^/db/(\d+)/schema/$" v1-path))]
      [(str "/data/db/" db-id "/") (str "/query/db/" db-id "/schema/")])))

(define-reversible-migration SplitDataPermissions
  (let [current-perms-set (t2/select-fn-set
                           (juxt :object :group_id)
                           :metabase.models.permissions/Permissions
                           {:where [:or
                                    [:like :object (h2x/literal "/db/%")]
                                    [:like :object (h2x/literal "/data/db/%")]
                                    [:like :object (h2x/literal "/query/db/%")]]})
        v2-perms-set      (into #{} (mapcat
                                     (fn [[v1-path group-id]]
                                       (for [v2-path (->v2-paths v1-path)]
                                         [v2-path group-id]))
                                     current-perms-set))
        new-v2-perms      (into [] (set/difference v2-perms-set current-perms-set))]
    (when (seq new-v2-perms)
      (t2.execute/query-one {:insert-into :permissions
                             :columns     [:object :group_id]
                             :values      new-v2-perms})))
  (t2.execute/query-one {:delete-from :permissions
                         :where [:or [:like :object (h2x/literal "/data/db/%")]
                                 [:like :object (h2x/literal "/query/db/%")]]}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Quartz Scheduler Helpers                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; This section of code's purpose is to avoid the migration depending on the [[metabase.task]] namespace,
;; which is likely to change, and might not have as tight test coverage as needed for custom migrations.

(defn- load-class ^Class [^String class-name]
  (Class/forName class-name true (classloader/the-classloader)))

(defrecord ^:private ClassLoadHelper []
  org.quartz.spi.ClassLoadHelper
  (initialize [_])
  (getClassLoader [_]
    (classloader/the-classloader))
  (loadClass [_ class-name]
    (load-class class-name))
  (loadClass [_ class-name _]
    (load-class class-name)))

(when-not *compile-files*
  (System/setProperty "org.quartz.scheduler.classLoadHelper.class" (.getName ClassLoadHelper)))

(defn- set-jdbc-backend-properties!
  "Set the appropriate system properties needed so Quartz can connect to the JDBC backend. (Since we don't know our DB
  connection properties ahead of time, we'll need to set these at runtime rather than Setting them in the
  `quartz.properties` file.)"
  []
  (when (= (mdb.connection/db-type) :postgres)
    (System/setProperty "org.quartz.jobStore.driverDelegateClass" "org.quartz.impl.jdbcjobstore.PostgreSQLDelegate")))

;;; +----------------------------------------------------------------------------------------------------------------+

(define-migration DeleteAbandonmentEmailTask
  (classloader/the-classloader)
  (set-jdbc-backend-properties!)
  (let [scheduler (qs/initialize)]
    (qs/start scheduler)
    (qs/delete-trigger scheduler (triggers/key "metabase.task.abandonment-emails.trigger"))
    (qs/delete-job scheduler (jobs/key "metabase.task.abandonment-emails.job"))
    (qs/shutdown scheduler)))

(define-migration FillJSONUnfoldingDefault
  (let [db-ids-to-not-update (->> (t2/query {:select [:id :details]
                                             :from   [:metabase_database]})
                                  ;; if json-unfolding is nil it's treated as if it were true
                                  ;; so we need to remove databases that have it set to false
                                  (filter (fn [{:keys [details]}]
                                            (when details
                                              (false? (:json-unfolding (json/parse-string details true))))))
                                  (map :id))
        field-ids-to-update  (->> (t2/query {:select [:f.id]
                                             :from   [[:metabase_field :f]]
                                             :join   [[:metabase_table :t] [:= :t.id :f.table_id]]
                                             :where  (if (seq db-ids-to-not-update)
                                                       [:and
                                                        [:not-in :t.db_id db-ids-to-not-update]
                                                        [:= :f.base_type "type/JSON"]]
                                                       [:= :f.base_type "type/JSON"])})
                                  (map :id))]
    (when (seq field-ids-to-update)
      (t2/query-one {:update :metabase_field
                     :set    {:json_unfolding true}
                     :where  [:in :metabase_field.id field-ids-to-update]}))))

(defn- update-legacy-field-refs-in-viz-settings [viz-settings]
  (let [old-to-new (fn [old]
                     (match old
                       ["ref" ref] ["ref" (match ref
                                            ["field-id" x] ["field" x nil]
                                            ["field-literal" x y] ["field" x {"base-type" y}]
                                            ["fk->" x y] (let [x (match x
                                                                   [_x0 x1] x1
                                                                   x x)
                                                               y (match y
                                                                   [_y0 y1] y1
                                                                   y y)]
                                                           ["field" y {:source-field x}])
                                            ref ref)]
                       k k))]
    (-> viz-settings
        (json/parse-string)
        (m/update-existing "column_settings" update-keys
                           (fn [k]
                             (-> k
                                 (json/parse-string)
                                 (vec)
                                 (old-to-new)
                                 (json/generate-string))))
        (json/generate-string))))

(define-migration MigrateLegacyColumnSettingsFieldRefs
  (let [update! (fn [{:keys [id visualization_settings]}]
                  (t2/query-one {:update :report_card
                                 :set    {:visualization_settings visualization_settings}
                                 :where  [:= :id id]}))]
    (run! update! (eduction (keep (fn [{:keys [id visualization_settings]}]
                                    (let [updated (update-legacy-field-refs-in-viz-settings visualization_settings)]
                                      (when (not= visualization_settings updated)
                                        {:id                     id
                                         :visualization_settings updated}))))
                            (t2/reducible-query {:select [:id :visualization_settings]
                                                 :from   [:report_card]})))))

(defn- update-legacy-field-refs-in-result-metadata [result-metadata]
  (let [old-to-new (fn [ref]
                     (match ref
                       ["field-id" x] ["field" x nil]
                       ["field-literal" x y] ["field" x {"base-type" y}]
                       ["fk->" x y] (let [x (match x
                                              [_x0 x1] x1
                                              x x)
                                          y (match y
                                              [_y0 y1] y1
                                              y y)]
                                      ["field" y {:source-field x}])
                       _ ref))]
    (->> result-metadata
         (json/parse-string)
         (map #(m/update-existing % "field_ref" old-to-new))
         (json/generate-string))))

(define-migration MigrateLegacyResultMetadataFieldRefs
  (let [update! (fn [{:keys [id result_metadata]}]
                  (t2/query-one {:update :report_card
                                 :set    {:result_metadata result_metadata}
                                 :where  [:= :id id]}))]
    (run! update! (eduction (keep (fn [{:keys [id result_metadata]}]
                                    (let [updated (update-legacy-field-refs-in-result-metadata result_metadata)]
                                      (when (not= result_metadata updated)
                                        {:id                     id
                                         :result_metadata updated}))))
                            (t2/reducible-query {:select [:id :result_metadata]
                                                 :from   [:report_card]
                                                 :where  [:and
                                                          [:<> :result_metadata nil]
                                                          [:<> :result_metadata "[]"]]})))))

(defn- remove-opts
  "Removes options from the `field_ref` options map. If the resulting map is empty, it's replaced it with nil."
  [field_ref & opts-to-remove]
  (match field_ref
    ["field" id opts] ["field" id (not-empty (apply dissoc opts opts-to-remove))]
    _ field_ref))

(defn- remove-join-alias-from-visualization-field-refs [visualization_settings]
  (-> visualization_settings
      json/parse-string
      (update "column_settings"
              (fn [column_settings]
                (into {}
                      (map (fn [[k v]]
                             (match (vec (json/parse-string k))
                               ["ref" ["field" id opts]]
                               [(json/generate-string ["ref" (remove-opts ["field" id opts] "join-alias")]) v]
                               _ [k v]))
                           column_settings))))
      json/generate-string))

(defn- add-join-alias-to-visualization-field-refs [{:keys [visualization_settings result_metadata]}]
  (let [result_metadata        (json/parse-string result_metadata)
        visualization_settings (json/parse-string visualization_settings)
        column-key->metadata   (group-by #(-> (get % "field_ref")
                                              ;; like the FE's `getColumnKey` function, remove "join-alias",
                                              ;; "temporal-unit" and "binning" options from the field_ref
                                              (remove-opts "join-alias" "temporal-unit" "binning"))
                                         result_metadata)]
    (json/generate-string
     (update visualization_settings "column_settings"
             (fn [column_settings]
               (into {}
                     (mapcat (fn [[k v]]
                               (match (vec (json/parse-string k))
                                 ["ref" ["field" id opts]]
                                 (for [column-metadata (column-key->metadata ["field" id opts])
                                       ;; remove "temporal-unit" and "binning" options from the matching field refs,
                                       ;; but not "join-alias" as before.
                                       :let [field-ref (-> (get column-metadata "field_ref")
                                                           (remove-opts "temporal-unit" "binning"))]]
                                   [(json/generate-string ["ref" field-ref]) v])
                                 _ [[k v]]))
                             column_settings)))))))

(define-reversible-migration AddJoinAliasToVisualizationSettingsFieldRefs
  (let [update! (fn [{:keys [id visualization_settings]}]
                  (t2/query-one {:update :report_card
                                 :set    {:visualization_settings visualization_settings}
                                 :where  [:= :id id]}))]
    (run! update! (eduction (keep (fn [{:keys [id visualization_settings] :as card}]
                                    (let [updated (add-join-alias-to-visualization-field-refs card)]
                                      (when (not= visualization_settings updated)
                                        {:id                     id
                                         :visualization_settings updated}))))
                            (t2/reducible-query {:select [:id :visualization_settings :result_metadata]
                                                 :from   [:report_card]
                                                 :where  [:and
                                                          [:like :visualization_settings "%column_settings%"]
                                                          [:like :result_metadata "%join-alias%"]]}))))
  (let [update! (fn [{:keys [id visualization_settings]}]
                  (t2/query-one {:update :report_card
                                 :set    {:visualization_settings visualization_settings}
                                 :where  [:= :id id]}))]
    (run! update! (eduction (keep (fn [{:keys [id visualization_settings]}]
                                    (let [updated (remove-join-alias-from-visualization-field-refs visualization_settings)]
                                      (when (not= visualization_settings updated)
                                        {:id                     id
                                         :visualization_settings updated}))))
                            (t2/reducible-query {:select [:id :visualization_settings]
                                                 :from   [:report_card]
                                                 :where  [:and
                                                          [:like :visualization_settings "%column_settings%"]
                                                          [:like :visualization_settings "%join-alias%"]]})))))

(defn- update-card-row-on-downgrade-for-dashboard-tab
  [dashboard-id]
  (let [ordered-tab+cards (->> (t2/query {:select    [:report_dashboardcard.* [:dashboard_tab.position :tab_position]]
                                          :from      [:report_dashboardcard]
                                          :where     [:= :report_dashboardcard.dashboard_id dashboard-id]
                                          :left-join [:dashboard_tab [:= :dashboard_tab.id :report_dashboardcard.dashboard_tab_id]]})
                               (group-by :tab_position)
                               ;; sort by tab position
                               (sort-by first))
        cards->max-height (fn [cards] (apply max (map #(+ (:row %) (:size_y %)) cards)))]
    (loop [position+cards ordered-tab+cards
           next-tab-row   0]
      (when-let [[tab-pos cards] (first position+cards)]
        (if (zero? tab-pos)
          (recur (rest position+cards) (long (cards->max-height cards)))
          (do
            (t2/query {:update :report_dashboardcard
                       :set    {:row [:+ :row next-tab-row]}
                       :where  [:= :dashboard_tab_id (:dashboard_tab_id (first cards))]})
            (recur (rest position+cards) (long (+ next-tab-row (cards->max-height cards))))))))))

(define-reversible-migration DowngradeDashboardTab
  (log/info "No forward migration for DowngradeDashboardTab")
  (run! update-card-row-on-downgrade-for-dashboard-tab
        (eduction (map :dashboard_id) (t2/reducible-query {:select-distinct [:dashboard_id]
                                                           :from            [:dashboard_tab]}))))
