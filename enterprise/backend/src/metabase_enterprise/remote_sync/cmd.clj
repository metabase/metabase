(ns metabase-enterprise.remote-sync.cmd
  "Remote sync's command-line entry points, run from the Metabase JAR (see [[metabase.cmd.core]])."
  (:require
   [metabase-enterprise.remote-sync.protocol.folder :as folder]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase.app-db.core :as mdb]
   [metabase.plugins.core :as plugins]
   [metabase.premium-features.core :as premium-features]
   [metabase.setup.core :as setup]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn folder-import!
  "Loads the serialized content in the directory at `path`, laid out as a remote sync repository is, into the app DB,
  creating or updating each entity and deleting nothing (see [[sync/import!]])."
  [path]
  (plugins/load-plugins!)
  (mdb/setup-db! :create-sample-content? false)
  (when-not (setup/has-user-setup)
    (throw (ex-info "You cannot import into an empty database. Please set up Metabase normally, then retry." {})))
  (premium-features/assert-has-feature :remote-sync (trs "Remote Sync"))
  (log/infof "Importing %s" path)
  (let [{{n :count} :outcome} (sync/import! (folder/source path) folder/version)]
    (log/infof "Imported %d entities from %s" n path)
    n))
