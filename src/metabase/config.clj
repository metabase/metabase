(ns metabase.config)

(def app-defaults
  "Global application defaults"
  {:database-file "metabase.db"                             ; name of the local h2 database file
   :max-session-age (* 60 24 14)})                           ; session length in minutes