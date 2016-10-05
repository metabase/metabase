(ns metabase.query-processor.permissions
  "Logic related to whether a given user has permissions to run/edit a given query."
  ;; TODO - everything in this namespace predates the newer implementations of Permissions checking on a model-by-model basis
  ;;        They essentially do the same thing. This has better logging but the other has more flexibilitiy.
  ;;        At some point we will need to merge the two approaches.
  (:require [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.db :as db]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]))


;;; ------------------------------------------------------------ Helper Fns ------------------------------------------------------------

(defn- log-permissions-debug-message {:style/indent 2} [color format-str & format-args]
  (let [appropriate-lock-emoji (if (= color 'yellow)
                                 "🔒"   ; lock (closed)
                                 "🔓")] ; lock (open
    (log/debug (u/format-color color (apply format (format "Permissions Check %s : %s" appropriate-lock-emoji format-str) format-args)))))

(defn- log-permissions-success [user-id permissions]
  (log-permissions-debug-message 'green "Yes ✅  because User %d is a member of Group %d (%s) which has permissions for '%s'"
    user-id
    (:group_id permissions)
    (db/select-one-field :name 'PermissionsGroup :id (:group_id permissions))
    (:object permissions)))

(defn- log-permissions-error []
  (log/error (u/format-color 'red "Permissions Check 🔐 : No 🚫"))) ; lock (closed)

;; TODO - what status code / error message should we use when someone doesn't have permissions?
(defn- throw-permissions-exception [format-str & format-args]
  (log-permissions-error)
  (throw (Exception. ^String (apply format format-str format-args))))

(defn- permissions-for-object [user-id object-path]
  {:pre [(integer? user-id) (perms/valid-object-path? object-path)]}
  (u/prog1 (db/select-one 'Permissions
             {:where [:and [:in :group_id (db/select-field :group_id 'PermissionsGroupMembership :user_id user-id)]
                      [:like object-path (hx/concat :object (hx/literal "%"))]]})
    (when <>
      (log-permissions-success user-id <>))))


;;; ------------------------------------------------------------ Permissions for MBQL queries ------------------------------------------------------------

;; TODO - the performance of this could be improved a bit by doing a join or even caching results
(defn user-can-run-query-referencing-table?
  "Does User with USER-ID have appropriate permissions to run an MBQL query referencing table with TABLE-ID?"
  [user-id table-id]
  {:pre [(integer? user-id) (integer? table-id)]}
  (let [{:keys [schema database-id]} (db/select-one ['Table [:db_id :database-id] :schema] :id table-id)]
    (permissions-for-object user-id (perms/object-path database-id schema table-id))))


(defn- table-id [source-or-join-table]
  (or (:id source-or-join-table)
      (:table-id source-or-join-table)))

(defn- table-identifier ^String [source-or-join-table]
  (name (hsql/qualify (:schema source-or-join-table) (or (:name source-or-join-table)
                                                         (:table-name source-or-join-table)))))


(defn- throw-if-cannot-run-query-referencing-table [user-id table]
  (log-permissions-debug-message 'yellow "Can User %d access Table %d (%s)?" user-id (table-id table) (table-identifier table))
  (or (user-can-run-query-referencing-table? user-id (table-id table))
      (throw-permissions-exception "You do not have permissions to run queries referencing table '%s'." (table-identifier table))))


;;; ------------------------------------------------------------ Permissions for Native Queries ------------------------------------------------------------

(defn throw-if-cannot-run-new-native-query-referencing-db
  "Throw an exception if User with USER-ID doesn't have native query *readwrite* permissions for DATABASE."
  [user-id {database-id :id, database-name :name}]
  {:pre [(integer? database-id)]}
  (log-permissions-debug-message 'yellow "Can User %d run *new* native queries against Database %d (%s)?" user-id database-id database-name)
  (or (permissions-for-object user-id (perms/native-readwrite-path database-id))
      (throw-permissions-exception "You do not have permissions to run new native queries against database '%s'." database-name)))


(defn- throw-if-cannot-run-existing-native-query-referencing-db
  "Throw an exception if User with USER-ID doesn't have native query *read* permissions for DATABASE."
  [user-id {database-id :id, database-name :name}]
  {:pre [(integer? database-id)]}
  (log-permissions-debug-message 'yellow "Can User %d run *existing* native queries against Database %d (%s)?" user-id database-id database-name)
  (or (permissions-for-object user-id (perms/native-read-path database-id))
      (throw-permissions-exception "You do not have permissions to run existing native queries against database '%s'." database-name)))


;;; ------------------------------------------------------------ Middleware ------------------------------------------------------------

(defn check-query-permissions
  "Check that User with USER-ID has permissions to run QUERY, or throw an exception."
  [user-id {query-type :type, database :database, {:keys [source-table join-tables]} :query, {card-id :card-id} :info}]
  {:pre [(integer? user-id)]}
  (let [native? (= (keyword query-type) :native)]
    (cond
      ;; for native queries that are *not* part of an existing card, check that we have native permissions for the DB
      (and native? (not card-id))
      (throw-if-cannot-run-new-native-query-referencing-db user-id database)
      ;; for native queries that *are* part of an existing card, no checks are done
      native?
      (throw-if-cannot-run-existing-native-query-referencing-db user-id database)
      ;; for MBQL queries, check that we can run against the source-table. and each of the join-tables, if any
      (not native?)
      (doseq [table (cons source-table join-tables)]
        (throw-if-cannot-run-query-referencing-table user-id table)))))
