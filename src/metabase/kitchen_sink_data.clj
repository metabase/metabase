(ns metabase.kitchen-sink-data
  "Copied wholesale from `metabase.sample-data`"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.models.data-permissions.graph :as graph]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.plugins :as plugins]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.util.codec :as codec]
   [toucan2.core :as t2])
  (:import
   (java.net URL)))

(set! *warn-on-reflection* true)

(def ^:private ^String kitchen-sink-database-name     "The Kitchen-Sink Database")
(def ^:private ^String sample-database-filename "sample-database.db.mv.db")
(def ^:private ^String kitchen-sink-database-filename "kitchen-sink.db.mv.db")

;; Reuse the plugins directory for the destination to extract the kitchen-sink database because it's pretty much guaranteed
;; to exist and be writable.
(defn- target-path
  []
  (u.files/append-to-path (plugins/plugins-dir) kitchen-sink-database-filename))

(def kitchen-sync-dir
  "Directory in dev mode for the kitchen sink exports."
  (io/file "dev" "kitchen_sink"))

(defn- kitchen-sink-bundles []
  (.listFiles kitchen-sync-dir))

(defn kitchen-sink-collections
  "Returns a map of collection `entity_id`s to kitchen sink subdirectories (as `java.io.File`s).

  Intended to be used by update/insert hooks to keep the kitchen sink directories up to date."
  []
  (into {} (for [dir      (kitchen-sink-bundles)
                 col-file (.listFiles ^java.io.File (io/file dir "collections"))]
             (-> col-file
                 (.getName)
                 (subs 0 21) ; NanoIDs are always 21 characters
                 (vector dir)))))

