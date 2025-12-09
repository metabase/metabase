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

(defn isolation-namespace-name
  "Generate namespace/database name for workspace isolation following mb__isolation_<slug>_<workspace-id> pattern.
  Uses 'namespace' as the generic term that maps to 'schema' in Postgres, 'database' in ClickHouse, etc."
  [workspace]
  (assert (some? (:id workspace)) "Workspace must have an :id")
  (let [instance-slug      (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str (:id workspace)) #"[^a-zA-Z0-9]" "_")]
    (format "mb__isolation_%s_%s" instance-slug clean-workspace-id)))

(defn isolated-table-name
  "Generate name for a table mirroring transform target table in the isolated database namespace."
  [{:keys [schema name] :as _source-table}]
  ;; TODO: This naming scheme is not guaranteed to give a unique name, even if it's likely
  ;; to always be unique in practice. Consider adding a hash suffix or conflict detection
  ;; before merging to master.
  (format "%s__%s" schema name))

(defn isolation-user-name
  "Generate username for workspace isolation."
  [workspace]
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))]
    (format "mb_isolation_%s_%s" instance-slug (:id workspace))))

(def ^:private password-char-sets
  "Character sets for password generation. Cycles through these to ensure representation from each."
  ["ABCDEFGHJKLMNPQRSTUVWXYZ"
   "abcdefghjkmnpqrstuvwxyz"
   "123456789"
   "!#$%&*+-="])

(defn random-isolated-password
  "Generate a random password suitable for most database engines.
   Ensures the password contains characters from all sets (uppercase, lowercase, digits, special)
   by cycling through the character sets. Result is shuffled for randomness."
  []
  (->> (cycle password-char-sets)
       (take (+ 32 (rand-int 32)))
       (map rand-nth)
       shuffle
       (apply str)))
