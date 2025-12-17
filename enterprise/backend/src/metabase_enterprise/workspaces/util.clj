(ns metabase-enterprise.workspaces.util
  (:require
   [clojure.string :as str]
   [metabase.system.core :as system]))

(defn assert-transform!
  "Test whether we support the given entity type within workspaces yet.
   Named for the only case we support currently, to make call sites assumptions more obvious."
  [entity-type]
  (when (not= "transform" (name entity-type))
    (throw (ex-info "Only transform entity type is supported"
                    {:status-code 400
                     :entity-type entity-type}))))

(defn assert-transforms!
  "Test that only supported types are given in the given list.
   Named for the only case we support currently, to make call sites assumptions more obvious."
  [entities]
  (when-let [other-types (seq (remove #{:transform} (map :entity-type entities)))]
    (throw (ex-info "Only transform entities are currently supported"
                    {:status-code       400
                     :unsupported-types other-types}))))

(defn- toposort-visit [node child->parents visited result]
  (cond
    (visited node) [visited result]
    :else (let [parents (child->parents node [])
                [visited' result'] (reduce (fn [[v r] p]
                                             (toposort-visit p child->parents v r))
                                           [(conj visited node) result]
                                           parents)]
            [visited' (conj result' node)])))

(defn toposort-dfs
  "Perform a topological sort using depth-first search.
   Takes a map from child nodes to their parent nodes (dependencies).
   Returns nodes in topological order (dependencies before dependents)."
  [child->parents]
  ;; TODO (Chris 2025-11-20): Detect cycles and throw an error. (In practice inputs will never be cyclic, but still.)
  (let [all-nodes (set (keys child->parents))]
    (loop [visited   #{}
           result    []
           remaining all-nodes]
      (if (empty? remaining)
        result
        (let [node (first remaining)
              [visited' result'] (toposort-visit node child->parents visited result)]
          (recur visited' result' (disj remaining node)))))))

;;; Naming

;; re-using https://github.com/metabase/metabase/pull/61887/commits/c92e4a9cc451c61a13fef19ed9d6107873b17f07
;; (original ws isolation code)
(defn- instance-uuid-slug
  "Create a slug from the site UUID, taking the first character of each section."
  [site-uuid-string]
  (->> (str/split site-uuid-string #"-")
       (map first)
       (apply str)))

;; WARNING: Changing this prefix requires backwards compatibility handling for existing workspaces.
;; The prefix is used to identify isolation namespaces in the database, and existing workspaces
;; will have namespaces created with the current prefix.
(def ^:private isolated-prefix "mb__isolation")

(defn isolation-namespace-name
  "Generate namespace/database name for workspace isolation following mb__isolation_<slug>_<workspace-id> pattern.
  Uses 'namespace' as the generic term that maps to 'schema' in Postgres, 'database' in ClickHouse, etc."
  [workspace]
  (assert (some? (:id workspace)) "Workspace must have an :id")
  (let [instance-slug      (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str (:id workspace)) #"[^a-zA-Z0-9]" "_")]
    (format "%s_%s_%s" isolated-prefix instance-slug clean-workspace-id)))

(defn isolated-table-name
  "Generate name for a table mirroring transform target table in the isolated database namespace.
   Returns schema__name when schema is present, or __name when schema is nil (to distinguish from global tables)."
  [schema name]
  ;; TODO: This naming scheme is not guaranteed to give a unique name, even if it's likely
  ;; to always be unique in practice. Consider adding a hash suffix or conflict detection
  ;; before merging to master.
  (if schema
    (format "%s__%s" schema name)
    (format "__%s" name)))

(defn isolation-user-name
  "Generate username for workspace isolation."
  [workspace]
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))]
    (format "%s_%s_%s" isolated-prefix instance-slug (:id workspace))))

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
