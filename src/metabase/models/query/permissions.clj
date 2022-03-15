(ns metabase.models.query.permissions
  "Functions used to calculate the permissions needed to run a query based on old-style DATA ACCESS PERMISSIONS. The
  only thing that is subject to these sorts of checks are *ad-hoc* queries, i.e. queries that have not yet been saved
  as a Card. Saved Cards are subject to the permissions of the Collection to which they belong."
  (:require [clojure.tools.logging :as log]
            [metabase.api.common :as api]
            [metabase.mbql.normalize :as normalize]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

;; Is calculating permissions for queries complicated? Some would say so. Refer to this handy flow chart to see how
;; things get calculated.
;;
;;                      perms-set
;;                           |
;;                           |
;;                           |
;;      native query? <------+-----> mbql query?
;;            ↓                           ↓
;;    adhoc-native-query-path     mbql-perms-path-set
;;                                         |
;;                   no source card <------+----> has source card
;;                           ↓                          ↓
;;             tables->permissions-path-set   source-card-read-perms
;;                           ↓
;;                    table-query-path
;;
;; `segmented-perms-set` follows the same graph as above, but instead of `table-query-path`, it returns
;; `table-segmented-query-path`. `perms-set` will require full access to the tables, `segmented-perms-set` will only
;; require segmented access

(s/defn query->source-table-ids :- #{(s/cond-pre (s/eq ::native) su/IntGreaterThanZero)}
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
  {(s/optional-key :segmented-perms?)      s/Bool
   (s/optional-key :throw-exceptions?)     (s/maybe s/Bool)
   (s/optional-key :already-preprocessed?) s/Bool
   (s/optional-key :table-perms-fn)        (s/pred fn?)
   (s/optional-key :native-perms-fn)        (s/pred fn?)})

(def ^:private TableOrIDOrNativePlaceholder
  (s/cond-pre
   (s/eq ::native)
   su/IntGreaterThanZero))

(s/defn tables->permissions-path-set :- #{perms/Path}
  "Given a sequence of `tables-or-ids` referenced by a query, return a set of required permissions. A truthy value for
  `segmented-perms?` will return segmented permissions for the table rather that full table permissions.

  Custom `table-perms-fn` and `native-perms-fn` can be passed as options to generate permissions paths for feature-level
  permissions."
  [database-or-id             :- (s/cond-pre su/IntGreaterThanZero su/Map)
   tables-or-ids              :- #{TableOrIDOrNativePlaceholder}
   {:keys [segmented-perms? table-perms-fn native-perms-fn]} :- PermsOptions]
  (let [table-ids           (filter integer? tables-or-ids)
        table-id->schema    (when (seq table-ids)
                              (db/select-id->field :schema Table :id [:in table-ids]))
        table-or-id->schema #(if (integer? %)
                               (table-id->schema %)
                               (:schema %))
        native-perms-fn     (or native-perms-fn perms/adhoc-native-query-path)
        table-perms-fn      (or table-perms-fn
                                (if segmented-perms?
                                  perms/table-segmented-query-path
                                  perms/table-query-path))]
    (set (for [table-or-id tables-or-ids]
           (if (= ::native table-or-id)
             ;; Any `::native` placeholders from above mean we need native ad-hoc query permissions for this DATABASE
             (native-perms-fn database-or-id)
             ;; anything else (i.e., a normal table) just gets normal table permissions
             (table-perms-fn (u/the-id database-or-id)
                             (table-or-id->schema table-or-id)
                             (u/the-id table-or-id)))))))

(s/defn ^:private source-card-read-perms :- #{perms/Path}
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

(s/defn ^:private mbql-permissions-path-set :- #{perms/Path}
  "Return the set of required permissions needed to run an adhoc `query`.

  Also optionally specify `throw-exceptions?` -- normally this function avoids throwing Exceptions to avoid breaking
  things when a single Card is busted (e.g. API endpoints that filter out unreadable Cards) and instead returns 'only
  admins can see this' permissions -- `#{\"db/0\"}` (DB 0 will never exist, thus normal users will never be able to
  get permissions for it, but admins have root perms and will still get to see (and hopefully fix) it)."
  [query :- {:query su/Map, s/Keyword s/Any}
   {:keys [throw-exceptions? already-preprocessed?], :as perms-opts} :- PermsOptions]
  (try
    (let [query (normalize/normalize query)]
      ;; if we are using a Card as our source, our perms are that Card's (i.e. that Card's Collection's) read perms
      (if-let [source-card-id (qputil/query->source-card-id query)]
        (source-card-read-perms source-card-id)
        ;; otherwise if there's no source card then calculate perms based on the Tables referenced in the query
        (let [{:keys [query database]} (cond-> query
                                         (not already-preprocessed?) preprocess-query)]
          (tables->permissions-path-set database (query->source-table-ids query) perms-opts))))
    ;; if for some reason we can't expand the Card (i.e. it's an invalid legacy card) just return a set of permissions
    ;; that means no one will ever get to see it (except for superusers who get to see everything)
    (catch Throwable e
      (let [e (ex-info "Error calculating permissions for query"
                       {:query (or (u/ignore-exceptions (normalize/normalize query))
                                   query)}
                       e)]
        (when throw-exceptions?
          (throw e))
        (log/error e))
      #{"/db/0/"})))                    ; DB 0 will never exist

(s/defn ^:private perms-set* :- #{perms/Path}
  "Does the heavy lifting of creating the perms set. `opts` will indicate whether exceptions should be thrown and
  whether full or segmented table permissions should be returned."
  [{query-type :type, database :database, :as query} perms-opts :- PermsOptions]
  (cond
    (empty? query)                   #{}
    (= (keyword query-type) :native) #{(perms/adhoc-native-query-path database)}
    (= (keyword query-type) :query)  (mbql-permissions-path-set query perms-opts)
    :else                            (throw (ex-info (tru "Invalid query type: {0}" query-type)
                                                     {:query query}))))

(defn segmented-perms-set
  "Calculate the set of permissions including segmented (not full) table permissions."
  {:arglists '([query & {:keys [throw-exceptions? already-preprocessed?]}])}
  [query & {:as perms-opts}]
  (perms-set* query (assoc perms-opts :segmented-perms? true)))

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
    (or (perms/set-has-full-permissions-for-set? user-perms (perms-set query))
        (perms/set-has-full-permissions-for-set? user-perms (segmented-perms-set query)))))

(defn can-query-table?
  "Does the current user have permissions to run an ad-hoc query against the Table with `table-id`?"
  [database-id table-id]
  (can-run-query? {:database database-id
                   :type     :query
                   :query    {:source-table table-id}}))
