(ns metabase.models.query.permissions
  "Functions used to calculate the permissions needed to run a query based on old-style DATA ACCESS PERMISSIONS. The
  only thing that is subject to these sorts of checks are *ad-hoc* queries, i.e. queries that have not yet been saved
  as a Card. Saved Cards are subject to the permissions of the Collection to which they belong."
  (:require [clojure.tools.logging :as log]
            [metabase.api.common :as api]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [interface :as i]
             [permissions :as perms]
             [table :refer [Table]]]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

;; Is calculating permissions for queries complicated? Some would say so. Refer to this handy flow chart to see how
;; things get calculated.
;;
;;                   perms-set
;;                        |
;;                        |
;;                        |
;;   native query? <------+-----> mbql query?
;;         ↓                           ↓
;; adhoc-native-query-path     mbql-perms-path-set
;;                                      |
;;                no source card <------+----> has source card
;;                        ↓                          ↓
;;          tables->permissions-path-set   source-card-read-perms
;;                        ↓
;;                 table-query-path
;;

(s/defn ^:private query->source-table-ids :- #{(s/cond-pre (s/eq ::native) su/IntGreaterThanZero)}
  "Return a sequence of all Table IDs referenced by `query`."
  [query]
  (set
   (flatten
    (mbql.u/match query
      ;; if we come across a native query just put a placeholder (`::native`) there so we know we need to
      ;; add native permissions to the complete set below.
      (m :guard (every-pred map? :native))
      [::native]

      (m :guard (every-pred map? :source-table))
      (cons
       (:source-table m)
       (query->source-table-ids (dissoc m :source-table)))))))

(def ^:private PermsOptions
  "Map of options to be passed to the permissions checking functions."
  {:segmented-perms?                       s/Bool
   (s/optional-key :throw-exceptions?)     (s/maybe s/Bool)
   (s/optional-key :already-preprocessed?) s/Bool})

(def ^:private TableOrIDOrNativePlaceholder
  (s/cond-pre
   (s/eq ::native)
   su/IntGreaterThanZero))

(s/defn ^:private tables->permissions-path-set :- #{perms/ObjectPath}
  "Given a sequence of `tables-or-ids` referenced by a query, return a set of required permissions. A truthy value for
  `segmented-perms?` will return segmented permissions for the table rather that full table permissions."
  [database-or-id             :- (s/cond-pre su/IntGreaterThanZero su/Map)
   tables-or-ids              :- #{TableOrIDOrNativePlaceholder}
   {:keys [segmented-perms?]} :- PermsOptions]
  (let [table-ids           (filter integer? tables-or-ids)
        table-id->schema    (when (seq table-ids)
                              (db/select-id->field :schema Table :id [:in table-ids]))
        table-or-id->schema #(if (integer? %)
                               (table-id->schema %)
                               (:schema %))
        table-perms-fn      (if segmented-perms?
                              perms/table-segmented-query-path
                              perms/table-query-path)]
    (set (for [table-or-id tables-or-ids]
           (if (= ::native table-or-id)
             ;; Any `::native` placeholders from above mean we need native ad-hoc query permissions for this DATABASE
             (perms/adhoc-native-query-path database-or-id)
             ;; anything else (i.e., a normal table) just gets normal table permissions
             (table-perms-fn (u/get-id database-or-id)
                             (table-or-id->schema table-or-id)
                             (u/get-id table-or-id)))))))

(s/defn ^:private source-card-read-perms :- #{perms/ObjectPath}
  "Calculate the permissions needed to run an ad-hoc query that uses a Card with `source-card-id` as its source
  query."
  [source-card-id :- su/IntGreaterThanZero]
  (i/perms-objects-set (or (db/select-one ['Card :collection_id] :id source-card-id)
                           (throw (Exception. (tru "Card {0} does not exist." source-card-id))))
                       :read))

(defn- preprocess-query [query]
  ;; ignore the current user for the purposes of calculating the permissions required to run the query. Don't want the
  ;; preprocessing to fail because current user doesn't have permissions to run it when we're not trying to run it at
  ;; all
  (binding [api/*current-user-id* nil]
    ((resolve 'metabase.query-processor/query->preprocessed) query)))

(s/defn ^:private mbql-permissions-path-set :- #{perms/ObjectPath}
  "Return the set of required permissions needed to run an adhoc `query`.

  Also optionally specify `throw-exceptions?` -- normally this function avoids throwing Exceptions to avoid breaking
  things when a single Card is busted (e.g. API endpoints that filter out unreadable Cards) and instead returns 'only
  admins can see this' permissions -- `#{\"db/0\"}` (DB 0 will never exist, thus normal users will never be able to
  get permissions for it, but admins have root perms and will still get to see (and hopefully fix) it)."
  [query :- {:query su/Map, s/Keyword s/Any}
   {:keys [throw-exceptions? already-preprocessed?], :as perms-opts} :- PermsOptions]
  (try
    ;; if we are using a Card as our perms are that Card's (i.e. that Card's Collection's) read perms
    (if-let [source-card-id (qputil/query->source-card-id query)]
      (source-card-read-perms source-card-id)
      ;; otherwise if there's no source card then calculate perms based on the Tables referenced in the query
      (let [{:keys [query database]} (cond-> query
                                       (not already-preprocessed?) preprocess-query)]
        (tables->permissions-path-set database (query->source-table-ids query) perms-opts)))
    ;; if for some reason we can't expand the Card (i.e. it's an invalid legacy card) just return a set of permissions
    ;; that means no one will ever get to see it (except for superusers who get to see everything)
    (catch Throwable e
      (when throw-exceptions?
        (throw e))
      (log/error (tru "Error calculating permissions for query: {0}" (.getMessage e))
                 "\n"
                 (u/pprint-to-str (u/filtered-stacktrace e)))
      #{"/db/0/"})))                    ; DB 0 will never exist

(s/defn ^:private perms-set* :- #{perms/ObjectPath}
  "Does the heavy lifting of creating the perms set. `opts` will indicate whether exceptions should be thrown and
  whether full or segmented table permissions should be returned."
  [{query-type :type, database :database, :as query}, perms-opts :- PermsOptions]
  (cond
    (empty? query)                   #{}
    (= (keyword query-type) :native) #{(perms/adhoc-native-query-path database)}
    (= (keyword query-type) :query)  (mbql-permissions-path-set query perms-opts)
    :else                            (throw (Exception. (tru "Invalid query type: {0}" query-type)))))

(defn perms-set
  "Calculate the set of permissions required to run an ad-hoc `query`. Returns permissions for full table access (not
  segmented)"
  {:arglists '([query & {:keys [throw-exceptions? already-preprocessed?]}])}
  [query & {:as perms-opts}]
  (perms-set* query (assoc perms-opts :segmented-perms? false)))

(s/defn can-run-query?
  "Return `true` if the current-user has sufficient permissions to run `query`. Handles checking for full table
  permissions and segmented table permissions"
  [query]
  (let [user-perms @api/*current-user-permissions-set*]
    (perms/set-has-full-permissions-for-set? user-perms (perms-set query))))
