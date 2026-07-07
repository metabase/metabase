(ns metabase.sample-data.downgrade
  "Downgrade path for the bundled sample database.

  The bundled sample database moved from H2 to SQLite. When a SQLite-sample version is rolled back to
  an older H2-sample version, the older code cannot use the SQLite sample database (wrong engine and
  details). On downgrade we therefore remove the SQLite sample database together with the content it
  leaves dangling, and restore the H2 sample database and its bundled Example content in its place -
  the mirror image of the H2 -> SQLite upgrade replacement in [[metabase.sample-data.impl]].

  [[restore-h2-sample-database-on-downgrade!]] is invoked from a Liquibase custom migration (in the
  `metabase.migrations` module) rather than at startup, because after the downgrade only the older code
  runs and it will not reinstall a missing sample database on an existing instance."
  (:require
   [metabase.config.core :as config]
   [metabase.sample-data.example-content :as example-content]
   [metabase.sample-data.impl :as impl]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- card-ids-depending-on-database
  "Set of report_card ids that depend on `database-id` directly (their own query targets it) or transitively
  (a card built on such a card via source_card_id, to any depth)."
  [database-id]
  (loop [frontier (into #{} (map :id) (t2/query {:select [:id] :from [:report_card]
                                                 :where  [:= :database_id database-id]}))
         acc      #{}]
    (if (empty? frontier)
      acc
      (let [acc'  (into acc frontier)
            next* (into #{} (map :id) (t2/query {:select [:id] :from [:report_card]
                                                 :where  [:and [:in :source_card_id frontier]
                                                          [:not [:in :id acc']]]}))]
        (recur next* acc')))))

(defn- delete-sample-database-and-dependents!
  "Delete the sample database `sample-db-id` and everything that depends on it - its tables/fields, every
  Card whose query targets it (directly or transitively through source_card_id), those cards' dashcards,
  and Dashboards left empty as a result - even when that content was user-created, because it cannot work
  without the database.

  Children are deleted explicitly, bottom-up, rather than relying on ON DELETE CASCADE: MySQL 9.7 resolves
  multi-level cascade fan-outs incompletely, leaving orphaned rows that later break ALTER TABLE statements
  which re-validate foreign keys.

  The Example collections are left in place - the restore reuses them for the H2 sample content."
  [sample-db-id]
  (let [card-ids               (card-ids-depending-on-database sample-db-id)
        field-ids-q            {:select [:id]
                                :from   [:metabase_field]
                                :where  [:in :table_id {:select [:id]
                                                        :from   [:metabase_table]
                                                        :where  [:= :db_id sample-db-id]}]}
        affected-dashboard-ids (if (empty? card-ids)
                                 #{}
                                 (->> (t2/query {:select-distinct [:dashboard_id]
                                                 :from            [:report_dashboardcard]
                                                 :where           [:in :card_id card-ids]})
                                      (into #{} (map :dashboard_id))))]
    (when (seq card-ids)
      (t2/query {:delete-from :dashboardcard_series
                 :where       [:or
                               [:in :card_id card-ids]
                               [:in :dashboardcard_id {:select [:id]
                                                       :from   [:report_dashboardcard]
                                                       :where  [:in :card_id card-ids]}]]})
      (t2/query {:delete-from :report_dashboardcard :where [:in :card_id card-ids]})
      (t2/query {:delete-from :parameter_card
                 :where       [:or
                               [:in :card_id card-ids]
                               [:and [:= :parameterized_object_type "card"]
                                [:in :parameterized_object_id card-ids]]]})
      (t2/query {:delete-from :report_card :where [:in :id card-ids]}))
    (t2/query {:delete-from :dimension :where [:in :field_id field-ids-q]})
    (t2/query {:delete-from :metabase_field
               :where       [:in :table_id {:select [:id]
                                            :from   [:metabase_table]
                                            :where  [:= :db_id sample-db-id]}]})
    (t2/query {:delete-from :metabase_table :where [:= :db_id sample-db-id]})
    (t2/query {:delete-from :metabase_database :where [:= :id sample-db-id]})
    (when (seq affected-dashboard-ids)
      ;; A dashboard that depended on the sample DB is removed once no card-backed dashcard survives - even if
      ;; text/heading dashcards remain (the example dashboard is built entirely from sample cards plus headings).
      ;; A dashboard that still has a real card of its own (e.g. a user mixed in another card) is left alone.
      (let [non-empty (->> (t2/query {:select-distinct [:dashboard_id]
                                      :from            [:report_dashboardcard]
                                      :where           [:and [:in :dashboard_id affected-dashboard-ids]
                                                        [:not= :card_id nil]]})
                           (into #{} (map :dashboard_id)))
            empty-ids (remove non-empty affected-dashboard-ids)]
        (when (seq empty-ids)
          (t2/query {:delete-from :report_dashboardcard :where [:in :dashboard_id empty-ids]})
          (t2/query {:delete-from :dashboard_tab :where [:in :dashboard_id empty-ids]})
          (t2/query {:delete-from :parameter_card
                     :where       [:and [:= :parameterized_object_type "dashboard"]
                                   [:in :parameterized_object_id empty-ids]]})
          (t2/query {:delete-from :report_dashboard :where [:in :id empty-ids]}))))))

(defn restore-h2-sample-database-on-downgrade!
  "Remove the SQLite sample database and the content it leaves dangling, then restore the H2 sample
  database and its bundled Example content. The Example collections are reused (see
  [[example-content/restore-example-content-on-downgrade!]]), so any content a user filed into them
  survives. No-op if there is no SQLite sample database."
  []
  (when-let [sqlite-db-id (:id (t2/query-one {:select [:id]
                                              :from   [:metabase_database]
                                              :where  [:and [:= :is_sample true] [:= :engine "sqlite"]]}))]
    (delete-sample-database-and-dependents! sqlite-db-id)
    ;; Recreate the H2 sample database, mirroring the load-sample-content gating of a fresh install.
    (when (config/load-sample-content?)
      (let [details (impl/extract-sample-database-details! :h2)
            new-db  (first (t2/insert-returning-instances! :model/Database
                                                           :name    impl/sample-database-name
                                                           :details details
                                                           :engine  :h2
                                                           :is_sample true
                                                           :initial_sync_status "complete"))]
        (example-content/restore-example-content-on-downgrade! (:id new-db))))))
