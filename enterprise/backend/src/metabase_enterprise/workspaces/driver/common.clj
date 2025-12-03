(ns metabase-enterprise.workspaces.driver.common
  "Common utilities for workspace isolation drivers."
  (:require
   [clojure.string :as str]
   [metabase.system.core :as system]))

;;;; Naming

;; re-using https://github.com/metabase/metabase/pull/61887/commits/c92e4a9cc451c61a13fef19ed9d6107873b17f07
;; (original ws isolation code)
(defn- instance-uuid-slug
  "Create a slug from the site UUID, taking the first character of each section."
  [site-uuid-string]
  (apply str (map first (str/split site-uuid-string #"-"))))

(defn isolation-schema-name
  "Generate schema/database name for workspace isolation following mb__isolation_<slug>_<workspace-id> pattern."
  [workspace-id]
  (assert (some? workspace-id))
  (let [instance-slug      (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str workspace-id) #"[^a-zA-Z0-9]" "_")]
    (format "mb__isolation_%s_%s" instance-slug clean-workspace-id)))

(defn isolated-table-name
  "Generate name for a table mirroring transform target table in the isolated database namespace."
  [{:keys [schema name] :as _source-table}]
  ;; the schema that original transform target lives in
  (format "%s__%s" schema name))

(defn isolation-user-name
  "Generate username for workspace isolation."
  [workspace-id]
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))]
    (format "mb_isolation_%s_%s" instance-slug workspace-id)))
