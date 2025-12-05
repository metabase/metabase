(ns mage.analytics
  "Mage commands for analytics development mode."
  (:require
   [clojure.java.io :as io]
   [mage.be-dev :as be-dev]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- ensure-backend-running! []
  (when-not (be-dev/nrepl-open?)
    (println (c/red "Error: Backend server is not running"))
    (u/exit 1)))

(defn setup!
  "Sets up analytics dev mode."
  []
  (println (c/bold "\n🔧 Setting up analytics dev mode...\n"))

  (ensure-backend-running!)

  (println "Enabling analytics-dev-mode setting...")
  (be-dev/nrepl-eval
   "metabase.audit-app.settings"
   "(analytics-dev-mode! true)")

  (println "\nTriggering analytics dev setup...")
  (let [result (be-dev/nrepl-eval
                "metabase-enterprise.audit-app.analytics-dev"
                "(let [admin-user (first-admin-user)
                       _ (when-not admin-user (throw (ex-info \"No admin user found\" {})))
                       _ (cleanup-real-analytics)
                       db (create-analytics-dev-database! (:id admin-user))
                       report (import-analytics-content! (:email admin-user))]
                   {:database-id (:id db)
                    :entities-loaded (count (:seen report))
                    :errors (count (:errors report))})")]

    (if result
      (do
        (println (c/green "\n✓ Analytics dev mode setup complete!"))
        (println (str "\n  Database ID: " (c/cyan (pr-str result))))
        (println "\n  You can now edit analytics content in your Metabase instance."))
      (do
        (println (c/red "\n✗ Analytics dev mode setup failed"))
        (u/exit 1)))))

(defn export!
  "Exports analytics content to resources/instance_analytics/"
  ([] (export! "resources/instance_analytics"))
  ([target-dir]
   (println (c/bold "\n📤 Exporting analytics content...\n"))

   (ensure-backend-running!)

   (println (str "Target directory: " (c/cyan target-dir)))

   ;; Ensure target directory exists and is empty
   (let [target-file (io/file target-dir)]
     (when (.exists target-file)
       (println (str "Cleaning existing directory: " target-dir))
       (doseq [file (reverse (file-seq target-file))]
         (.delete file)))
     (.mkdirs target-file))

   (println "\nFinding analytics collection...")
   (let [collection-id (be-dev/nrepl-eval
                        "metabase-enterprise.audit-app.analytics-dev"
                        "(:id (find-analytics-collection))")
         _ (when (= "nil" collection-id)
             (println (c/red "\n✗ Analytics collection not found. Did you run analytics:setup?"))
             (u/exit 1))
         _ (println (str "  Collection ID: " (c/cyan collection-id)))

         admin-email (be-dev/nrepl-eval
                      "metabase-enterprise.audit-app.analytics-dev"
                      "(:email (first-admin-user))")]

     (println "\nExporting analytics content...")
     (let [result (be-dev/nrepl-eval
                   "metabase-enterprise.audit-app.analytics-dev"
                   (format "(export-analytics-content! %s %s \"%s\")"
                           collection-id
                           admin-email
                           target-dir))]

       (if (and result (= :success (:status (read-string result))))
         (do
           (println (c/green "\n✓ Analytics content exported successfully!"))
           (println (str "\n  Location: " (c/cyan target-dir))))
         (do
           (println (c/red "\n✗ Export failed"))
           (println (str "  Result: " result))
           (u/exit 1)))))))

(defn teardown!
  "Tears down analytics dev mode."
  []
  (println (c/bold "\n🗑️  Tearing down analytics dev mode...\n"))

  (ensure-backend-running!)

  (println "Finding analytics dev database and collection...")
  (let [db-id (be-dev/nrepl-eval
               "metabase-enterprise.audit-app.analytics-dev"
               "(:id (find-analytics-dev-database))")
        collection-id (be-dev/nrepl-eval
                       "metabase-enterprise.audit-app.analytics-dev"
                       "(:id (find-analytics-collection))")]

    (when-not (= "nil" db-id)
      (println (str "\nDeleting analytics dev database (ID: " (c/cyan db-id) ")..."))
      (be-dev/nrepl-eval
       "metabase-enterprise.audit-app.analytics-dev"
       (format "(delete-analytics-dev-database! %s)" db-id))
      (println (c/green "  ✓ Database deleted")))

    (when-not (= "nil" collection-id)
      (println (str "\nDeleting analytics collection (ID: " (c/cyan collection-id) ")..."))
      (be-dev/nrepl-eval
       "toucan2.core"
       (format "(delete! :model/Collection :id %s)" collection-id))
      (println (c/green "  ✓ Collection deleted")))

    (println "\nDisabling analytics-dev-mode setting...")
    (be-dev/nrepl-eval
     "metabase.audit-app.settings"
     "(analytics-dev-mode! false)")
    (println (c/green "  ✓ Setting disabled"))

    (println "\nResetting up normal analytics database...")
    (be-dev/nrepl-eval
     "metabase.audit-app.settings"
     "(last-analytics-checksum! nil)")

    (be-dev/nrepl-eval
     "metabase-enterprise.audit-app.audit"
     "(ensure-audit-db-installed!)")
    (println (c/green "  ✓ Normal analytics database reset"))

    (println (c/green "\n✓ Analytics dev mode teardown complete!"))))
