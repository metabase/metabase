(ns ^:deprecated metabase.db.data-migrations
  "Clojure-land data migration definitions and fns for running them.
  Data migrations are run once when Metabase is first launched.
  Note that there is no locking mechanism for data-migration - thus upon launching Metabase, It's possible
  for a migration to be run multiple times (e.g: when running multiple Metabase instances).

  That said, these migrations should be idempotent, e.g:
     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require
   [cheshire.core :as json]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.setting :as setting :refer [Setting]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
       (t2/with-transaction [_conn]
        (@migration-var))
       (catch Exception e
         (if catch?
           (log/warn (format "Data migration %s failed: %s" migration-name (.getMessage e)))
           (throw e))))
      (t2/insert! DataMigrations
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
  (let [ran-migrations (t2/select-pks-set DataMigrations)]
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

;;; TODO -- this can just be done with vis settings versioning migrations from [[metabase.models.interface]] now
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
                (t2/update! DashboardCard id {:visualization_settings visualization_settings})))
             nil
             ;; flamber wrote a manual postgres migration that this faithfully recreates: see
             ;; https://github.com/metabase/metabase/issues/15014
             (mdb.query/query {:select [:dashcard.id
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
  (t2/select-one-fn :value Setting :key (name k)))

(defn- remove-admin-group-from-mappings-by-setting-key!
  [mapping-setting-key]
  (let [admin-group-id (:id (perms-group/admin))
        mapping        (try
                        (json/parse-string (raw-setting mapping-setting-key))
                        (catch Exception _e
                          {}))]
    (when-not (empty? mapping)
      (t2/update! Setting (name mapping-setting-key)
                  {:value
                   (->> mapping
                        (map (fn [[k v]] [k (filter #(not= admin-group-id %) v)]))
                        (into {})
                        json/generate-string)}))))

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

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!    Please seriously consider whether any new migrations you write here could be written as Liquibase ones     !!
;; !!    (using preConditions where appropriate). Only add things here if absolutely necessary. If you do add       !!
;; !!    do add new ones here, please add them above this warning message, so people will see it in the future.     !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
