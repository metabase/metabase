(ns ^:deprecated metabase.db.data-migrations
  "Clojure-land data migration definitions and fns for running them.
  Data migrations are run once when Metabase is first launched.
  Note that there is no locking mechanism for data-migration - thus upon launching Metabase, It's possible
  for a migration to be run multiple times (e.g: when running multiple Metabase instances).

  That said, these migrations should be idempotent, e.g:
     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.setting :as setting :refer [Setting]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

;;; # Migration Helpers

(models/defmodel ^:deprecated DataMigrations :data_migrations)

(defn- ^:deprecated run-migration-if-needed!
  "Run migration defined by `migration-var` if needed. `ran-migrations` is a set of migrations names that have already
  been run.

     (run-migration-if-needed! #{\"migrate-base-types\"} #'set-card-database-and-table-ids)

  Migrations may provide metadata with `:catch?` to indicate if errors should be caught or propagated."
  [ran-migrations migration-var]
  (let [{migration-name :name catch? :catch?} (meta migration-var)
        migration-name (name migration-name)]
    (when-not (contains? ran-migrations migration-name)
      (log/info (format "Running data migration '%s'..." migration-name))
      (try
       (db/transaction
        (@migration-var))
       (catch Exception e
         (if catch?
           (log/warn (format "Data migration %s failed: %s" migration-name (.getMessage e)))
           (throw e))))
      (db/insert! DataMigrations
        :id        migration-name
        :timestamp :%now))))

(def ^:private ^:deprecated data-migrations (atom []))

(defmacro ^:private ^:deprecated defmigration
  "Define a new data migration. This is just a simple wrapper around `defn-` that adds the resulting var to that
  `data-migrations` atom."
  [migration-name & body]
  `(do (defn- ~migration-name [] ~@body)
       (swap! data-migrations conj #'~migration-name)))

(defn ^:deprecated run-all!
  "Run all data migrations defined by `defmigration`."
  []
  (log/info "Running all necessary data migrations, this may take a minute.")
  (let [ran-migrations (db/select-ids DataMigrations)]
    (doseq [migration @data-migrations]
      (run-migration-if-needed! ran-migrations migration)))
  (log/info "Finished running data migrations."))

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
  (let [existing-fixed (fn [settings]
                         (-> settings
                             (m/update-existing "column_settings"
                                                (fn [column_settings]
                                                  (m/map-vals
                                                   #(select-keys % ["click_behavior"])
                                                   column_settings)))
                             ;; select click behavior top level and in column settings
                             (u/select-non-nil-keys ["column_settings" "click_behavior"])))
        fix-top-level  (fn [toplevel]
                         (if (= (get toplevel "click") "link")
                           (assoc toplevel
                                  ;; add new shape top level
                                  "click_behavior"
                                  {"type"         (get toplevel "click")
                                   "linkType"     "url"
                                   "linkTemplate" (get toplevel "click_link_template")})
                           toplevel))
        fix-cols       (fn [column-settings]
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
        fixed-card     (-> (if (contains? dashcard "click")
                             (dissoc card "click_behavior") ;; throw away click behavior if dashcard has click
                             ;; behavior added
                             (fix-top-level card))
                           (update "column_settings" fix-cols) ;; fix columns and then select only the new shape from
                           ;; the settings tree
                           existing-fixed)
        fixed-dashcard (update (fix-top-level dashcard) "column_settings" fix-cols)
        final-settings (->> (m/deep-merge fixed-card fixed-dashcard (existing-fixed dashcard))
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

(defmigration
  ^{:author "dpsutton"
    :added  "0.38.1"
    :doc    "Migration of old 'custom drill-through' to new 'click behavior'; see #15014"}
  migrate-click-through
  (transduce (comp (map (parse-to-json :card_visualization :dashcard_visualization))
                   (map fix-click-through)
                   (filter :visualization_settings))
             (completing
               (fn [_ {:keys [id visualization_settings]}]
                 (db/update! DashboardCard id :visualization_settings visualization_settings)))
             nil
             ;; flamber wrote a manual postgres migration that this faithfully recreates: see
             ;; https://github.com/metabase/metabase/issues/15014
             (db/query {:select [:dashcard.id
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

(defn- raw-setting
  "Get raw setting directly from DB.
  For some reasons during data-migration [[metabase.models.setting/get]] return the default value defined in
  [[metabase.models.setting/defsetting]] instead of value from Setting table."
  [k]
  (db/select-one-field :value Setting :key (name k)))

(defn- remove-admin-group-from-mappings-by-setting-key!
  [mapping-setting-key]
  (let [admin-group-id (:id (perms-group/admin))
        mapping        (try
                        (json/parse-string (raw-setting mapping-setting-key))
                        (catch Exception _e
                          {}))]
    (when-not (empty? mapping)
      (db/update! Setting (name mapping-setting-key)
                  :value
                  (->> mapping
                       (map (fn [[k v]] [k (filter #(not= admin-group-id %) v)]))
                       (into {})
                       json/generate-string)))))

(defmigration
  ^{:author "qnkhuat"
    :added  "0.43.0"
    :doc    "In the past we have a setting to disable group sync for admin group when using SSO or LDAP, but it's broken
            and haven't really worked (see #13820).
            In #20991 we remove this option entirely and make sync for admin group just like a regular group.
            But on upgrade, to make sure we don't unexpectedly begin adding or removing admin users:
              - for LDAP, if the `ldap-sync-admin-group` toggle is disabled, we remove all mapping for the admin group
              - for SAML, JWT, we remove all mapping for admin group, because they were previously never being synced
            if `ldap-sync-admin-group` has never been written, getting raw-setting will return a `nil`, and nil could
            also be interpreted as disabled. so checking `(not= x \"true\")` is safer than `(= x \"false\")`."}
  migrate-remove-admin-from-group-mapping-if-needed
  (when (not= (raw-setting :ldap-sync-admin-group) "true")
    (remove-admin-group-from-mappings-by-setting-key! :ldap-group-mappings))
  ;; sso are enterprise feature but we still run this even in OSS in case a customer
  ;; have switched from enterprise -> SSO and stil have this mapping in Setting table
  (remove-admin-group-from-mappings-by-setting-key! :jwt-group-mappings)
  (remove-admin-group-from-mappings-by-setting-key! :saml-group-mappings))

;; the goal here is to create a fn that will turn the table card 786 into an equivalent pivot table
;; 2 things need to happen:

;; 1. card :display key must go from :table -> :pivot
;; 2. card :visualization_settings key must be transformed to the appropriate shape

;; the :display key of the card is :table
;; the :table.pivot_column defines which card result column By NAME will be the table's columns. In this case, the table headers are each Category
;; the :table.cell_column defines which card result column by NAME will be the source of the values shown in cells
;; the rows of the table are implicitly the remaining series, which is the other column from the card result

(def example-table-viz
  {:table.pivot true
   :table.pivot_column "CATEGORY"
   :table.cell_column "count"})

;; the :pivot_table.column_split key contains a map with :rows :columns and :values
;; rows, columns, and values are all defined as a vector of column-data vectors (eg. [:field id {}] )

(def example-pivot-viz
  {:pivot_table.column_split
   {:rows [[:field 4 {:temporal-unit :month}]]
    :columns [[:field 26 {:source-field 5}]]
    :values [[:aggregation 0]]}})

;; the mappings that matter:
;; :table.pivot_column -> {:pivot_table.column_split {:columns [ column-data vector here]}}
;; :table.cell_column  -> {:pivot_table.column_split {:values  [ column-data vector here]}}
;; implicit pivot_row  -> {:pivot_table.column_split {:rows    [ column-data vector here]}}


;; helpers just for REPL-ing stuff,
;; to be removed if any of this gets merged

(def testing-card (atom nil))
(defn- keep-test-card [id]
  (reset! testing-card (into {} (db/select-one Card :id id))))

(defn- revert-test-card! [id]
  (db/update! Card id
    :display "table"
    :visualization_settings (:visualization_settings @testing-card)
    :result_metadata  (:result_metadata @testing-card)))

#_(keep-test-card 790)


;; migratin impl


(defn- col-name->col-field-ref
  [{:keys [result_metadata]} col-name]
  (->> result_metadata
       (filter #(= col-name (:name %)))
       first
       :field_ref))

(defn- pivot-row-name
  [{:keys [result_metadata]} pivot-col-and-cell-set]
  (->> result_metadata
       (filter #(not (pivot-col-and-cell-set (:name %))))
       first
       :name))

(defn- convert-table-pivot-tables
  "Converts any :table display pivot tables to :pivot based pivot tables. Changes the :visualization_settings to the expected shape."
  [{id           :id
    display      :display
    viz-settings :visualization_settings :as card}]
  (when (and (= display "table")
             (:table.pivot viz-settings))
    (let [{col-name :table.pivot_column
           val-name :table.cell_column}   viz-settings
          row-name                        (pivot-row-name card #{col-name val-name})
          [row-field col-field val-field] (map #(col-name->col-field-ref card %) [row-name col-name val-name])
          final-settings                  (-> viz-settings
                                              (dissoc :table.pivot :table.pivot_column :table.cell_column)
                                              (merge {:pivot_table.column_split
                                                      {:rows    [row-field]
                                                       :columns [col-field]
                                                       :values  [val-field]}}))]
      {:id                     id
       :display                "pivot"
       :visualization_settings final-settings})))

(defn- parse-from-json [& ks]
  (fn [x]
    (reduce #(update %1 %2 json/parse-string keyword)
            x
            ks)))

;; if you want to run this in your REPL, use this fn
;; just be careful because it will update your app-db, and will turn all tables that match the query into pivots
;; you could adjust the db/query to select only the card id you're testing with, if you want.

#_(defn convert-tables! []
  (db/transaction
    (transduce (comp (map (parse-from-json :visualization_settings :result_metadata))
                     (map convert-table-pivot-tables)
                     (filter :visualization_settings))
               (completing
                (fn [_ {:keys [id display visualization_settings]}]
                  (db/update! Card id :display display :visualization_settings visualization_settings)))
               nil
               (db/query {:select [:id :display :visualization_settings :result_metadata]
                          :from   [[:report_card :card]]
                          :where  [:and
                                   [:like
                                    :card.visualization_settings "%\"table.pivot\":true%"]
                                   [:like
                                    :card.display "table"]]}))))


(defmigration
  ^{:author "adam-james"
    :added  "0.45.0"
    :doc    "Cards with 'table' visualization can be toggled to a 'pivot-table' when there are 3 columns in the query results.
             Since there is already a more powerful and comprehensive Pivot Table visualization, this migration converts any
             such tables to pivot tables, by adjusting the visualization settings as well as the display key of the card."}
  migrate-tables-with-pivot-toggle-to-pivot-table []
  (db/transaction
    (transduce (comp (map (parse-from-json :visualization_settings :result_metadata))
                     (map convert-table-pivot-tables)
                     (filter :visualization_settings))
               (completing
                (fn [_ {:keys [id display visualization_settings]}]
                  (db/update! Card id :display display :visualization_settings visualization_settings)))
               nil
               (db/query {:select [:id :display :visualization_settings :result_metadata]
                          :from   [[:report_card :card]]
                          :where  [:and
                                   [:like
                                    :card.visualization_settings "%\"table.pivot\":true%"]
                                   [:like
                                    :card.display "table"]]}))))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!    Please seriously consider whether any new migrations you write here could be written as Liquibase ones     !!
;; !!    (using preConditions where appropriate). Only add things here if absolutely necessary. If you do add       !!
;; !!    do add new ones here, please add them above this warning message, so people will see it in the future.     !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
