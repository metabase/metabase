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
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.custom-migrations.metrics-v2 :as metrics-v2]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.date-2 :as u.date]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.execute :as t2.execute])
  (:import
   (java.util Locale)
   (javax.sql DataSource)
   (liquibase Scope)
   (liquibase.change Change)
   (liquibase.change.custom CustomTaskChange CustomTaskRollback)
   (liquibase.exception ValidationErrors)
   (liquibase.util BooleanUtil)
   (org.mindrot.jbcrypt BCrypt)))

(set! *warn-on-reflection* true)

(defn should-execute-change?
  "Check if the change is supposed to be executed.
  This is a work around. The rollback method is called twice: once
  for generating MDC data and once for actually making the change.
  The same problem has been fixed for forward changes in Liquibase
  but for rollback it has not."
  []
  (BooleanUtil/isTrue (.get (Scope/getCurrentScope) Change/SHOULD_EXECUTE true)))

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
       (t2/with-transaction [_conn#]
         ~migration-body))
     (getConfirmationMessage [_#]
       (str "Custom migration: " ~name))
     (setUp [_#])
     (validate [_# _database#]
       (ValidationErrors.))
     (setFileOpener [_# _resourceAccessor#])

     CustomTaskRollback
     (rollback [_# database#]
       (t2/with-transaction [_conn#]
         (when (should-execute-change?)
           ~reverse-migration-body)))))

(defn no-op
  "No-op logging rollback function"
  [n]
  (log/info "No rollback for: " n))

(defmacro define-migration
  "Define a custom migration without a reverse migration."
  [name & migration-body]
  `(define-reversible-migration ~name (do ~@migration-body) (no-op ~(str name))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    HELPERS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; metabase.util/upper-case-en
(defn- upper-case-en
  ^String [s]
  (when s
    (.toUpperCase (str s) Locale/US)))

;; metabase.util/lower-case-en
(defn- lower-case-en
  ^String [s]
  (when s
    (.toLowerCase (str s) Locale/US)))

(defn json-in
  "Default in function for columns given a Toucan type `:json`. Serializes object as JSON."
  [obj]
  (if (string? obj)
    obj
    (json/generate-string obj)))

(defn- json-out [s keywordize-keys?]
  (if (string? s)
    (try
      (json/parse-string s keywordize-keys?)
      (catch Throwable e
        (log/error e "Error parsing JSON")
        s))
    s))

(def ^:private encrypted-json-in
  "Should mirror [[metabase.models.interface/encrypted-json-in]]"
  (comp encryption/maybe-encrypt json-in))

(defn- encrypted-json-out
  "Should mirror [[metabase.models.interface/encrypted-json-out]]"
  [v]
  (let [decrypted (encryption/maybe-decrypt v)]
    (try
      (json/parse-string decrypted true)
      (catch Throwable e
        (if (or (encryption/possibly-encrypted-string? decrypted)
                (encryption/possibly-encrypted-bytes? decrypted))
          (log/error e "Could not decrypt encrypted field! Have you forgot to set MB_ENCRYPTION_SECRET_KEY?")
          (log/error e "Error parsing JSON"))  ; same message as in `json-out`
        v))))

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
                           :permissions
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
    (m/update-existing viz-settings "column_settings" update-keys
                       (fn [k]
                         (-> k
                             json/parse-string
                             vec
                             old-to-new
                             json/generate-string)))))

(define-migration MigrateLegacyColumnSettingsFieldRefs
  (let [update! (fn [{:keys [id visualization_settings]}]
                  (t2/query-one {:update :report_card
                                 :set    {:visualization_settings visualization_settings}
                                 :where  [:= :id id]}))]
    (run! update! (eduction (keep (fn [{:keys [id visualization_settings]}]
                                    (let [parsed  (json/parse-string visualization_settings)
                                          updated (update-legacy-field-refs-in-viz-settings parsed)]
                                      (when (not= parsed updated)
                                        {:id                     id
                                         :visualization_settings (json/generate-string updated)}))))
                            (t2/reducible-query {:select [:id :visualization_settings]
                                                 :from   [:report_card]
                                                 :where  [:or
                                                          ;; these match legacy field refs in column_settings
                                                          [:like :visualization_settings "%ref\\\\\",[\\\\\"field-id%"]
                                                          [:like :visualization_settings "%ref\\\\\",[\\\\\"field-literal%"]
                                                          [:like :visualization_settings "%ref\\\\\",[\\\\\"fk->%"]
                                                          ;; MySQL with NO_BACKSLASH_ESCAPES disabled:
                                                          [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"field-id%"]
                                                          [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"field-literal%"]
                                                          [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"fk->%"]]})))))

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
         json/parse-string
         (map #(m/update-existing % "field_ref" old-to-new))
         json/generate-string)))

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
                                                 :where  [:or
                                                          [:like :result_metadata "%field-id%"]
                                                          [:like :result_metadata "%field-literal%"]
                                                          [:like :result_metadata "%fk->%"]]})))))

(defn- remove-opts
  "Removes options from the `field_ref` options map. If the resulting map is empty, it's replaced it with nil."
  [field_ref & opts-to-remove]
  (match field_ref
    ["field" id opts] ["field" id (not-empty (apply dissoc opts opts-to-remove))]
    _ field_ref))

(defn- remove-join-alias-from-column-settings-field-refs [visualization_settings]
  (update visualization_settings "column_settings"
          (fn [column_settings]
            (into {}
                  (map (fn [[k v]]
                         (match (vec (json/parse-string k))
                           ["ref" ["field" id opts]]
                           [(json/generate-string ["ref" (remove-opts ["field" id opts] "join-alias")]) v]
                           _ [k v]))
                       column_settings)))))

(defn- add-join-alias-to-column-settings-refs [{:keys [visualization_settings result_metadata]}]
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
  (let [update-one! (fn [{:keys [id visualization_settings] :as card}]
                      (let [updated (add-join-alias-to-column-settings-refs card)]
                        (when (not= visualization_settings updated)
                          (t2/query-one {:update :report_card
                                         :set    {:visualization_settings updated}
                                         :where  [:= :id id]}))))]
    (run! update-one! (t2/reducible-query {:select [:id :visualization_settings :result_metadata]
                                           :from   [:report_card]
                                           :where  [:and
                                                    [:or
                                                     [:= :query_type nil]
                                                     [:= :query_type "query"]]
                                                    [:or
                                                     [:like :visualization_settings "%ref\\\\\",[\\\\\"field%"]
                                                     ; MySQL with NO_BACKSLASH_ESCAPES disabled
                                                     [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"field%"]]
                                                    [:like :result_metadata "%join-alias%"]]})))
  (let [update! (fn [{:keys [id visualization_settings]}]
                  (let [updated (-> visualization_settings
                                    json/parse-string
                                    remove-join-alias-from-column-settings-field-refs
                                    json/generate-string)]
                    (when (not= visualization_settings updated)
                      (t2/query-one {:update :report_card
                                     :set    {:visualization_settings updated}
                                     :where  [:= :id id]}))))]
    (run! update! (t2/reducible-query {:select [:id :visualization_settings]
                                       :from   [:report_card]
                                       :where  [:and
                                                [:or
                                                 [:= :query_type nil]
                                                 [:= :query_type "query"]]
                                                [:or
                                                 [:like :visualization_settings "%ref\\\\\",[\\\\\"field%"]
                                                 [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"field%"]]
                                                [:like :visualization_settings "%join-alias%"]]}))))

(defn- update-card-row-on-downgrade-for-dashboard-tab
  [dashboard-id]
  (let [tab+cards (->> (t2/query {:select    [:report_dashboardcard.* [:dashboard_tab.position :tab_position]]
                                  :from      [:report_dashboardcard]
                                  :where     [:= :report_dashboardcard.dashboard_id dashboard-id]
                                  :left-join [:dashboard_tab [:= :dashboard_tab.id :report_dashboardcard.dashboard_tab_id]]})
                       (group-by :tab_position)
                               ;; sort by tab position
                       (sort-by first))
        cards->max-height (fn [cards] (apply max (map #(+ (:row %) (:size_y %)) cards)))]
    (loop [position+cards tab+cards
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

(defn- destructure-revision-card-sizes
  "Perform the best effort to destructure card sizes in revision.
  The card in revision contains legacy field name and maybe even lacking fields."
  [card]
  {:size_x (or (get card :size_x)
               (get card :sizeX)
               4)
   :size_y (or (get card :size_y)
               (get card :sizeY)
               4)
   :row    (or (get card :row) 0)
   :col    (or (get card :col) 0)})

(defn- migrate-dashboard-grid-from-18-to-24
  "Mirror of the forward algorithm we have in sql."
  [card]
  (let [{:keys [row col size_x size_y]} (destructure-revision-card-sizes card)]
    ;; new_size_x = size_x + ((col + size_x + 1) // 3) - ((col + 1) // 3)
    ;; new_col = col + ((col + 1) // 3)
    ;; need to wrap it a try catch in case anything weird could go wrong, for example
    ;; sizes are string
    (try
      (merge
       (dissoc card :sizeX :sizeY) ;; remove those legacy keys if exists
       {:size_x (- (+ size_x
                      (quot (+ col size_x 1) 3))
                   (quot (+ col 1) 3))
        :col    (+ col (quot (+ col 1) 3))
        :size_y size_y
        :row    row})
      (catch Throwable _
        card))))

(defn- migrate-dashboard-grid-from-24-to-18
  "Mirror of the rollback algorithm we have in sql."
  [card]
  (let [{:keys [row col size_x size_y]} (destructure-revision-card-sizes card)]
    ;; new_size_x = size_x - ((size_x + col + 1) // 4 - (col + 1) // 4)
    ;; new_col = col - (col + 1) // 4
    (try
      (merge
       card
       {:size_x (if (= size_x 1)
                  1
                  (- size_x
                     (-
                      (quot (+ size_x col 1) 4)
                      (quot (+ col 1) 4))))
        :col    (- col (quot (+ col 1) 4))
        :size_y size_y
        :row    row})
      (catch Throwable _
        card))))

(define-reversible-migration RevisionDashboardMigrateGridFrom18To24
  (let [migrate! (fn [revision]
                   (let [object (json/parse-string (:object revision) keyword)]
                     (when (seq (:cards object))
                       (t2/query {:update :revision
                                  :set {:object (json/generate-string (update object :cards #(map migrate-dashboard-grid-from-18-to-24 %)))}
                                  :where [:= :id (:id revision)]}))))]
    (run! migrate! (t2/reducible-query {:select [:*]
                                        :from   [:revision]
                                        :where  [:= :model "Dashboard"]})))
  (let [roll-back! (fn [revision]
                     (let [object (json/parse-string (:object revision) keyword)]
                       (when (seq (:cards object))
                         (t2/query {:update :revision
                                    :set {:object (json/generate-string (update object :cards #(map migrate-dashboard-grid-from-24-to-18 %)))}
                                    :where [:= :id (:id revision)]}))))]
    (run! roll-back! (t2/reducible-query {:select [:*]
                                          :from   [:revision]
                                          :where  [:= :model "Dashboard"]}))))

(define-migration RevisionMigrateLegacyColumnSettingsFieldRefs
  (let [update-one! (fn [{:keys [id object]}]
                      (let [object  (json/parse-string object)
                            updated (update object "visualization_settings" update-legacy-field-refs-in-viz-settings)]
                        (when (not= updated object)
                          (t2/query-one {:update :revision
                                         :set    {:object (json/generate-string updated)}
                                         :where  [:= :id id]}))))]
    (run! update-one! (t2/reducible-query {:select [:id :object]
                                           :from   [:revision]
                                           :where  [:and
                                                    [:= :model "Card"]
                                                    [:or
                                                     ;; these match legacy field refs in column_settings
                                                     [:like :object "%ref\\\\\",[\\\\\"field-id%"]
                                                     [:like :object "%ref\\\\\",[\\\\\"field-literal%"]
                                                     [:like :object "%ref\\\\\",[\\\\\"fk->%"]
                                                     ;; MySQL with NO_BACKSLASH_ESCAPES disabled:
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field-id%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field-literal%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"fk->%"]]]}))))

(define-reversible-migration RevisionAddJoinAliasToColumnSettingsFieldRefs
  ;; This migration is essentially the same as `AddJoinAliasToColumnSettingsFieldRefs`, but for card revisions.
  ;; We can't use the same migration because cards in the revision table don't always have `result_metadata`.
  ;; So instead, we use the join aliases from card's `dataset_query` to create field refs in visualization_settings.
  ;; There will inevitably be extra entries in visualization_settings.column_settings that don't match field refs in result_metadata, but that's ok.
  (let [add-join-aliases
        (fn [card]
          (let [join-aliases (->> (get-in card ["dataset_query" "query" "joins"])
                                  (map #(get % "alias"))
                                  set)]
            (if (seq join-aliases)
              (update (get card "visualization_settings") "column_settings"
                      (fn [column_settings]
                        (let [copies-with-join-alias (into {}
                                                           (mapcat (fn [[k v]]
                                                                     (match (vec (json/parse-string k))
                                                                       ["ref" ["field" id opts]]
                                                                       (for [alias join-aliases]
                                                                         [(json/generate-string ["ref" ["field" id (assoc opts "join-alias" alias)]]) v])
                                                                       _ '()))
                                                                   column_settings))]
                          ;; existing column settings should take precedence over the copies in case there is a conflict
                          (merge copies-with-join-alias column_settings))))
              card)))
        update-one!
        (fn [revision]
          (let [card (json/parse-string (:object revision))]
            (when (not= (get card "query_type") "native") ; native queries won't have join aliases, so we can exclude them straight away
              (let [updated (add-join-aliases card)]
                (when (not= updated (get "visualization_settings" card))
                  (t2/query {:update :revision
                             :set {:object (json/generate-string (assoc card "visualization_settings" updated))}
                             :where [:= :id (:id revision)]}))))))]
    (run! update-one! (t2/reducible-query {:select [:*]
                                           :from   [:revision]
                                           :where  [:and
                                                 ;; only include cards with field refs in column_settings
                                                    [:or
                                                     [:like :object "%ref\\\\\",[\\\\\"field%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field%"]]
                                                 ;; only include cards with joins
                                                    [:like :object "%joins%"]
                                                    [:= :model "Card"]]})))
  ;; Reverse migration
  (let [update-one!
        (fn [revision]
          (let [card (json/parse-string (:object revision))]
            (when (not= (get card "query_type") "native")
              (let [viz-settings (get card "visualization_settings")
                    updated      (remove-join-alias-from-column-settings-field-refs viz-settings)]
                (when (not= updated viz-settings)
                  (t2/query {:update :revision
                             :set {:object (json/generate-string (assoc card "visualization_settings" updated))}
                             :where [:= :id (:id revision)]}))))))]
    (run! update-one! (t2/reducible-query {:select [:*]
                                           :from   [:revision]
                                           :where  [:and
                                                    [:or
                                                     [:like :object "%ref\\\\\",[\\\\\"field%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field%"]]
                                                    [:like :object "%join-alias%"]
                                                    [:= :model "Card"]]}))))

(define-migration MigrateLegacyDashboardCardColumnSettingsFieldRefs
  (let [update-one! (fn [{:keys [id visualization_settings]}]
                      (let [parsed  (json/parse-string visualization_settings)
                            updated (update-legacy-field-refs-in-viz-settings parsed)]
                        (when (not= parsed updated)
                          (t2/query-one {:update :report_dashboardcard
                                         :set    {:visualization_settings (json/generate-string updated)}
                                         :where  [:= :id id]}))))]
    (run! update-one! (t2/reducible-query
                       {:select [:id :visualization_settings]
                        :from   [:report_dashboardcard]
                        :where  [:and
                                 [:<> :card_id nil]
                                 [:or
                                  ;; these match legacy field refs in column_settings
                                  [:like :visualization_settings "%ref\\\\\",[\\\\\"field-id%"]
                                  [:like :visualization_settings "%ref\\\\\",[\\\\\"field-literal%"]
                                  [:like :visualization_settings "%ref\\\\\",[\\\\\"fk->%"]
                                  ;; MySQL with NO_BACKSLASH_ESCAPES disabled:
                                  [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"field-id%"]
                                  [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"field-literal%"]
                                  [:like :visualization_settings "%ref\\\\\\\",[\\\\\\\"fk->%"]]]}))))

(define-reversible-migration AddJoinAliasToDashboardCardColumnSettingsFieldRefs
  (let [update-one! (fn [{:keys [id visualization_settings result_metadata]}]
                      (let [updated (add-join-alias-to-column-settings-refs {:visualization_settings visualization_settings
                                                                             :result_metadata        result_metadata})]
                        (when (not= visualization_settings updated)
                          (t2/query-one {:update :report_dashboardcard
                                         :set    {:visualization_settings updated}
                                         :where  [:= :id id]}))))]
    (run! update-one! (t2/reducible-query {:select [:dc.id :dc.visualization_settings :c.result_metadata]
                                           :from   [[:report_card :c]]
                                           :join   [[:report_dashboardcard :dc] [:= :dc.card_id :c.id]]
                                           :where  [:and
                                                    [:or
                                                     [:= :c.query_type nil]
                                                     [:= :c.query_type "query"]]
                                                    [:or
                                                     [:like :dc.visualization_settings "%ref\\\\\",[\\\\\"field%"]
                                                     ; MySQL with NO_BACKSLASH_ESCAPES disabled
                                                     [:like :dc.visualization_settings "%ref\\\\\\\",[\\\\\\\"field%"]]
                                                    [:like :c.result_metadata "%join-alias%"]]})))
  (let [update! (fn [{:keys [id visualization_settings]}]
                  (let [parsed  (json/parse-string visualization_settings)
                        updated (remove-join-alias-from-column-settings-field-refs parsed)]
                    (when (not= parsed updated)
                      (t2/query-one {:update :report_dashboardcard
                                     :set    {:visualization_settings (json/generate-string updated)}
                                     :where  [:= :id id]}))))]
    (run! update! (t2/reducible-query {:select [:dc.id :dc.visualization_settings]
                                       :from   [[:report_card :c]]
                                       :join   [[:report_dashboardcard :dc] [:= :dc.card_id :c.id]]
                                       :where  [:and
                                                [:or
                                                 [:= :c.query_type nil]
                                                 [:= :c.query_type "query"]]
                                                [:or
                                                 [:like :dc.visualization_settings "%ref\\\\\",[\\\\\"field%"]
                                                 [:like :dc.visualization_settings "%ref\\\\\\\",[\\\\\\\"field%"]]
                                                [:like :dc.visualization_settings "%join-alias%"]]}))))

(define-migration RevisionMigrateLegacyDashboardCardColumnSettingsFieldRefs
  (let [update-one! (fn [{:keys [id object]}]
                      (let [object  (json/parse-string object)
                            updated (update object "cards" (fn [cards]
                                                             (map #(update % "visualization_settings" update-legacy-field-refs-in-viz-settings) cards)))]
                        (when (not= updated object)
                          (t2/query-one {:update :revision
                                         :set    {:object (json/generate-string updated)}
                                         :where  [:= :id id]}))))]
    (run! update-one! (t2/reducible-query {:select [:id :object]
                                           :from   [:revision]
                                           :where  [:and
                                                    [:= :model "Dashboard"]
                                                    [:or
                                                     ;; these match legacy field refs in column_settings
                                                     [:like :object "%ref\\\\\",[\\\\\"field-id%"]
                                                     [:like :object "%ref\\\\\",[\\\\\"field-literal%"]
                                                     [:like :object "%ref\\\\\",[\\\\\"fk->%"]
                                                     ;; MySQL with NO_BACKSLASH_ESCAPES disabled:
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field-id%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field-literal%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"fk->%"]]]}))))

(define-reversible-migration RevisionAddJoinAliasToDashboardCardColumnSettingsFieldRefs
  (let [add-join-aliases
        (fn [dashcard]
          (if-let [{:keys [dataset_query]} (t2/query-one {:select [:dataset_query]
                                                          :from   [:report_card]
                                                          :where  [:and
                                                                   [:or
                                                                    ;; native queries won't have join aliases, so we can exclude them
                                                                    [:= :query_type nil]
                                                                    [:= :query_type "query"]]
                                                                   [:= :id (get dashcard "card_id")]
                                                                   ;; only include cards with joins
                                                                   [:like :dataset_query "%joins%"]]})]
            (if-let [join-aliases (->> (get-in (json/parse-string dataset_query) ["query" "joins"])
                                       (map #(get % "alias"))
                                       set
                                       seq)]
              (m/update-existing-in dashcard ["visualization_settings" "column_settings"]
                                    (fn [column_settings]
                                      (let [copies-with-join-alias (into {}
                                                                         (mapcat (fn [[k v]]
                                                                                   (match (vec (json/parse-string k))
                                                                                     ["ref" ["field" id opts]]
                                                                                     (for [alias join-aliases]
                                                                                       [(json/generate-string ["ref" ["field" id (assoc opts "join-alias" alias)]]) v])
                                                                                     _ '()))
                                                                                 column_settings))]
                                        ;; existing column settings should take precedence over the copies in case there is a conflict
                                        (merge copies-with-join-alias column_settings))))
              dashcard)
            dashcard))
        update-one!
        (fn [revision]
          (let [dashboard (json/parse-string (:object revision))
                updated   (update dashboard "cards" (fn [dashcards]
                                                      (map add-join-aliases dashcards)))]
            (when (not= updated dashboard)
              (t2/query {:update :revision
                         :set    {:object (json/generate-string updated)}
                         :where  [:= :id (:id revision)]}))))]
    (run! update-one! (t2/reducible-query {:select [:*]
                                           :from   [:revision]
                                           :where  [:and
                                                    [:= :model "Dashboard"]
                                                    ;; only include cards with field refs in column_settings
                                                    [:or
                                                     [:like :object "%ref\\\\\",[\\\\\"field%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field%"]]]})))
  ;; Reverse migration
  (let [update-one!
        (fn [revision]
          (let [dashboard (json/parse-string (:object revision))
                updated   (update dashboard "cards"
                                  (fn [dashcards]
                                    (map #(update % "visualization_settings" remove-join-alias-from-column-settings-field-refs)
                                         dashcards)))]
            (when (not= updated dashboard)
              (t2/query {:update :revision
                         :set    {:object (json/generate-string updated)}
                         :where  [:= :id (:id revision)]}))))]
    (run! update-one! (t2/reducible-query {:select [:*]
                                           :from   [:revision]
                                           :where  [:and
                                                    [:= :model "Dashboard"]
                                                    [:or
                                                     [:like :object "%ref\\\\\",[\\\\\"field%"]
                                                     [:like :object "%ref\\\\\\\",[\\\\\\\"field%"]]
                                                    [:like :object "%join-alias%"]]}))))

(define-reversible-migration MigrateDatabaseOptionsToSettings
  (let [update-one! (fn [{:keys [id settings options]}]
                      (let [settings     (encrypted-json-out settings)
                            options      (json-out options true)
                            new-settings (encrypted-json-in (merge settings options))]
                        (t2/query {:update :metabase_database
                                   :set    {:settings new-settings}
                                   :where  [:= :id id]})))]
    (run! update-one! (t2/reducible-query {:select [:id :settings :options]
                                           :from   [:metabase_database]
                                           :where  [:and
                                                    [:not= :options ""]
                                                    [:not= :options "{}"]
                                                    [:not= :options nil]]})))
  (let [rollback-one! (fn [{:keys [id settings options]}]
                        (let [settings (encrypted-json-out settings)
                              options  (json-out options true)]
                          (when (some? (:persist-models-enabled settings))
                            (t2/query {:update :metabase_database
                                       :set    {:options (json/generate-string (select-keys settings [:persist-models-enabled]))
                                                :settings (encrypted-json-in (dissoc settings :persist-models-enabled))}
                                       :where  [:= :id id]}))))]
    (run! rollback-one! (t2/reducible-query {:select [:id :settings :options]
                                             :from   [:metabase_database]}))))

;;; Fix click through migration

(defn- fix-click-through
  "Fixes click behavior settings on dashcards, returns nil if no fix available. Format changed from:

  `{... click click_link_template ...}` to `{... click_behavior { type linkType linkTemplate } ...}`

  at the top level and
  {... view_as link_template link_text ...} to `{ ... click_behavior { type linkType linkTemplate linkTextTemplate } ...}`

  at the column_settings level. Scours the card to find all click behavior, reshapes it, and deep merges it into the
  reshapen dashcard.  scour for all links in the card, fixup the dashcard and then merge in any new click_behaviors
  from the card. See extensive tests for different scenarios.

  We are in a migration so this returns nil if there is nothing to do so that it is filtered and we aren't running sql
  statements that are replacing data for no purpose.

  Merging the following click behaviors in order (later merges on top of earlier):
  - fixed card click behavior
  - fixed dash click behavior
  - existing new style dash click behavior"
  [{id :id card :card_visualization dashcard :dashcard_visualization}]
  (let [remove-nil-keys (fn [m]
                          (into {} (remove #(nil? (val %)) m)))
        existing-fixed  (fn [settings]
                          (-> settings
                              (m/update-existing "column_settings"
                                                 (fn [column_settings]
                                                   (m/map-vals
                                                    #(select-keys % ["click_behavior"])
                                                    column_settings)))
                             ;; select click behavior top level and in column settings
                              (select-keys ["column_settings" "click_behavior"])
                              (remove-nil-keys)))
        fix-top-level   (fn [toplevel]
                          (if (= (get toplevel "click") "link")
                            (assoc toplevel
                                  ;; add new shape top level
                                   "click_behavior"
                                   {"type"         (get toplevel "click")
                                    "linkType"     "url"
                                    "linkTemplate" (get toplevel "click_link_template")})
                            toplevel))
        fix-cols        (fn [column-settings]
                          (reduce-kv
                           (fn [m col field-settings]
                             (assoc m col
                                   ;; add the click stuff under the new click_behavior entry or keep the
                                   ;; field settings as is
                                    (if (and (= (get field-settings "view_as") "link")
                                             (contains? field-settings "link_template"))
                                     ;; remove old shape and add new shape under click_behavior
                                      (assoc field-settings
                                             "click_behavior"
                                             {"type"             (get field-settings "view_as")
                                              "linkType"         "url"
                                              "linkTemplate"     (get field-settings "link_template")
                                              "linkTextTemplate" (get field-settings "link_text")})
                                      field-settings)))
                           {}
                           column-settings))
        fixed-card      (-> (if (contains? dashcard "click")
                              (dissoc card "click_behavior") ;; throw away click behavior if dashcard has click
                             ;; behavior added
                              (fix-top-level card))
                            (update "column_settings" fix-cols) ;; fix columns and then select only the new shape from
                           ;; the settings tree
                            existing-fixed)
        fixed-dashcard  (update (fix-top-level dashcard) "column_settings" fix-cols)
        final-settings  (->> (m/deep-merge fixed-card fixed-dashcard (existing-fixed dashcard))
                            ;; remove nils and empty maps _AFTER_ deep merging so that the shapes are
                            ;; uniform. otherwise risk not fully clobbering an underlying form if the one going on top
                            ;; doesn't have link text
                             (walk/postwalk (fn [form]
                                              (if (map? form)
                                                (into {} (for [[k v] form
                                                               :when (if (seqable? v)
                                                                      ;; remove keys with empty maps. must be postwalk
                                                                       (seq v)
                                                                      ;; remove nils
                                                                       (some? v))]
                                                           [k v]))
                                                form))))]
    (when (not= final-settings dashcard)
      {:id                     id
       :visualization_settings final-settings})))

(defn- parse-to-json [& ks]
  (fn [x]
    (reduce #(update %1 %2 json/parse-string)
            x
            ks)))

;; This was previously a data migration, hence the metadata. The metadata is unused but potentially useful
;; as documentation.
(defn- migrate-click-through!
  {:author "dpsutton"
   :added  "0.38.1"
   :doc    "Migration of old 'custom drill-through' to new 'click behavior'; see #15014"}
  []
  (transduce (comp (map (parse-to-json :card_visualization :dashcard_visualization))
                   (map fix-click-through)
                   (filter :visualization_settings))
             (completing
              (fn [_ {:keys [id visualization_settings]}]
                (t2/update! :report_dashboardcard id
                            {:visualization_settings (json/generate-string visualization_settings)})))
             nil
             ;; flamber wrote a manual postgres migration that this faithfully recreates: see
             ;; https://github.com/metabase/metabase/issues/15014
             (t2/query {:select [:dashcard.id
                                 [:card.visualization_settings :card_visualization]
                                 [:dashcard.visualization_settings :dashcard_visualization]]
                        :from   [[:report_dashboardcard :dashcard]]
                        :join   [[:report_card :card] [:= :dashcard.card_id :card.id]]
                        :where  [:or
                                 [:like
                                  :card.visualization_settings "%\"link_template\":%"]
                                 [:like
                                  :card.visualization_settings "%\"click_link_template\":%"]
                                 [:like
                                  :dashcard.visualization_settings "%\"link_template\":%"]
                                 [:like
                                  :dashcard.visualization_settings "%\"click_link_template\":%"]]})))

(define-migration MigrateClickThrough
  (migrate-click-through!))

;;; Removing admin from group mapping migration

(defn- raw-setting
  "Get raw setting directly from DB.
  For some reasons during data-migration [[metabase.models.setting/get]] return the default value defined in
  [[metabase.models.setting/defsetting]] instead of value from Setting table."
  [k]
  (t2/select-one-fn :value :setting :key (name k)))

(defn- remove-admin-group-from-mappings-by-setting-key!
  [mapping-setting-key]
  (let [admin-group-id (t2/select-one-pk :permissions_group :name "Administrators")
        mapping        (try
                         (json/parse-string (raw-setting mapping-setting-key))
                         (catch Exception _e
                           {}))]
    (when-not (empty? mapping)
      (t2/update! :setting {:key (name mapping-setting-key)}
                  {:value
                   (->> mapping
                        (map (fn [[k v]] [k (filter #(not= admin-group-id %) v)]))
                        (into {})
                        json/generate-string)}))))

(defn- migrate-remove-admin-from-group-mapping-if-needed
  {:author "qnkhuat"
   :added  "0.43.0"
   :doc    "In the past we have a setting to disable group sync for admin group when using SSO or LDAP, but it's broken
            and haven't really worked (see #13820).
            In #20991 we remove this option entirely and make sync for admin group just like a regular group.
            But on upgrade, to make sure we don't unexpectedly begin adding or removing admin users:
              - for LDAP, if the `ldap-sync-admin-group` toggle is disabled, we remove all mapping for the admin group
              - for SAML, JWT, we remove all mapping for admin group, because they were previously never being synced
            if `ldap-sync-admin-group` has never been written, getting raw-setting will return a `nil`, and nil could
            also be interpreted as disabled. so checking `(not= x \"true\")` is safer than `(= x \"false\")`."}
  []
  (when (not= (raw-setting :ldap-sync-admin-group) "true")
    (remove-admin-group-from-mappings-by-setting-key! :ldap-group-mappings))
  ;; sso are enterprise feature but we still run this even in OSS in case a customer
  ;; have switched from enterprise -> SSO and stil have this mapping in Setting table
  (remove-admin-group-from-mappings-by-setting-key! :jwt-group-mappings)
  (remove-admin-group-from-mappings-by-setting-key! :saml-group-mappings))

(define-migration MigrateRemoveAdminFromGroupMappingIfNeeded
  (migrate-remove-admin-from-group-mapping-if-needed))

(defn- db-type->to-unified-columns
  "Each unified column is 3 items sequence [table-name, column-name, is-nullable?]"
  [db-type]
  (let [query (case db-type
                :postgres {:select [:table_name :column_name :is_nullable]
                           :from   [:information_schema.columns]
                           :where  [:and
                                    [:= :data_type "timestamp without time zone"]
                                    [:= :table_schema :%current_schema]
                                    [:= :table_catalog :%current_database]]}

                :mysql    {:select [:table_name :column_name :is_nullable]
                           :from   [:information_schema.columns]
                           :where  [:and
                                    [:= :data_type "datetime"]
                                    [:= :table_schema :%database]]}
                :h2      {:select [:table_name :column_name :is_nullable]
                          :from   [:information_schema.columns]
                          :where  [:= :data_type "TIMESTAMP"]})]
    (->> (t2/query query)
         (map #(update-vals % (comp keyword lower-case-en)))
         (remove (fn [{:keys [table_name]}]
                   (or (#{:databasechangelog :databasechangeloglock} table_name)
                       ;; excludes views
                       (str/starts-with? (name table_name) "v_"))))
         (map #(update % :is_nullable (fn [x] (= :yes x))))
         (map (juxt :table_name :column_name :is_nullable)))))

(defn- alter-table-column-type-sql
  [db-type table column ttype nullable?]
  (let [ttype (name ttype)
        db-type (if (and (= db-type :mysql)
                         (with-open [conn (.getConnection (mdb.connection/data-source))]
                           (= "MariaDB" (.getDatabaseProductName (.getMetaData conn)))))
                  :mariadb
                  db-type)]
    (case db-type
      :postgres
      (format "ALTER TABLE \"%s\" ALTER COLUMN \"%s\" TYPE %s USING (\"%s\"::%s), ALTER COLUMN %s %s"
              table column ttype column ttype column (if nullable? "DROP NOT NULL" "SET NOT NULL"))

      :mysql
      (format "ALTER TABLE `%s` MODIFY `%s` %s %s"
              table column ttype (if nullable? "NULL" "NOT NULL"))

      ;; maridb will automatically add extra on update set current_timestamp if you don't have a default value for not
      ;; nullable columns.
      ;; We don't want this property for created_at columns. so adding a default value here to avoid that default extra
      :mariadb
      (format "ALTER TABLE `%s` MODIFY `%s` %s %s"
              table column ttype (if nullable? "NULL" "NOT NULL DEFAULT CURRENT_TIMESTAMP"))

      :h2
      (format "ALTER TABLE \"%s\" ALTER COLUMN \"%s\" %s %s"
              (upper-case-en table) (upper-case-en column) ttype (if nullable? "NULL" "NOT NULL")))))

(defn- unify-time-column-type!
  [direction]
  (let [db-type        (mdb.connection/db-type)
        columns        (db-type->to-unified-columns db-type)
        timestamp-type (case db-type
                         (:postgres :h2) "TIMESTAMP WITH TIME ZONE"
                         :mysql          "TIMESTAMP(6)")
        datetime-type (case db-type
                        (:postgres :h2) "TIMESTAMP WITHOUT TIME ZONE"
                        :mysql          "DATETIME")
        target-type    (case direction
                         :up timestamp-type
                         :down datetime-type)]
    (doseq [[table column nullable?] columns
            ;; core_user.updated_at is referenced in a view in postgres, and PG doesn't allow changing column types if a
            ;; view depends on it. so we need to drop the view before changing the type, then re-create it again
            :let [is-pg-specical-case? (= [db-type table column]
                                          [:postgres :core_user :updated_at])]]
      (when is-pg-specical-case?
        (t2/query [(format "DROP VIEW IF EXISTS v_users;")]))
      (t2/query [(alter-table-column-type-sql db-type (name table) (name column) target-type nullable?)])
      (when is-pg-specical-case?
        (t2/query [(slurp (io/resource "migrations/instance_analytics_views/users/v1/postgres-users.sql"))])))))

(define-reversible-migration UnifyTimeColumnsType
  (unify-time-column-type! :up)
  (unify-time-column-type! :down))

(defn- mariadb?
  [ds]
  (with-open [conn (.getConnection ^DataSource ds)]
    (= "MariaDB" (.getDatabaseProductName (.getMetaData conn)))))

(defn- db-type*
  "Like [[metabase.connection/db-type]] but distinguishes between mysql and mariadb."
  []
  (let [db-type (mdb.connection/db-type)]
    (if (= db-type :mysql)
      (if (mariadb? (mdb.connection/data-source))
        :mariadb
        :mysql)
      db-type)))

(define-reversible-migration CardRevisionAddType
  (case (db-type*)
    :postgres
    ;; postgres doesn't allow `\u0000` in text when converting to jsonb, so we need to remove them before we can
    ;; parse the json. We use negative look behind to avoid matching `\\u0000` (metabase#40835)
    (t2/query ["UPDATE revision
               SET object = replace(jsonb_set(
                  (regexp_replace(object, '(?<!\\\\)\\\\u0000', '286b707c-e895-4cd3-acfc-569147f54371', 'g'))::jsonb, '{type}',
                  to_jsonb(CASE
                              WHEN ((regexp_replace(object, '(?<!\\\\)\\\\u0000', '286b707c-e895-4cd3-acfc-569147f54371', 'g'))::jsonb->>'dataset')::boolean THEN 'model'
                              ELSE 'question'
                           END)::jsonb, true)::text, '286b707c-e895-4cd3-acfc-569147f54371', '\\u0000')
               WHERE model = 'Card' AND ((regexp_replace(object, '(?<!\\\\)\\\\u0000', '286b707c-e895-4cd3-acfc-569147f54371', 'g'))::jsonb->>'dataset') IS NOT NULL;"])

    :mysql
    (t2/query ["UPDATE revision
               SET object = JSON_SET(
                   object,
                   '$.type',
                   CASE
                       WHEN JSON_UNQUOTE(JSON_EXTRACT(object, '$.dataset')) = 'true' THEN 'model'
                       ELSE 'question'
                   END)
               WHERE model = 'Card' AND JSON_UNQUOTE(JSON_EXTRACT(object, '$.dataset')) IS NOT NULL;;"])

    ;; json_extract on mariadb throws an error if the json is more than 32 levels nested. See #41924
    ;; So we do this in clojure land for mariadb
    (:h2 :mariadb)
    (let [migrate! (fn [revision]
                     (let [object     (json/parse-string (:object revision) keyword)
                           new-object (assoc object :type (if (:dataset object)
                                                            "model"
                                                            "question"))]
                       (t2/query {:update :revision
                                  :set    {:object (json/generate-string new-object)}
                                  :where  [:= :id (:id revision)]})))]
      (run! migrate! (t2/reducible-query {:select [:*]
                                          :from   [:revision]
                                          :where  [:= :model "Card"]}))))

  (case (db-type*)
    :postgres
    (t2/query ["UPDATE revision
                SET object = jsonb_set(
                    object::jsonb - 'type',
                    '{dataset}',
                    to_jsonb(CASE
                                 WHEN (object::jsonb->>'type') = 'model'
                                 THEN true ELSE false
                             END)
                )
                WHERE model = 'Card' AND (object::jsonb->>'type') IS NOT NULL;"])

    :mysql
    (do
     (t2/query ["UPDATE revision
                 SET object = JSON_SET(
                     object,
                     '$.dataset',
                     CASE
                         WHEN JSON_UNQUOTE(JSON_EXTRACT(object, '$.type')) = 'model'
                         THEN true ELSE false
                     END)
                 WHERE model = 'Card' AND JSON_UNQUOTE(JSON_EXTRACT(object, '$.type')) IS NOT NULL;"])
     (t2/query ["UPDATE revision
                 SET object = JSON_REMOVE(object, '$.type')
                 WHERE model = 'Card' AND JSON_UNQUOTE(JSON_EXTRACT(object, '$.type')) IS NOT NULL;"]))

    (:h2 :mariadb)
    (let [rollback! (fn [revision]
                      (let [object     (json/parse-string (:object revision) keyword)
                            new-object (-> object
                                           (assoc :dataset (= (:type object) "model"))
                                           (dissoc :type))]
                        (t2/query {:update :revision
                                   :set    {:object (json/generate-string new-object)}
                                   :where  [:= :id (:id revision)]})))]
      (run! rollback! (t2/reducible-query {:select [:*]
                                           :from   [:revision]
                                           :where  [:= :model "Card"]})))))

(define-migration DeleteScanFieldValuesTriggerForDBThatTurnItOff
  ;; If you config scan field values for a DB to either "Only when adding a new filter widget" or "Never, I’ll do this manually if I need to"
  ;; then we shouldn't schedule a trigger for scan field values. Turns out it wasn't like that since forever, so we need
  ;; this migraiton to remove triggers for any existing DB that have this option on.
  ;; See #40715
  (when-let [;; find all dbs which are configured not to scan field values
             dbs (seq (filter #(and (-> % :details encrypted-json-out :let-user-control-scheduling)
                                    (false? (:is_full_sync %)))
                              (t2/select :metabase_database)))]
    (classloader/the-classloader)
    (set-jdbc-backend-properties!)
    (let [scheduler (qs/initialize)]
      (qs/start scheduler)
      (doseq [db dbs]
        (qs/delete-trigger scheduler (triggers/key (format "metabase.task.update-field-values.trigger.%d" (:id db)))))
      ;; use the table, not model/Database because we don't want to trigger the hooks
      (t2/update! :metabase_database :id [:in (map :id dbs)] {:cache_field_values_schedule nil})
      (qs/shutdown scheduler))))

(defn- hash-bcrypt
  "Hashes a given plaintext password using bcrypt.  Should be used to hash
   passwords included in stored user credentials that are to be later verified
   using `bcrypt-credential-fn`."
  [password]
  (BCrypt/hashpw password (BCrypt/gensalt)))

(defn- internal-user-exists? []
  (pos? (first (vals (t2/query-one {:select [:%count.*] :from :core_user :where [:= :id config/internal-mb-user-id]})))))

(define-migration CreateInternalUser
  ;; the internal user may have been created in a previous version for Metabase Analytics, so don't add it again if it
  ;; exists already.
  (when (not (internal-user-exists?))
    (let [salt     (str (random-uuid))
          password (hash-bcrypt (str salt (random-uuid)))
          user     {;; we insert the internal user ID directly because it's
                    ;; deliberately high enough to not conflict with any other
                    :id               config/internal-mb-user-id
                    :password_salt    salt
                    :password         password
                    :email            "internal@metabase.com"
                    :first_name       "Metabase"
                    :locale           nil
                    :last_login       nil
                    :is_active        false
                    :settings         nil
                    :type             "internal"
                    :is_qbnewb        true
                    :updated_at       nil
                    :reset_triggered  nil
                    :is_superuser     false
                    :login_attributes nil
                    :reset_token      nil
                    :last_name        "Internal"
                    :date_joined      :%now
                    :sso_source       nil
                    :is_datasetnewb   true}]
      (t2/query {:insert-into :core_user :values [user]}))
    (let [all-users-id (first (vals (t2/query-one {:select [:id] :from :permissions_group :where [:= :name "All Users"]})))
          perms-group  {:user_id config/internal-mb-user-id :group_id all-users-id}]
      (t2/query {:insert-into :permissions_group_membership :values [perms-group]}))))

(defn- load-edn
  "Loads edn from an EDN file. Parses values tagged with #t into the appropriate `java.time` class"
  [file-name]
  (with-open [r (io/reader (io/resource file-name))]
    (edn/read {:readers {'t u.date/parse}} (java.io.PushbackReader. r))))

(defn- no-user?
  "If there is a user that is not the internal user, we know it's not a fresh install."
  []
  (zero? (first (vals (t2/query-one {:select [:%count.*] :from :core_user :where [:not= :id config/internal-mb-user-id]})))))

(defn- no-db?
  "We check there is no database is not present, because the sample database could have been installed from a previous version and be out of
  date. In that (rare) case we will be conservative and not add the sample content."
  []
  (nil? (t2/query-one {:select [:*] :from :metabase_database})))

(def ^:dynamic *create-sample-content*
  "If true, we create sample content in the `CreateSampleContent` migration. This is bound to false sometimes in
   load-from-h2, during serialization load, and in some tests because the sample content makes tests slow enough to
   cause timeouts."
  true)

(define-migration CreateSampleContent
  ;; Adds sample content to a fresh install. Adds curate permissions to the collection for the 'All Users' group.
  (when *create-sample-content*
    (when (and (config/load-sample-content?)
               (not (config/config-bool :mb-enable-test-endpoints)) ; skip sample content for e2e tests to avoid coupling the tests to the contents
               (no-user?)
               (no-db?))
      (let [table-name->raw-rows  (load-edn "sample-content.edn")
            example-dashboard-id  1
            example-collection-id 2 ; trash collection is 1
            expected-sample-db-id 1
            replace-temporals     (fn [v]
                                    (if (isa? (type v) java.time.temporal.Temporal)
                                      :%now
                                      v))
            table-name->rows      (fn [table-name]
                                    (->> (table-name->raw-rows table-name)
                                         ;; We sort the rows by id and remove them so that auto-incrementing ids are
                                         ;; generated in the same order. We can't insert the ids directly in H2 without
                                         ;; creating sequences for all the generated id columns.
                                         (sort-by :id)
                                         (map (fn [row]
                                                (dissoc (update-vals row replace-temporals) :id)))))
            dbs                   (table-name->rows :metabase_database)
            _                     (t2/query {:insert-into :metabase_database :values dbs})
            db-ids                (set (map :id (t2/query {:select :id :from :metabase_database})))]
        ;; If that did not succeed in creating the metabase_database rows we could be reusing a database that
        ;; previously had rows in it even if there are no users. in this rare care we delete the metabase_database rows
        ;; and do nothing else, to be safe.
        (if (not= db-ids #{expected-sample-db-id})
          (when (seq db-ids)
            (t2/query {:delete-from :metabase_database :where [:in :id db-ids]}))
          (do (doseq [table-name [:collection
                                  :metabase_table
                                  :metabase_field
                                  :report_card
                                  :parameter_card
                                  :report_dashboard
                                  :dashboard_tab
                                  :report_dashboardcard
                                  :dashboardcard_series
                                  :permissions_group
                                  :data_permissions]]
                (when-let [values (seq (table-name->rows table-name))]
                  (t2/query {:insert-into table-name :values values})))
              (let [group-id (:id (t2/query-one {:select :id :from :permissions_group :where [:= :name "All Users"]}))]
                (t2/query {:insert-into :permissions
                           :values      [{:object   (format "/collection/%s/" example-collection-id)
                                          :group_id group-id}]}))
              (t2/query {:insert-into :setting
                         :values      [{:key   "example-dashboard-id"
                                        :value (str example-dashboard-id)}]})))))))

(comment
  ;; How to create `resources/sample-content.edn` used in `CreateSampleContent`
  ;; -----------------------------------------------------------------------------
  ;; Check out a fresh metabase instance on the branch of the major version you're targeting,
  ;; and without the :ee alias so instance analytics content is not created.
  ;; 1. create a collection with dashboards, or import one with (metabase.cmd/import "<path>")
  ;; 2. execute the following to spit out the collection to an EDN file:
  (let [pretty-spit (fn [file-name data]
                      (with-open [writer (io/writer file-name)]
                        (binding [*out* writer]
                          #_{:clj-kondo/ignore [:discouraged-var]}
                          (pprint/pprint data))))
        columns-to-remove [:view_count]
        data (into {}
                   (for [table-name [:collection
                                     :metabase_database
                                     :metabase_table
                                     :metabase_field
                                     :report_dashboard
                                     :report_dashboardcard
                                     :report_card
                                     :parameter_card
                                     :dashboard_tab
                                     :dashboardcard_series
                                     :data_permissions]
                         :let [query (cond-> {:select [:*] :from table-name}
                                       (= table-name :collection) (assoc :where [:and
                                                                                 [:= :namespace nil] ; excludes the analytics namespace
                                                                                 [:= :personal_owner_id nil]]))]]
                     [table-name (->> (t2/query query)
                                      (map (fn [x] (into {} (apply dissoc x columns-to-remove))))
                                      (keep (fn [x] (and (= table-name :collection)
                                                         (= (:type x)
                                                            ;; avoid requiring `metabase.models.collection` in this
                                                            ;; namespace to deter others using it in migrations
                                                            #_{:clj-kondo/ignore [:unresolved-namespace]}
                                                            metabase.models.collection/trash-collection-type))))
                                      (sort-by :id))]))]
    (pretty-spit "resources/sample-content.edn" data)))
  ;; (make sure there's no other content in the file)
  ;; 3. update the EDN file:
  ;; - add any columns that need removing to `columns-to-remove` above (use your common sense and list anything that
  ;;   shouldn't be carried into new instances
  ;;   instances), and create the EDN file again
  ;; - replace the database details and dbms_version with placeholders e.g. "{}" to make sure they are replaced
  ;; - if you have created content manually, find-replace :creator_id <your user-id> with :creator_id 13371338 (the internal user ID)
  ;; - replace metabase_version "<version>" with metabase_version nil


;; This was renamed to TruncateAuditTables, so we need to delete the old job & trigger
(define-migration DeleteTruncateAuditLogTask
  (classloader/the-classloader)
  (set-jdbc-backend-properties!)
  (let [scheduler (qs/initialize)]
    (qs/start scheduler)
    (qs/delete-trigger scheduler (triggers/key "metabase.task.truncate-audit-log.trigger"))
    (qs/delete-job scheduler (jobs/key "metabase.task.truncate-audit-log.job"))
    (qs/shutdown scheduler)))

(define-migration DeleteSendPulsesTask
  (classloader/the-classloader)
  (set-jdbc-backend-properties!)
  (let [scheduler (qs/initialize)]
    (qs/start scheduler)
    (qs/delete-trigger scheduler (triggers/key "metabase.task.send-pulses.trigger"))
    (qs/delete-job scheduler (jobs/key "metabase.task.send-pulses.job"))
    (qs/shutdown scheduler)))

;; If someone upgraded to 50, then downgrade to 49, the send-pulse triggers will run into an error state due to
;; jobclass not found. And when they migrate up to 50 again, these triggers will not be triggered because it's in
;; an error state. See https://www.quartz-scheduler.org/api/1.8.6/org/quartz/Trigger.html#STATE_ERROR
;; So we need to delete this on migrate down, so when they migrate up, the triggers will be recreated.
(define-reversible-migration DeleteSendPulseTaskOnDowngrade
  (log/info "No forward migration for DeleteSendPulseTaskOnDowngrade")
  (do
   (classloader/the-classloader)
   (set-jdbc-backend-properties!)
   (let [scheduler (qs/initialize)]
     (qs/start scheduler)
     (qs/delete-job scheduler (jobs/key "metabase.task.send-pulses.send-pulse.job"))
     (qs/shutdown scheduler))))

;; The InitSendPulseTriggers is a migration in disguise, it runs once per instance
;; To make sure when someone migrate up -> migrate down -> migrate up again, this job is re-run
;; on the second migrate up.
(define-reversible-migration DeleteInitSendPulseTriggersOnDowngrade
  (log/info "No forward migration for DeleteInitSendPulseTriggersOnDowngrade")
  (do
   (classloader/the-classloader)
   (set-jdbc-backend-properties!)
   (let [scheduler (qs/initialize)]
     (qs/start scheduler)
     ;; delete the job will also delete all of its triggers
     (qs/delete-job scheduler (jobs/key "metabase.task.send-pulses.init-send-pulse-triggers.job"))
     (qs/shutdown scheduler))))

;; when card display is area or bar,
;; 1. set the display key to :stackable.stack_display value OR leave it the same
;; 2. when series settings exist, remove the diplay key from each map in the series_settings list

(defn- area-bar-stacked-viz-migration
  [{display :display viz :visualization_settings :as card}]
  (if (and (#{:area :bar "area" "bar"} display)
           (:stackable.stack_type viz))
    (let [actual-display (or (:stackable.stack_display viz) display)
          new-viz        (m/update-existing viz :series_settings update-vals (fn [m] (dissoc m :display)))]
      (assoc card
             :display actual-display
             :visualization_settings new-viz))
    card))

(defn- combo-stacked-viz-migration
  [{display :display viz :visualization_settings :as card}]
  (if (#{:combo "combo"} display)
    (let [{series-settings :series_settings} viz
          series-displays                    (map :display (vals series-settings))
          new-display                        (if (and (every? some? series-displays)
                                                      (= 1 (count (distinct series-displays)))
                                                      (#{:area :bar "area" "bar"} (first (distinct series-displays))))
                                               (first series-displays)
                                               :combo)]
      (if (not (#{:combo "combo"} new-display))
        ;; we've effectively converted a :combo chart into :area or :bar since every series is shown the same way
        (area-bar-stacked-viz-migration (assoc card :display new-display))
        ;; Not all series are the same, so we keep it combo and remove the :stackable.stack_type
        (let [new-viz (dissoc viz :stackable.stack_type)]
          (assoc card :visualization_settings new-viz))))
    card))

(defn- stack-viz-settings-cleanup-migration
  [card]
  (update card :visualization_settings #(dissoc % :stackable.stack_display)))

(defn- update-stacked-viz-cards
  [partial-card]
  (-> partial-card
      area-bar-stacked-viz-migration
      combo-stacked-viz-migration
      stack-viz-settings-cleanup-migration))

(define-migration MigrateStackedAreaBarComboDisplaySettings
  (let [update! (fn [{:keys [id display visualization_settings] :as card}]
                  (t2/query-one {:update :report_card
                                 :set    {:visualization_settings visualization_settings
                                          :display                display}
                                 :where  [:= :id id]}))]
    (run! update! (eduction (keep (fn [{:keys [id display visualization_settings]}]
                                    (let [parsed-viz           (json/parse-string visualization_settings keyword)
                                          partial-card         {:display display :visualization_settings parsed-viz}
                                          updated-partial-card (update-stacked-viz-cards partial-card)]
                                      (when (not= partial-card updated-partial-card)
                                        (let [{updated-display :display
                                               updated-viz     :visualization_settings} updated-partial-card]
                                          {:id                     id
                                           :display                (name updated-display)
                                           :visualization_settings (json/generate-string updated-viz)})))))
                            (t2/reducible-query {:select [:id :display :visualization_settings]
                                                 :from   [:report_card]
                                                 :where  [:like :visualization_settings "%stackable%"]})))))

(define-reversible-migration MigrateMetricsToV2
  (metrics-v2/migrate-up!)
  (metrics-v2/migrate-down!))

(defn- raw-setting-value [key]
  (some-> (t2/query-one {:select [:value], :from :setting, :where [:= :key key]})
          :value
          encryption/maybe-decrypt))

(define-reversible-migration MigrateUploadsSettings
  (do (when (some-> (raw-setting-value "uploads-enabled") parse-boolean)
        (when-let [db-id (some-> (raw-setting-value "uploads-database-id") parse-long)]
          (let [uploads-table-prefix (raw-setting-value "uploads-table-prefix")
                uploads-schema-name  (raw-setting-value "uploads-schema-name")]
            (t2/query {:update :metabase_database
                       :set    {:uploads_enabled      true
                                :uploads_table_prefix uploads-table-prefix
                                :uploads_schema_name  uploads-schema-name}
                       :where  [:= :id db-id]}))))
      (t2/query {:delete-from :setting
                 :where       [:in :key ["uploads-enabled"
                                         "uploads-database-id"
                                         "uploads-schema-name"
                                         "uploads-table-prefix"]]}))
  (when-let [db (t2/query-one {:select [:*], :from :metabase_database, :where :uploads_enabled})]
    (let [settings [{:key "uploads-database-id",  :value (encryption/maybe-encrypt (str (:id db)))}
                    {:key "uploads-enabled",      :value (encryption/maybe-encrypt "true")}
                    {:key "uploads-table-prefix", :value (encryption/maybe-encrypt (:uploads_table_prefix db))}
                    {:key "uploads-schema-name",  :value (encryption/maybe-encrypt (:uploads_schema_name db))}]]
      (->> settings
           (filter :value)
           (t2/insert! :setting)))))

(define-migration DecryptCacheSettings
  (let [decrypt! (fn [k]
                   (t2/update! :setting :key k {:value (raw-setting-value k)}))]
    (run! decrypt! ["query-caching-ttl-ratio"
                    "query-caching-min-ttl"
                    "enable-query-caching"])))

(defn- column->column-key
  "Computes a modern viz setting column key for a `column`. The modern format is [\"name\",`name`]."
  [{name "name"}]
  (when name
    (json/generate-string ["name" name])))

(defn- column->legacy-column-key
  "Computes a legacy viz setting column key for a `column`.
  If the `field_ref` has a field name and not a field id, or if the `field_ref` is for an aggregation column, returns a
  column key of the modern format [\"name\",`name`].
  In other cases returns a legacy column key of the format [\"ref\",`field_ref`] where `:binning` and `:temporal-unit`
  options are removed from the `field_ref`."
  [{name "name" field-ref "field_ref" :as column}]
  (let [field-ref (or field-ref (when name ["field" name nil]))
        [ref-type field-id-or-name ref-options] field-ref
        field-ref (if (and (#{"field" "expression" "aggregation"} ref-type) ref-options)
                    [ref-type field-id-or-name (not-empty (dissoc ref-options "binning" "temporal-unit"))]
                    field-ref)]
    (cond
      (or (and (= ref-type "field") (string? field-id-or-name)) (= ref-type "aggregation"))
      (column->column-key column)

      field-ref
      (json/generate-string ["ref" field-ref]))))

(defn- update-legacy-column-keys-in-viz-settings
  "Updates `:column_settings` keys. Unmatched keys are retained."
  [viz-settings result-metadata old-key-fn new-key-fn]
  (let [key->column (m/index-by old-key-fn result-metadata)]
    (m/update-existing viz-settings "column_settings" update-keys
                       (fn [key]
                         (if-let [column (get key->column key)]
                           (or (new-key-fn column) key)
                           key)))))

(defn- migrate-legacy-column-keys-in-viz-settings
  "Migrates legacy `:column_settings` keys that have serialized field refs to name-based column keys. Unmatched keys are
  retained."
  [viz-settings result-metadata]
  (update-legacy-column-keys-in-viz-settings viz-settings result-metadata column->legacy-column-key column->column-key))

(defn- rollback-legacy-column-keys-in-viz-settings
  "Rollbacks changes to `:column_settings` keys and brings field ref-based column keys back. Unmatched keys are
  retained."
  [viz-settings result-metadata]
  (update-legacy-column-keys-in-viz-settings viz-settings result-metadata column->column-key column->legacy-column-key))

(defn- json-column-key-like-clause
  [key column]
  [:or [:like column (str "%\\\\\"" key "\\\\\"%")]
       ;; MySQL with NO_BACKSLASH_ESCAPES disabled:
       [:like column (str "%\\\\\\\"" key "\\\\\\\"%")]])

(defn- update-legacy-column-keys-in-card-viz-settings
  "Updates `:visualization_settings` of each card that contains `:column_settings` by calling `update-viz-settings`
  function. Can be used to both migrate and rollback the viz settings changes. `:result_metadata` of each card is used
  to find the deduplicated column name by the field reference and compute the new column key."
  [column-key-tag update-viz-settings-fn]
  (let [update-one! (fn [{id :id viz-settings :visualization_settings result-metadata :result_metadata}]
                      (let [viz-settings         (json/parse-string viz-settings)
                            result-metadata      (json/parse-string result-metadata)
                            updated-viz-settings (update-viz-settings-fn viz-settings result-metadata)]
                        (when (not= viz-settings updated-viz-settings)
                              (t2/query-one {:update :report_card
                                             :set    {:visualization_settings (json/generate-string updated-viz-settings)}
                                             :where  [:= :id id]}))))]
    (run! update-one! (t2/reducible-query {:select [:id :visualization_settings :result_metadata]
                                           :from   [:report_card]
                                           :where  [:and [:not= :result_metadata nil]
                                                         [:like :visualization_settings "%column_settings%"]
                                                         (json-column-key-like-clause column-key-tag :visualization_settings)]}))))

(define-reversible-migration MigrateLegacyColumnKeysInCardVizSettings
  (update-legacy-column-keys-in-card-viz-settings "ref" migrate-legacy-column-keys-in-viz-settings)
  (update-legacy-column-keys-in-card-viz-settings "name" rollback-legacy-column-keys-in-viz-settings))

(defn- update-legacy-column-keys-in-dashboard-card-viz-settings
  "Updates `:visualization_settings` of each dashboard card that contains `:column_settings` by calling
  `update-viz-settings` function. Can be used to both migrate and rollback the viz settings changes. `:result_metadata`
  of each referenced card is used to find the deduplicated column name by the field reference and compute the new column
  key."
  [column-key-tag update-viz-settings-fn]
  (let [update-one! (fn [{id :id viz-settings :visualization_settings result-metadata :result_metadata}]
                      (let [viz-settings         (json/parse-string viz-settings)
                            result-metadata      (json/parse-string result-metadata)
                            updated-viz-settings (update-viz-settings-fn viz-settings result-metadata)]
                        (when (not= viz-settings updated-viz-settings)
                              (t2/query-one {:update :report_dashboardcard
                                             :set    {:visualization_settings (json/generate-string updated-viz-settings)}
                                             :where  [:= :id id]}))))]
    (run! update-one! (t2/reducible-query {:select [:dc.id :dc.visualization_settings :c.result_metadata]
                                           :from   [[:report_card :c]]
                                           :join   [[:report_dashboardcard :dc] [:= :dc.card_id :c.id]]
                                           :where  [:and [:not= :c.result_metadata nil]
                                                         [:like :dc.visualization_settings "%column_settings%"]
                                                         (json-column-key-like-clause column-key-tag :dc.visualization_settings)]}))))

(define-reversible-migration MigrateLegacyColumnKeysInDashboardCardVizSettings
  (update-legacy-column-keys-in-dashboard-card-viz-settings "ref" migrate-legacy-column-keys-in-viz-settings)
  (update-legacy-column-keys-in-dashboard-card-viz-settings "name" rollback-legacy-column-keys-in-viz-settings))
