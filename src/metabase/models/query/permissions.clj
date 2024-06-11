(ns metabase.models.query.permissions
  "Functions used to calculate the permissions needed to run a query based on old-style DATA ACCESS PERMISSIONS. The
  only thing that is subject to these sorts of checks are *ad-hoc* queries, i.e. queries that have not yet been saved
  as a Card. Saved Cards are subject to the permissions of the Collection to which they belong."
  (:require
   [clojure.set :as set]
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
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
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
;;                                  perms-set
;;                                      |
;;                                      |
;;                                      |
;;               native query? <--------+---------> mbql query?
;;                     ↓                                     ↓
;;    {:perms/create-queries :query-builder-and-native}  legacy-mbql-required-perms
;;                                                           |
;;                                  no source card  <--------+------> has source card
;;                                          ↓                            ↓
;;                    {:perms/view-data {table-id :unrestricted}}  source-card-read-perms
;;

(mu/defn query->source-table-ids :- [:set [:or [:= ::native] ::lib.schema.id/table]]
  "Return a sequence of all Table IDs referenced by `query`."
  [query :- :map]
  (set
   (flatten
    (lib.util.match/match query
      ;; if we come across a native query just put a placeholder (`::native`) there so we know we need to
      ;; add native permissions to the complete set below.
      (m :guard (every-pred map? :native))
      [::native]

      (m :guard (every-pred map? #(pos-int? (:source-table %))))
      (cons
       (:source-table m)
       (query->source-table-ids (dissoc m :source-table)))))))

(def ^:dynamic *card-instances*
  "A map from card IDs to card instances with the collection_id (possibly nil).
  Useful when bulk loading cards from different databases."
  nil)

(mu/defn ^:private card-instance :- [:and
                                     (ms/InstanceOf :model/Card)
                                     [:map [:collection_id [:maybe ms/PositiveInt]]]]
  [card-id :- ::lib.schema.id/card]
  (or (get *card-instances* card-id)
      (if (qp.store/initialized?)
        (when-let [{:keys [collection-id]} (lib.metadata/card (qp.store/metadata-provider) card-id)]
          (t2/instance :model/Card {:collection_id collection-id}))
        (t2/select-one [:model/Card :collection_id] :id card-id))
      (throw (Exception. (tru "Card {0} does not exist." card-id)))))

(mu/defn ^:private source-card-read-perms :- [:set perms.u/PathSchema]
  "Calculate the permissions needed to run an ad-hoc query that uses a Card with `source-card-id` as its source
  query."
  [source-card-id :- ::lib.schema.id/card]
  (mi/perms-objects-set (card-instance source-card-id) :read))

(defn- preprocess-query [query]
  ;; ignore the current user for the purposes of calculating the permissions required to run the query. Don't want the
  ;; preprocessing to fail because current user doesn't have permissions to run it when we're not trying to run it at
  ;; all
  (binding [api/*current-user-id* nil]
    ((requiring-resolve 'metabase.query-processor.preprocess/preprocess) query)))

(defn- legacy-mbql-required-perms
  [query {:keys [throw-exceptions? already-preprocessed?]}]
  (try
    (let [query (mbql.normalize/normalize query)]
      ;; if we are using a Card as our source, our perms are that Card's (i.e. that Card's Collection's) read perms
      (if-let [source-card-id (qp.util/query->source-card-id query)]
        {:paths (source-card-read-perms source-card-id)}
        ;; otherwise if there's no source card then calculate perms based on the Tables referenced in the query
        (let [query               (cond-> query
                                    (not already-preprocessed?) preprocess-query)
              table-ids-or-native (vec (query->source-table-ids query))
              table-ids           (filter integer? table-ids-or-native)
              native?             (.contains ^clojure.lang.PersistentVector table-ids-or-native ::native)]
          (merge
           {:perms/view-data :unrestricted}
           (when (seq table-ids)
             {:perms/create-queries (zipmap table-ids (repeat :query-builder))})
           (when native?
             {:perms/create-queries :query-builder-and-native})))))
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

(defn required-perms
  "Returns a map representing the permissions requried to run `query`. The map has the optional keys
  :paths (containing legacy permission paths), :perms/view-data, and :perms/create-queries."
  [query & {:as perms-opts}]
  (if (empty? query)
    {}
    (let [query-type (lib/normalized-query-type query)]
      (case query-type
        :native     {:perms/create-queries :query-builder-and-native
                     :perms/view-data :unrestricted}
        :query      (legacy-mbql-required-perms query perms-opts)
        :mbql/query (pmbql-required-perms query perms-opts)
        (throw (ex-info (tru "Invalid query type: {0}" query-type)
                        {:query query}))))))

(defn check-data-perms
  "Checks whether the current user has sufficient data permissions to run `query`. Returns `true` if the user has data
  perms for the query, and throws an exception otherwise (exceptions cna be disabled by setting `throw-exceptions?` to
  `false`).

  If the [:gtap ::perms] path is present in the query, these perms are implicitly granted to the current user."
  [{{gtap-perms :gtaps} ::perms, db-id :database} required-perms & {:keys [throw-exceptions?]
                                                                    :or   {throw-exceptions? true}}]
  (try
    ;; Check any required v1 paths
    (when-let [paths (:paths required-perms)]
      (let [paths-excluding-gtap-paths (set/difference paths (-> gtap-perms :paths))]
        (or (perms/set-has-full-permissions-for-set? @api/*current-user-permissions-set* paths-excluding-gtap-paths)
            (throw (perms-exception paths)))))
    ;; Check native query access if required
    (when (= (:perms/create-queries required-perms) :query-builder-and-native)
      (or (= (:perms/create-queries gtap-perms) :query-builder-and-native)
          (= (data-perms/full-db-permission-for-user api/*current-user-id* :perms/create-queries db-id) :query-builder-and-native)
          (throw (perms-exception {db-id {:perms/create-queries :query-builder-and-native}}))))
    (when (= (:perms/view-data required-perms) :unrestricted)
      (or (= (:perms/view-data gtap-perms) :unrestricted)
          (= :unrestricted (data-perms/full-db-permission-for-user api/*current-user-id* :perms/view-data db-id))
          (throw (perms-exception {db-id {:perms/view-data :unrestricted}}))))
    (when-let [table-id->perm (and (coll? (:perms/create-queries required-perms))
                                   (:perms/create-queries required-perms))]
      (doseq [[table-id _] table-id->perm]
        (or
         (contains? #{:query-builder :query-builder-and-native}
                    (get-in gtap-perms [:perms/create-queries table-id]))
         (data-perms/user-has-permission-for-table?
          api/*current-user-id*
          :perms/create-queries
          :query-builder
          db-id
          table-id)
         (throw (perms-exception {db-id {:perms/create-queries {table-id :query-builder}}})))))
    true
    (catch clojure.lang.ExceptionInfo e
      (if throw-exceptions?
        (throw e)
        false))))

(mu/defn can-run-query?
  "Return `true` if the current-user has sufficient permissions to run `query`, and `false` otherwise."
  [query]
  (let [required-perms (required-perms query)]
    (check-data-perms query required-perms :throw-exceptions? false)))

(defn can-query-table?
  "Does the current user have permissions to run an ad-hoc query against the Table with `table-id`?"
  [database-id table-id]
  (can-run-query? {:database database-id
                   :type     :query
                   :query    {:source-table table-id}}))