(defn- process-kitchen-sink-db-path
  [base-path]
  (-> base-path
      (str/replace #"\.mv\.db$" "")        ; strip the .mv.db suffix from the path
      codec/url-decode                     ; for some reason the path can get URL-encoded so we decode it here
      (str ";USER=GUEST;PASSWORD=guest"))) ; specify the GUEST user account created for the DB

(defn- jar-db-details
  [^URL resource]
  (-> (.getPath resource)
      (str/replace #"^file:" "zip:") ; to connect to an H2 DB inside a JAR just replace file: with zip: (this doesn't
                                     ;   do anything when running from the Clojure CLI, which has no `file:` prefix)
      process-kitchen-sink-db-path))

(defn- extract-kitchen-sink-database!
  []
  (u.files/with-open-path-to-resource [kitchen-sink-db-path sample-database-filename]
    (let [dest-path (target-path)]
      (u.files/copy-file! kitchen-sink-db-path dest-path)
      (-> (str "file:" dest-path)
          process-kitchen-sink-db-path))))

(defn- try-to-extract-kitchen-sink-database!
  "Tries to extract the kitchen-sink database out of the JAR (for performance) and then returns a db-details map
   containing a path to the copied database."
  []
  (let [resource (io/resource sample-database-filename)]
    (when-not resource
      (throw (Exception. (trs "Kitchen-Sink database DB file ''{0}'' cannot be found."
                              sample-database-filename))))
    {:db
     (if-not (:temp (plugins/plugins-dir-info))
       (extract-kitchen-sink-database!)
       (do
         ;; If the plugins directory is a temp directory, fall back to reading the DB directly from the JAR until a
         ;; working plugins directory is available. (We want to ensure the kitchen-sink DB is in a stable location.)
         (log/warn (str "Kitchen-Sink database could not be extracted to the plugins directory,"
                        "which may result in slow startup times. "
                        "Please set MB_PLUGINS_DIR to a writable directory and restart Metabase."))
         (jar-db-details resource)))}))

(defn extract-and-sync-kitchen-sink-database!
  "Adds the kitchen-sink database as a Metabase DB if it doesn't already exist. If it does exist in the app DB,
  we update its details."
  []
  (try
    (log/info "Loading kitchen-sink database")
    (let [details (try-to-extract-kitchen-sink-database!)
          db (if (t2/exists? Database :name kitchen-sink-database-name)
               (t2/select-one Database (first (t2/update-returning-pks! Database :name kitchen-sink-database-name {:details details})))
               (first (t2/insert-returning-instances! Database
                                                      :name      kitchen-sink-database-name
                                                      :details   details
                                                      :engine    :h2)))]
      (log/debug "Syncing Kitchen-Sink Database...")

      (classloader/require 'metabase.sync)
      ((resolve 'metabase.sync/sync-database!) db))
    (log/debug "Finished adding Kitchen-Sink Database.")
    (catch Throwable e
      (log/error e "Failed to load kitchen-sink database"))))

(defn update-kitchen-sink-database-if-needed!
  "Update the path to the kitchen-sink database DB if it exists in case the JAR has moved."
  ([]
   (update-kitchen-sink-database-if-needed! (t2/select-one Database :is_kitchen-sink true)))

  ([kitchen-sink-db]
   (when kitchen-sink-db
     (let [intended (try-to-extract-kitchen-sink-database!)]
       (when (not= (:details kitchen-sink-db) intended)
         (t2/update! Database (:id kitchen-sink-db) {:details intended}))))))


(defn- upsert-user! [first-name last-name email]
  (if-let [user (t2/select-one :model/User :email email)]
    (:id user)
    (t2/insert-returning-pk! :model/User {:first_name first-name
                                          :last_name  last-name
                                          :email      email
                                          :password   "kitchensink1"})))

(defn- upsert-group-named!
  "Returns the group's `:id`."
  [group-name]
  (if (perms-group/exists-with-name? group-name)
    (t2/select-one-pk :model/PermissionsGroup :name group-name)
    (t2/insert-returning-pk! :model/PermissionsGroup {:name group-name})))

(defn- ensure-member-of-group! [user-id group-id]
  (when-not (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id)
    (t2/insert! :model/PermissionsGroupMembership {:user_id user-id :group_id group-id})))

(defn- block-all-users-for-db! [db-id]
  (graph/update-data-perms-graph!
    {:groups {(:id (perms-group/all-users)) {db-id {:create-queries :no
                                                    :view-data      :blocked}}}}))

(defn- assoc-login-attribute! [user-id attribute value]
  (let [existing-attributes (t2/select-one-fn :login_attributes :model/User :id user-id)
        adjusted            (assoc existing-attributes (name attribute) (str value))]
    (t2/update! :model/User :id user-id {:login_attributes adjusted})))

(defn upsert-kitchen-sink-users!
  "Ensures the standard set of groups and users is created.

  Runs **before** any kitchen sink bundle is imported, so the `creator` users exist.

  Groups:
  - Admin
  - Kitchen Sink Writers    Write access to everything
  - Kitchen Sink Readers    Read-only access to kitchen sink databases
  - Kitchen Sink Sandbox    Sandboxed access to kitchen sink databases

  Users:
  - (admin)                 The user's own account, User.ID = 1
  - somebody@kitchen.sink   A regular user - not an admin, but can do all the things to the data
  - notouchy@kitchen.sink   Read-only access to all the data
  - sandy@kitchen.sink      Sandboxed access to the Kitchen Sink DB (see below)

  Our sandboxed user can see all Products and Reviews, but can only see Orders with USER_ID=10.

  The password for all three users is kitchensink1"
  []
  (let [writers  (upsert-group-named! "Kitchen Sink Writers")
        readers  (upsert-group-named! "Kitchen Sink Readers")
        sandbox  (upsert-group-named! "Kitchen Sink Sandbox")
        somebody (upsert-user! "Some"  "Body"   "somebody@kitchen.sink")
        notouchy (upsert-user! "No"    "Touchy" "notouchy@kitchen.sink")
        sandy    (upsert-user! "Sandy" "Boxed"  "sandy@kitchen.sink")]
    (ensure-member-of-group! somebody writers)
    (ensure-member-of-group! notouchy readers)
    (ensure-member-of-group! sandy sandbox)
    ;; Set up sandboxed user Sandy with the right attribute.
    (assoc-login-attribute! sandy "kitchen_sink_id" "10")))

(defn set-kitchen-sink-perms!
  "Runs **after** the kitchen sink bundle is loaded, to set up permissions for possibly-new tables."
  [db-id]
  (let [sandbox (upsert-group-named! "Kitchen Sink Sandbox")
        orders  (t2/select-one :model/Table :db_id db-id :name "ORDERS")
        user-id (t2/select-one :model/Field :table_id (:id orders) :name "USER_ID")]
    (block-all-users-for-db! db-id) ;; Or sandboxing isn't meaningful!
    (classloader/require 'metabase-enterprise.sandbox.models.group-table-access-policy)
    ((resolve 'metabase-enterprise.sandbox.models.group-table-access-policy/upsert-sandboxes!)
     [{:group_id sandbox
       :table_id (:id orders)
       :card_id  nil
       :attribute_remappings
       {"kitchen_sink_id" [:dimension [:field (:id user-id) {:base_type :type/Integer}]]}}])))

(comment
  (upsert-kitchen-sink-users!)
  (set-kitchen-sink-perms! 2)
  )
