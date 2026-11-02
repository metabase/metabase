(ns metabase.prototype.init
  (:require
   [metabase.prototype.events]
   [metabase.prototype.filter-usage-seed]
   [metabase.prototype.semantic-layer]
   [metabase.prototype.settings]
   [metabase.prototype.setup :as prototype.setup]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]))

(defmethod startup/def-startup-logic! ::PrototypeData [_]
  ;; Seeding takes about a minute, so do it in the background instead of blocking startup.
  (quick-task/submit-task!
   (fn []
     (try
       (prototype.setup/ensure-prototype-data!)
       (catch Throwable e
         (log/error e "Prototype data: setup failed"))))))
