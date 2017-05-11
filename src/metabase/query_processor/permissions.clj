(ns metabase.query-processor.permissions
  "Logic related to whether a given user has permissions to run/edit a given query."
  (:require [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.api.common :refer [*current-user-permissions-set*]]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]))

;;; ------------------------------------------------------------ Helper Fns ------------------------------------------------------------

(defn- log-permissions-debug-message {:style/indent 2} [color format-str & format-args]
  (let [appropriate-lock-emoji (if (= color 'yellow)
                                 "🔒"   ; lock (closed)
                                 "🔓")] ; lock (open
    (log/debug (u/format-color color (apply format (format "Permissions Check %s : %s" appropriate-lock-emoji format-str) format-args)))))

(defn- log-permissions-success-message {:style/indent 1} [format-string & format-args]
  (log-permissions-debug-message 'green (str "Yes ✅  " (apply format format-string format-args))))

;; DEPRECATED because to use this function we need to have an actual `Permissions` object instead of being able to use *current-user-permissions-set*.
;; Use `log-permissions-success-message` instead.
(defn- ^:deprecated log-permissions-success [user-id permissions]
  (log-permissions-success-message "because User %d is a member of Group %d (%s) which has permissions for '%s'"
    user-id
    (:group_id permissions)
    (db/select-one-field :name 'PermissionsGroup :id (:group_id permissions))
    (:object permissions)))

(defn- log-permissions-error []
  (log/warn (u/format-color 'red "Permissions Check 🔐 : No 🚫"))) ; lock (closed)

;; TODO - what status code / error message should we use when someone doesn't have permissions?
(defn- throw-permissions-exception [format-str & format-args]
  (log-permissions-error)
  (throw (Exception. ^String (apply format format-str format-args))))

;; DEPRECATED because we should just check it the "new" way instead: (perms/set-has-full-permissions? @*current-user-permissions-set* object-path)
(defn- ^:deprecated permissions-for-object
  "Return the first `Permissions` entry for USER-ID that grants permissions to OBJECT-PATH."
  [user-id object-path]
  {:pre [(integer? user-id) (perms/valid-object-path? object-path)]}
  (u/prog1 (db/select-one 'Permissions
             {:where [:and [:in :group_id (db/select-field :group_id 'PermissionsGroupMembership :user_id user-id)]
                           [:like object-path (hx/concat :object (hx/literal "%"))]]})
    (when <>
      (log-permissions-success user-id <>))))


;;; ------------------------------------------------------------ Permissions for MBQL queries ------------------------------------------------------------

;; TODO - All of this below should be rewritten to use `*current-user-permissions-set*` and `metabase.models.card/query-perms-set` instead.
;; The functions that need to be reworked are marked DEPRECATED below.

(defn- ^:deprecated user-can-run-query-referencing-table?
  "Does User with USER-ID have appropriate permissions to run an MBQL query referencing table with TABLE-ID?"
  [user-id table-id]
  {:pre [(integer? user-id) (integer? table-id)]}
  (let [{:keys [schema database-id]} (db/select-one ['Table [:db_id :database-id] :schema] :id table-id)]
    (permissions-for-object user-id (perms/object-path database-id schema table-id))))


(defn- ^:deprecated table-id [source-or-join-table]
  (or (:id source-or-join-table)
      (:table-id source-or-join-table)))

(defn- ^:deprecated table-identifier ^String [source-or-join-table]
  (name (hsql/qualify (:schema source-or-join-table) (or (:name source-or-join-table)
                                                         (:table-name source-or-join-table)))))


(defn- ^:deprecated throw-if-cannot-run-query-referencing-table [user-id table]
  (log-permissions-debug-message 'yellow "Can User %d access Table %d (%s)?" user-id (table-id table) (table-identifier table))
  (or (user-can-run-query-referencing-table? user-id (table-id table))
      (throw-permissions-exception "You do not have permissions to run queries referencing table '%s'." (table-identifier table))))

(defn- throw-if-cannot-run-query
  "Throw an exception if USER-ID doesn't have permissions to run QUERY."
  [user-id {:keys [source-table join-tables]}]
  (doseq [table (cons source-table join-tables)]
    (throw-if-cannot-run-query-referencing-table user-id table)))


;;; ------------------------------------------------------------ Permissions for Native Queries ------------------------------------------------------------

(defn- throw-if-user-doesnt-have-permissions-for-path
  "Check whether current user has permissions for OBJECT-PATH, and throw an exception if not.
   Log messages related to the permissions checks as well."
  [object-path]
  (log-permissions-debug-message 'yellow "Does user have permissions for %s?" object-path)
  (when-not (perms/set-has-full-permissions? @*current-user-permissions-set* object-path)
    (throw-permissions-exception "You do not have read permissions for %s." object-path))
  ;; permissions check out, now log which perms we've been granted that allowed our escapades to proceed
  (log-permissions-success-message "because user has permissions for %s." (some (fn [permissions-path]
                                                                                  (when (perms/is-permissions-for-object? permissions-path object-path)
                                                                                    permissions-path))
                                                                                @*current-user-permissions-set*)))

(defn throw-if-cannot-run-new-native-query-referencing-db
  "Throw an exception if User with USER-ID doesn't have native query *readwrite* permissions for DATABASE."
  [database-or-id]
  (throw-if-user-doesnt-have-permissions-for-path (perms/native-readwrite-path (u/get-id database-or-id))))

(defn- ^:deprecated throw-if-cannot-run-existing-native-query-referencing-db
  "Throw an exception if User with USER-ID doesn't have native query *read* permissions for DATABASE.
   (DEPRECATED because native read permissions are being eliminated in favor of Collection permissions.)"
  [database-or-id]
  (throw-if-user-doesnt-have-permissions-for-path (perms/native-read-path (u/get-id database-or-id))))

(defn- throw-if-user-doesnt-have-access-to-collection
  "Throw an exception if the current User doesn't have permissions to run a Card that is part of COLLECTION."
  [collection-id]
  (throw-if-user-doesnt-have-permissions-for-path (perms/collection-read-path collection-id)))


;;; ------------------------------------------------------------ Middleware ------------------------------------------------------------

(defn check-query-permissions
  "Check that User with USER-ID has permissions to run QUERY, or throw an exception."
  [user-id {query-type :type, database :database, query :query, {card-id :card-id} :info}]
  {:pre [(integer? user-id)]}
  (let [native?       (= (keyword query-type) :native)
        collection-id (db/select-one-field :collection_id 'Card :id card-id)]
    (cond
      ;; if the card is in a COLLECTION, then see if the current user has permissions for that collection
      collection-id
      (throw-if-user-doesnt-have-access-to-collection collection-id)
      ;; for native queries that are *not* part of an existing card, check that we have native permissions for the DB
      (and native? (not card-id))
      (throw-if-cannot-run-new-native-query-referencing-db database)
      ;; for native queries that *are* part of an existing card, just check if the have native read permissions (DEPRECATED)
      native?
      (throw-if-cannot-run-existing-native-query-referencing-db database)
      ;; for MBQL queries (existing card or not), check that we can run against the source-table. and each of the join-tables, if any
      (not native?)
      (throw-if-cannot-run-query user-id query))))
