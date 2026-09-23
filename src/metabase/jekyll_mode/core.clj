(ns metabase.jekyll-mode.core
  (:require
   [metabase.jekyll-mode.file-watcher :as file-watcher]
   [metabase.jekyll-mode.load :as load]
   [metabase.util.log :as log]))

(defn start!
  "Starts Jekyll mode: imports whatever is already on disk into the app DB, then watches for further
  changes.

  The import runs first, and synchronously. The watcher only reports changes from the moment it starts,
  so starting it before the catch-up import would leave a window in which a file edited while Metabase
  was down is neither imported nor noticed."
  []
  (try
    (load/import-all!)
    (catch Exception e
      ;; A broken export directory must not stop Metabase from starting.
      (log/error e "Jekyll mode: startup import failed; starting the file watcher anyway")))
  (file-watcher/start!))

(defn stop!
  "Stops Jekyll mode's file watcher."
  []
  (file-watcher/stop!))
