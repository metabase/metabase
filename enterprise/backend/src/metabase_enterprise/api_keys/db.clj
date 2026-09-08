(ns metabase-enterprise.api-keys.db
  "Application database queries for the enterprise api-keys module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn insert-usage-logs!
  "Insert the ApiKeyUsageLog `rows` as one batch."
  [rows]
  (t2/insert! :model/ApiKeyUsageLog rows))
