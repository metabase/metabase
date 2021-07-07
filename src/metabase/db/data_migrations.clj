(ns metabase.db.data-migrations
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
            [metabase.db.util :as mdb.u]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.humanization :as humanization]
            [metabase.models.permissions :as perms :refer [Permissions]]
            [metabase.models.permissions-group :as perm-group :refer [PermissionsGroup]]
            [metabase.models.permissions-group-membership :as perm-membership :refer [PermissionsGroupMembership]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.setting :as setting :refer [Setting]]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]
            [toucan.models :as models])
  (:import java.util.UUID))

;;; # Migration Helpers

(models/defmodel DataMigrations :data_migrations)

(defn- run-migration-if-needed!
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

(def ^:private data-migrations (atom []))

(defmacro ^:private defmigration
  "Define a new data migration. This is just a simple wrapper around `defn-` that adds the resulting var to that
  `data-migrations` atom."
  [migration-name & body]
  `(do (defn- ~migration-name [] ~@body)
       (swap! data-migrations conj #'~migration-name)))

(defn run-all!
  "Run all data migrations defined by `defmigration`."
  []
  (log/info "Running all necessary data migrations, this may take a minute.")
  (let [ran-migrations (db/select-ids DataMigrations)]
    (doseq [migration @data-migrations]
      (run-migration-if-needed! ran-migrations migration)))
  (log/info "Finished running data migrations."))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 PERMISSIONS v1                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Add users to default permissions groups. This will cause the groups to be created if needed as well.
(defmigration ^{:author "camsaul", :added "0.20.0"} add-users-to-default-permissions-groups
  (let [{all-users-group-id :id} (perm-group/all-users)
        {admin-group-id :id}     (perm-group/admin)]
    (binding [perm-membership/*allow-changing-all-users-group-members* true]
      (doseq [{user-id :id, superuser? :is_superuser} (db/select [User :id :is_superuser])]
        (u/ignore-exceptions
          (db/insert! PermissionsGroupMembership
            :user_id  user-id
            :group_id all-users-group-id))
        (when superuser?
          (u/ignore-exceptions
            (db/insert! PermissionsGroupMembership
              :user_id  user-id
              :group_id admin-group-id)))))))

;; admin group has a single entry that lets it access to everything
(defmigration ^{:author "camsaul", :added "0.20.0"} add-admin-group-root-entry
  (binding [perms/*allow-admin-permissions-changes* true
            perms/*allow-root-entries* true]
    (u/ignore-exceptions
      (db/insert! Permissions
        :group_id (:id (perm-group/admin))
        :object   "/"))))

;; add existing databases to default permissions groups. default and metabot groups have entries for each individual
;; DB
(defmigration ^{:author "camsaul", :added "0.20.0"} add-databases-to-magic-permissions-groups
  (let [db-ids (db/select-ids Database)]
    (doseq [{group-id :id} [(perm-group/all-users)
                            (perm-group/metabot)]
            database-id    db-ids]
      (u/ignore-exceptions
        (db/insert! Permissions
          :object   (perms/object-path database-id)
          :group_id group-id)))))

;; Copy the value of the old setting `-site-url` to the new `site-url` if applicable.  (`site-url` used to be stored
;; internally as `-site-url`; this was confusing, see #4188 for details) This has the side effect of making sure the
;; `site-url` has no trailing slashes (as part of the magic setter fn; this was fixed as part of #4123)
(defmigration ^{:author "camsaul", :added "0.23.0"} copy-site-url-setting-and-remove-trailing-slashes
  (when-let [site-url (db/select-one-field :value Setting :key "-site-url")]
    (public-settings/site-url site-url)))

;; There's a window on in the 0.23.0 and 0.23.1 releases that the site-url could be persisted without a protocol
;; specified. Other areas of the application expect that site-url will always include http/https. This migration
;; ensures that if we have a site-url stored it has the current defaulting logic applied to it
(defmigration ^{:author "senior", :added "0.25.1"} ensure-protocol-specified-in-site-url
  (when-let [stored-site-url (db/select-one-field :value Setting :key "site-url")]
    (let [defaulted-site-url (public-settings/site-url stored-site-url)]
      (when (and stored-site-url
                 (not= stored-site-url defaulted-site-url))
        (setting/set! "site-url" stored-site-url)))))

;; There was a bug (#5998) preventing database_id from being persisted with native query type cards. This migration
;; populates all of the Cards missing those database ids
(defmigration ^{:author "senior", :added "0.27.0"} populate-card-database-id
  (doseq [[db-id cards] (group-by #(get-in % [:dataset_query :database])
                                  (db/select [Card :dataset_query :id :name] :database_id [:= nil]))
          :when (not= db-id mbql.s/saved-questions-virtual-database-id)]
    (if (and (seq cards)
             (db/exists? Database :id db-id))
      (db/update-where! Card {:id [:in (map :id cards)]}
                        :database_id db-id)
      (doseq [{id :id card-name :name} cards]
        (log/warnf "Cleaning up orphaned Question '%s', associated to a now deleted database" card-name)
        (db/delete! Card :id id)))))

;; Prior to version 0.28.0 humanization was configured using the boolean setting `enable-advanced-humanization`.
;; `true` meant "use advanced humanization", while `false` meant "use simple humanization". In 0.28.0, this Setting
;; was replaced by the `humanization-strategy` Setting, which (at the time of this writing) allows for a choice
;; between three options: advanced, simple, or none. Migrate any values of the old Setting, if set, to the new one.
(defmigration ^{:author "camsaul", :added "0.28.0"} migrate-humanization-setting
  (when-let [enable-advanced-humanization-str (db/select-one-field :value Setting, :key "enable-advanced-humanization")]
    (when (seq enable-advanced-humanization-str)
      ;; if an entry exists for the old Setting, it will be a boolean string, either "true" or "false". Try inserting
      ;; a record for the new setting with the appropriate new value. This might fail if for some reason
      ;; humanization-strategy has been set already, or enable-advanced-humanization has somehow been set to an
      ;; invalid value. In that case, fail silently.
      (u/ignore-exceptions
        (humanization/humanization-strategy (if (Boolean/parseBoolean enable-advanced-humanization-str)
                                              "advanced"
                                              "simple"))))
    ;; either way, delete the old value from the DB since we'll never be using it again.
    ;; use `simple-delete!` because `Setting` doesn't have an `:id` column :(
    (db/simple-delete! Setting {:key "enable-advanced-humanization"})))

;; Starting in version 0.29.0 we switched the way we decide which Fields should get FieldValues. Prior to 29, Fields
;; would be marked as special type Category if they should have FieldValues. In 29+, the Category special type no
;; longer has any meaning as far as the backend is concerned. Instead, we use the new `has_field_values` column to
;; keep track of these things. Fields whose value for `has_field_values` is `list` is the equiavalent of the old
;; meaning of the Category special type.
;;
;; Since the meanings of things has changed we'll want to make sure we mark all Category fields as `list` as well so
;; their behavior doesn't suddenly change.

;; Note that since v39 semantic_type became semantic_type. All of these migrations concern data from before this
;; change. Therefore, the migration is set to `:catch? true` and the old name is used. If the column is semantic then
;; the data shouldn't be bad.
(defmigration ^{:author "camsaul", :added "0.29.0", :catch? true} mark-category-fields-as-list
  (db/update-where! Field {:has_field_values nil
                           :semantic_type     (mdb.u/isa :type/Category)
                           :active           true}
    :has_field_values "list"))

;; In v0.30.0 we switiched to making standard SQL the default for BigQuery; up until that point we had been using
;; BigQuery legacy SQL. For a while, we've supported standard SQL if you specified the case-insensitive `#standardSQL`
;; directive at the beginning of your query, and similarly allowed you to specify legacy SQL with the `#legacySQL`
;; directive (although this was already the default). Since we're now defaulting to standard SQL, we'll need to go in
;; and add a `#legacySQL` directive to all existing BigQuery SQL queries that don't have a directive, so they'll
;; continue to run as legacy SQL.
(defmigration ^{:author "camsaul", :added "0.30.0"} add-legacy-sql-directive-to-bigquery-sql-cards
  ;; For each BigQuery database...
  (doseq [database-id (db/select-ids Database :engine "bigquery")]
    ;; For each Card belonging to that BigQuery database...
    (doseq [{query :dataset_query, card-id :id} (db/select [Card :id :dataset_query] :database_id database-id)]
      (try
        ;; If the Card isn't native, ignore it
        (when (= (keyword (:type query)) :native)
          ;; there apparently are cases where we have a `:native` query with no `:query`. See #8924
          (when-let [sql (get-in query [:native :query])]
            ;; if the Card already contains a #standardSQL or #legacySQL (both are case-insenstive) directive, ignore it
            (when-not (re-find #"(?i)#(standard|legacy)sql" sql)
              ;; if it doesn't have a directive it would have (under old behavior) defaulted to legacy SQL, so give it a
              ;; #legacySQL directive...
              (let [updated-sql (str "#legacySQL\n" sql)]
                ;; and save the updated dataset_query map
                (db/update! Card (u/the-id card-id)
                  :dataset_query (assoc-in query [:native :query] updated-sql))))))
        ;; if for some reason something above fails (as in #8924) let's log the error and proceed. It's not mission
        ;; critical that we migrate existing queries anyway, and for ones that are impossible to migrate (e.g. ones
        ;; that are invalid in the first place) it's best to fail gracefully and proceed rather than nuke someone's MB
        ;; instance
        (catch Throwable e
          (log/error e (trs "Error adding legacy SQL directive to BigQuery saved Question")))))))


;; Before 0.30.0, we were storing the LDAP user's password in the `core_user` table (though it wasn't used).  This
;; migration clears those passwords and replaces them with a UUID. This is similar to a new account setup, or how we
;; disable passwords for Google authenticated users
(defmigration ^{:author "senior", :added "0.30.0"} clear-ldap-user-local-passwords
  (db/transaction
    (doseq [user (db/select [User :id :password_salt] :ldap_auth [:= true])]
      (db/update! User (u/the-id user) :password (creds/hash-bcrypt (str (:password_salt user) (UUID/randomUUID)))))))


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
