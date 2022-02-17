(ns ^:deprecated metabase.db.data-migrations
  "Clojure-land data migration definitions and fns for running them.
  These migrations are all ran once when Metabase is first launched, except when transferring data from an existing
  H2 database.  When data is transferred from an H2 database, migrations will already have been run against that data;
  thus, all of these migrations need to be repeatable, e.g.:

     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require [cemerick.friend.credentials :as creds]
            [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perm-group :refer [PermissionsGroup]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.user :refer [User]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
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
        (@migration-var)
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

;; Before 0.30.0, we were storing the LDAP user's password in the `core_user` table (though it wasn't used).  This
;; migration clears those passwords and replaces them with a UUID. This is similar to a new account setup, or how we
;; disable passwords for Google authenticated users
(defmigration ^{:author "senior", :added "0.30.0"} clear-ldap-user-local-passwords
  (db/transaction
    (doseq [user (db/select [User :id :password_salt] :ldap_auth [:= true])]
      (db/update! User (u/the-id user) :password (creds/hash-bcrypt (str (:password_salt user) (java.util.UUID/randomUUID)))))))

;; In 0.30 dashboards and pulses will be saved in collections rather than on separate list pages. Additionally, there
;; will no longer be any notion of saved questions existing outside of a collection (i.e. in the weird "Everything
;; Else" area where they can currently be saved).
;;
;; Consequently we'll need to move existing dashboards, pulses, and questions-not-in-a-collection to a new location
;; when users upgrade their instance to 0.30 from a previous version.
;;
;; The user feedback we've received points to a UX that would do the following:
;;
;; 1. Set permissions to the Root Collection to readwrite perms access for *all* Groups.
;;
;; 2. Create three new collections within the root collection: "Migrated dashboards," "Migrated pulses," and "Migrated
;;    questions."
;;
;; 3. The permissions settings for these new collections should be set to No Access for all user groups except
;;    Administrators.
;;
;; 4. Existing Dashboards, Pulses, and Questions from the "Everything Else" area should now be present within these
;;    new collections.
;;
(defmigration ^{:author "camsaul", :added "0.30.0"} add-migrated-collections
  (let [non-admin-group-ids (db/select-ids PermissionsGroup :id [:not= (u/the-id (perm-group/admin))])]
    ;; 1. Grant Root Collection readwrite perms to all Groups. Except for admin since they already have root (`/`)
    ;; perms, and we don't want to put extra entries in there that confuse things
    (doseq [group-id non-admin-group-ids]
      (perms/grant-collection-readwrite-permissions! group-id collection/root-collection))
    ;; 2. Create the new collections.
    (doseq [[model new-collection-name] {Dashboard (trs "Migrated Dashboards")
                                         Pulse     (trs "Migrated Pulses")
                                         Card      (trs "Migrated Questions")}
            :when                       (db/exists? model :collection_id nil)
            :let                        [new-collection (db/insert! Collection
                                                          :name  new-collection-name
                                                          :color "#509ee3")]] ; MB brand color
      ;; 3. make sure the non-admin groups don't have any perms for this Collection.
      (doseq [group-id non-admin-group-ids]
        (perms/revoke-collection-permissions! group-id new-collection))
      ;; 4. move everything not in this Collection to a new Collection
      (log/info (trs "Moving instances of {0} that aren''t in a Collection to {1} Collection {2}"
                     (name model) new-collection-name (u/the-id new-collection)))
      (db/update-where! model {:collection_id nil}
        :collection_id (u/the-id new-collection)))))

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

(defmigration ^{:author "dpsutton" :added "0.38.1"} migrate-click-through
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

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!    Please seriously consider whether any new migrations you write here could be written as Liquibase ones     !!
;; !!    (using preConditions where appropriate). Only add things here if absolutely necessary. If you do add       !!
;; !!    do add new ones here, please add them above this warning message, so people will see it in the future.     !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
