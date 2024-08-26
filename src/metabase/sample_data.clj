(ns metabase.sample-data
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.models.database :refer [Database]]
   [metabase.plugins :as plugins]
   [metabase.sync :as sync]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.util.codec :as codec]
   [toucan2.core :as t2])
  (:import
   (java.net URL)))

(set! *warn-on-reflection* true)

(def ^:private ^String sample-database-name     "Sample Database")
(def ^:private ^String sample-database-filename "sample-database.db.mv.db")

;; Reuse the plugins directory for the destination to extract the sample database because it's pretty much guaranteed
;; to exist and be writable.
(defn- target-path
  []
  (u.files/append-to-path (plugins/plugins-dir) sample-database-filename))

(defn- process-sample-db-path
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
      process-sample-db-path))

(defn- extract-sample-database!
  []
  (u.files/with-open-path-to-resource [sample-db-path sample-database-filename]
    (let [dest-path (target-path)]
      (u.files/copy-file! sample-db-path dest-path)
      (-> (str "file:" dest-path)
          process-sample-db-path))))

(defn- try-to-extract-sample-database!
  "Tries to extract the sample database out of the JAR (for performance) and then returns a db-details map
   containing a path to the copied database."
  []
  (let [resource (io/resource sample-database-filename)]
    (when-not resource
      (throw (Exception. (trs "Sample database DB file ''{0}'' cannot be found."
                              sample-database-filename))))
    {:db
     (if-not (:temp (plugins/plugins-dir-info))
       (extract-sample-database!)
       (do
         ;; If the plugins directory is a temp directory, fall back to reading the DB directly from the JAR until a
         ;; working plugins directory is available. (We want to ensure the sample DB is in a stable location.)
         (log/warn (str "Sample database could not be extracted to the plugins directory,"
                        "which may result in slow startup times. "
                        "Please set MB_PLUGINS_DIR to a writable directory and restart Metabase."))
         (jar-db-details resource)))}))

(defn extract-and-sync-sample-database!
  "Adds the sample database as a Metabase DB if it doesn't already exist. If it does exist in the app DB,
  we update its details."
  []
  (try
    (log/info "Loading sample database")
    (let [details (try-to-extract-sample-database!)
          db (if (t2/exists? Database :is_sample true)
               (t2/select-one Database (first (t2/update-returning-pks! Database :is_sample true {:details details})))
               (first (t2/insert-returning-instances! Database
                                                      :name      sample-database-name
                                                      :details   details
                                                      :engine    :h2
                                                      :is_sample true)))]
      (log/debug "Syncing Sample Database...")
      (sync/sync-database! db))
    (log/debug "Finished adding Sample Database.")
    (catch Throwable e
      (log/error e "Failed to load sample database"))))

(defn update-sample-database-if-needed!
  "Update the path to the sample database DB if it exists in case the JAR has moved."
  ([]
   (update-sample-database-if-needed! (t2/select-one Database :is_sample true)))

  ([sample-db]
   (when sample-db
     (let [intended (try-to-extract-sample-database!)]
       (when (not= (:details sample-db) intended)
         (t2/update! Database (:id sample-db) {:details intended}))))))
