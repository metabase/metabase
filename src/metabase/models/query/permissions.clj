(ns metabase.models.query.permissions
  "Functions used to calculate the permissions needed to run a query based on old-style DATA ACCESS PERMISSIONS. The
  only thing that is subject to these sorts of checks are *ad-hoc* queries, i.e. queries that have not yet been saved
  as a Card. Saved Cards are subject to the permissions of the Collection to which they belong."
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.permissions.util :as perms.u]
   [metabase.query-analysis.native-query-analyzer :as nqa]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.server.middleware.session :as mw.session]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn perms-exception
  "Returns an ExceptionInfo instance containing data relevant for a permissions error."
  ([required-perms]
   (perms-exception (tru "You do not have permissions to run this query.") required-perms))

  ([message required-perms & [additional-ex-data]]
   (ex-info message
            (merge {:type                 qp.error-type/missing-required-permissions
                    :required-permissions required-perms
                    :actual-permissions   (data-perms/permissions-for-user api/*current-user-id*)
                    :permissions-error?   true}
                   additional-ex-data))))

;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

;; Is calculating permissions for queries complicated? Some would say so. Refer to this handy flow chart to see how
;; things get calculated.
;;
;;                         perms-set
;;                             |
;;                             |
;;                             |
;;      native query? <--------+---------> mbql query?
;;            ↓                                     ↓
;;    native-query-perms              legacy-mbql-required-perms
;;                                                  |
;;                         no source card  <--------+------> has source card
;;                                 ↓                            ↓
;;           {:perms/view-data {table-id :unrestricted}}  source-card-read-perms
;;

(mu/defn query->source-table-ids :- [:set [:or [:= ::native] ::lib.schema.id/table]]
  "Return a sequence of all Table IDs referenced by `query`. If it is a native query, we use the SQL parser
  to determine the referenced tables."
  [query :- :map]
  (set
   (flatten
    (lib.util.match/match query
      ;; if we come across a native query just put a placeholder (`::native`) there so we know we need to
      ;; add native permissions to the complete set below.
      (m :guard (every-pred map? :native))
      (->> (nqa/references-for-native query)
           :tables
           (map :table-id))

      (m :guard (every-pred map? #(pos-int? (:source-table %))))
      (cons
       (:source-table m)
       (query->source-table-ids (dissoc m :source-table)))))))

(def ^:dynamic *card-instances*
  "A map from card IDs to card instances with the collection_id (possibly nil).
  Useful when bulk loading cards from different databases."
  nil)

(mu/defn- card-instance :- [:and
                            (ms/InstanceOf :model/Card)
                            [:map [:collection_id [:maybe ms/PositiveInt]]]]
  [card-id :- ::lib.schema.id/card]
  (or (get *card-instances* card-id)
      (if (qp.store/initialized?)
        (when-let [{:keys [collection-id]} (lib.metadata/card (qp.store/metadata-provider) card-id)]
          (t2/instance :model/Card {:collection_id collection-id}))
        (t2/select-one [:model/Card :collection_id] :id card-id))
      (throw (Exception. (tru "Card {0} does not exist." card-id)))))

(mu/defn- source-card-read-perms :- [:set perms.u/PathSchema]
  "Calculate the permissions needed to run an ad-hoc query that uses a Card with `source-card-id` as its source
  query."
  [source-card-id :- ::lib.schema.id/card]
  (mi/perms-objects-set (card-instance source-card-id) :read))

(defn- preprocess-query [query]
  ;; ignore the current user for the purposes of calculating the permissions required to run the query. Don't want the
  ;; preprocessing to fail because current user doesn't have permissions to run it when we're not trying to run it at
  ;; all
  (mw.session/as-admin
    ((requiring-resolve 'metabase.query-processor.preprocess/preprocess) query)))

(defn- referenced-card-ids
  "Return the union of all the `::referenced-card-ids` sets anywhere in the query."
  [query]
  (let [all-ids (atom #{})]
    (walk/postwalk
     (fn [form]
       (when (map? form)
         (when-let [ids (not-empty (::referenced-card-ids form))]
           (swap! all-ids set/union ids)))
       form)
     query)
    (not-empty @all-ids)))

(defn- native-query-perms
  [query]
  (merge
   (let [table-ids (vec (query->source-table-ids query))]
     (when (seq table-ids)
       {:perms/create-queries (zipmap table-ids (repeat :query-builder-and-native))
        :perms/view-data      (zipmap table-ids (repeat :unrestricted))}))
   (when-let [card-ids (referenced-card-ids query)]
     {:paths (into #{}
                   (mapcat (fn [card-id]
                             (mi/perms-objects-set (card-instance card-id) :read)))
                   card-ids)})))

(defn- legacy-mbql-required-perms
  [query {:keys [throw-exceptions? already-preprocessed?]}]
  (try
    (let [query (mbql.normalize/normalize query)]
      ;; if we are using a Card as our source, our perms are that Card's (i.e. that Card's Collection's) read perms
      (if-let [source-card-id (qp.util/query->source-card-id query)]
        {:paths (source-card-read-perms source-card-id)}
        ;; otherwise if there's no source card then calculate perms based on the Tables referenced in the query
        (let [query     (cond-> query
                          (not already-preprocessed?) preprocess-query)
              table-ids (vec (query->source-table-ids query))]
          (when (seq table-ids)
            {:perms/create-queries (zipmap table-ids (repeat :query-builder))
             :perms/view-data      (zipmap table-ids (repeat :unrestricted))}))))
    ;; if for some reason we can't expand the Card (i.e. it's an invalid legacy card) just return a set of permissions
    ;; that means no one will ever get to see it
    (catch Throwable e
      (let [e (ex-info "Error calculating permissions for query"
                       {:query (or (u/ignore-exceptions (mbql.normalize/normalize query))
                                   query)}
                       e)]
        (if throw-exceptions? (throw e) (log/error e)))
      {:perms/create-queries {0 :query-builder}}))) ; table 0 will never exist

(defn- pmbql-required-perms
  "For pMBQL queries: for now, just convert it to legacy by running it thru the QP preprocessor, then hand off to the
  legacy implementation(s) of [[required-perms]]."
  [query perms-opts]
  (let [query        (lib/normalize query)
        ;; convert it to legacy by running it thru the QP preprocessor.
        legacy-query (preprocess-query query)]
    (assert (#{:query :native} (:type legacy-query))
            (format "Expected QP preprocessing to return legacy MBQL query, got: %s" (pr-str legacy-query)))
    (legacy-mbql-required-perms legacy-query perms-opts)))

(defn required-perms-for-query
  "Returns a map representing the permissions requried to run `query`. The map has the optional keys
  :paths (containing legacy permission paths), :perms/view-data, and :perms/create-queries."
  [query & {:as perms-opts}]
  (if (empty? query)
    {}
    (let [query-type (lib/normalized-query-type query)]
      (case query-type
        :query      (legacy-mbql-required-perms query perms-opts)
        :native     (native-query-perms query)
        :mbql/query (pmbql-required-perms query perms-opts)
        (throw (ex-info (tru "Invalid query type: {0}" query-type)
                        {:query query}))))))

(defn- has-perm-for-db?
  "Checks that the current user has at least `required-perm` for the entire DB specified by `db-id`."
  [perm-type required-perm gtap-perms db-id]
  (or
   (data-perms/at-least-as-permissive? perm-type
                                       (data-perms/full-db-permission-for-user api/*current-user-id* perm-type db-id)
                                       required-perm)
   (when gtap-perms
     (data-perms/at-least-as-permissive? perm-type gtap-perms required-perm))))

(defn- has-perm-for-table?
  "Checks that the current user has the permissions for tables specified in `table-id->perm`. This can be satisfied via
  the user's permissions stored in the database, or permissions in `gtap-table-perms` which are supplied by the
  row-level-restrictions QP middleware when sandboxing is in effect. Returns true if access is allowed, otherwise false."
  [perm-type table-id->required-perm gtap-table-perms db-id]
  (let [table-id->has-perm?
        (into {} (for [[table-id required-perm] table-id->required-perm]
                   [table-id (boolean
                              (or (data-perms/user-has-permission-for-table?
                                   api/*current-user-id*
                                   perm-type
                                   required-perm
                                   db-id
                                   table-id)
                                  (when-let [gtap-perm (if (keyword? gtap-table-perms)
                                                         ;; gtap-table-perms can be a keyword representing the DB permission...
                                                         gtap-table-perms
                                                         ;; ...or a map from table IDs to table permissions
                                                         (get gtap-table-perms table-id))]
                                    (data-perms/at-least-as-permissive? perm-type gtap-perm required-perm))))]))]
    (every? true? (vals table-id->has-perm?))))

(mu/defn has-perm-for-query? :- :boolean
  "Returns true when the query is accessible for the given perm-type and required-perms for individual tables, or the
  entire DB, false otherwise. Only throws if the permission format is incorrect."
  [{{gtap-perms :gtaps} ::perms, db-id :database :as _query} perm-type required-perms]
  (boolean
   (if-let [db-or-table-perms (perm-type required-perms)]
     ;; In practice, `view-data` will be defined at the table-level, and `create-queries` will either be table-level
     ;; or :query-builder-and-native for the entire DB. But we should enforce whatever `required-perms` are provided,
     ;; in case that ever changes.
     (cond
       (keyword? db-or-table-perms)
       (has-perm-for-db? perm-type db-or-table-perms (perm-type gtap-perms) db-id)

       (map? db-or-table-perms)
       (has-perm-for-table? perm-type db-or-table-perms (perm-type gtap-perms) db-id)

       :else
       (throw (ex-info (tru "Invalid permissions format") required-perms)))
     true)))

(defn check-data-perms
  "Checks whether the current user has sufficient view data and query permissions to run `query`. Returns `true` if the
  user has perms for the query, and throws an exception otherwise (exceptions can be disabled by setting
  `throw-exceptions?` to `false`).

  If the [:gtap ::perms] path is present in the query, these perms are implicitly granted to the current user."
  [{{gtap-perms :gtaps} ::perms, :as query} required-perms & {:keys [throw-exceptions?]
                                                              :or   {throw-exceptions? true}}]
  (try
    ;; Check any required v1 paths
    (when-let [paths (:paths required-perms)]
      (let [paths-excluding-gtap-paths (set/difference paths (:paths gtap-perms))]
        (or (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set* paths-excluding-gtap-paths)
            (throw (perms-exception paths)))))

    ;; Check view-data and create-queries permissions, for individual tables or the entire DB:
    (when (or (not (has-perm-for-query? query :perms/view-data required-perms))
              (not (has-perm-for-query? query :perms/create-queries required-perms)))
      (throw (perms-exception required-perms)))

    true
    (catch clojure.lang.ExceptionInfo e
      (if throw-exceptions?
        (throw e)
        false))))

(mu/defn can-run-query?
  "Return `true` if the current user has sufficient permissions to run `query`, and `false` otherwise."
  [query]
  (let [required-perms (required-perms-for-query query)]
    (check-data-perms query required-perms :throw-exceptions? false)))

(defn can-query-table?
  "Does the current user have permissions to run an ad-hoc query against the Table with `table-id`?"
  [database-id table-id]
  (can-run-query? {:database database-id
                   :type     :query
                   :query    {:source-table table-id}}))
