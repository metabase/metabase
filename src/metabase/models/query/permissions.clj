(ns metabase.models.query.permissions
  "Functions used to calculate the permissions needed to run a query based on old-style DATA ACCESS PERMISSIONS. The
  only thing that is subject to these sorts of checks are *ad-hoc* queries, i.e. queries that have not yet been saved
  as a Card. Saved Cards are subject to the permissions of the Collection to which they belong."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
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
;;                         perms-set
;;                             |
;;                             |
;;                             |
;;      native query? <--------+------- > mbql query?
;;            ↓                               ↓
;; {:perms/native-query-editing :yes}     mbql-required-perms
;;                                            |
;;                     no source card  <------+----> has source card
;;                             ↓                          ↓
;;               tables->permissions-path-set   source-card-read-perms
;;                             ↓
;;     {:perms/data-access {table-id :unrestricted}}

(mu/defn query->source-table-ids :- [:set [:or [:= ::native] ms/PositiveInt]]
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
  [:map
   [:segmented-perms?      {:optional true} :boolean]
   [:throw-exceptions?     {:optional true} [:maybe :boolean]]
   [:already-preprocessed? {:optional true} :boolean]
   [:table-perms-fn        {:optional true} fn?]
   [:native-perms-fn       {:optional true} fn?]])

(def ^:private TableOrIDOrNativePlaceholder
  [:or
   [:= ::native]
   ms/PositiveInt])

(mu/defn ^:private table-ids->id->schema :- [:maybe [:map-of ::lib.schema.id/table [:maybe :string]]]
  [table-ids :- [:maybe [:sequential ::lib.schema.id/table]]]
  (when (seq table-ids)
    (if (qp.store/initialized?)
      (into {}
            (map (fn [table-id]
                   ((juxt :id :schema) (lib.metadata/table (qp.store/metadata-provider) table-id))))
            table-ids)
      (t2/select-pk->fn :schema :model/Table :id [:in table-ids]))))

(mu/defn tables->permissions-path-set :- [:set perms.u/PathSchema]
  "Given a sequence of `tables-or-ids` referenced by a query, return a set of required permissions. A truthy value for
  `segmented-perms?` will return segmented permissions for the table rather that full table permissions.

  Custom `table-perms-fn` and `native-perms-fn` can be passed as options to generate permissions paths for feature-level
  permissions, such as download permissions."
  [database-or-id :- [:or ms/PositiveInt :map]
   tables-or-ids  :- [:set TableOrIDOrNativePlaceholder]
   {:keys [segmented-perms?
           table-perms-fn
           native-perms-fn]} :- PermsOptions]
  (let [table-ids           (filter integer? tables-or-ids)
        table-id->schema    (table-ids->id->schema table-ids)
        table-or-id->schema #(if (integer? %)
                               (table-id->schema %)
                               (:schema %))
        native-perms-fn     (or native-perms-fn perms/adhoc-native-query-path)
        table-perms-fn      (or table-perms-fn
                                (if segmented-perms?
                                  perms/table-sandboxed-query-path
                                  perms/table-query-path))]
    (set (for [table-or-id tables-or-ids]
           (if (= ::native table-or-id)
             ;; Any `::native` placeholders from above mean we need native ad-hoc query permissions for this DATABASE
             (native-perms-fn database-or-id)
             ;; anything else (i.e., a normal table) just gets normal table permissions
             (table-perms-fn (u/the-id database-or-id)
                             (table-or-id->schema table-or-id)
                             (u/the-id table-or-id)))))))

(mu/defn ^:private card-instance :- [:and
                                     (ms/InstanceOf :model/Card)
                                     [:map [:collection_id [:maybe ms/PositiveInt]]]]
  [card-id :- ::lib.schema.id/card]
  (or (if (qp.store/initialized?)
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

(defn- mbql-required-perms
  [query {:keys [throw-exceptions? already-preprocessed?]}]
  (try
    (let [query (mbql.normalize/normalize query)]
      ;; if we are using a Card as our source, our perms are that Card's (i.e. that Card's Collection's) read perms
      (if-let [source-card-id (qp.util/query->source-card-id query)]
        {:paths (source-card-read-perms source-card-id)}
        ;; otherwise if there's no source card then calculate perms based on the Tables referenced in the query
        (let [{:keys [query]}     (cond-> query
                                    (not already-preprocessed?) preprocess-query)
              table-ids-or-native (vec (query->source-table-ids query))
              table-ids           (filter integer? table-ids-or-native)
              native?             (.contains ^clojure.lang.PersistentVector table-ids-or-native ::native)]
          (merge
           (when (seq table-ids)
             {:perms/data-access (zipmap table-ids (repeat :unrestricted))})
           (when native?
             {:perms/native-query-editing :yes})))))
    ;; if for some reason we can't expand the Card (i.e. it's an invalid legacy card) just return a set of permissions
    ;; that means no one will ever get to see it
    (catch Throwable e
      (let [e (ex-info "Error calculating permissions for query"
                       {:query (or (u/ignore-exceptions (mbql.normalize/normalize query))
                                   query)}
                       e)]
        (if throw-exceptions? (throw e) (log/error e)))
      {:perms/data-access {0 :unrestricted}}))) ; table 0 will never exist

(defn required-perms
  "Returns a map representing the permissions requried to run `query`. The map has the optional keys
  :paths (containing legacy permission paths), :perms/data-access, and :perms/native-query-editing."
  [{query-type :type, :as query} & {:as perms-opts}]
  (cond
    (empty? query)                   {}
    (= (keyword query-type) :native) {:perms/native-query-editing :yes}
    (= (keyword query-type) :query)  (mbql-required-perms query perms-opts)
    :else                            (throw (ex-info (tru "Invalid query type: {0}" query-type)
                                                     {:query query}))))

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
    (when (= (:perms/native-query-editing required-perms) :yes)
      (or (= (:perms/native-query-editing gtap-perms) :yes)
          (= (data-perms/database-permission-for-user api/*current-user-id* :perms/native-query-editing db-id) :yes)
          (throw (perms-exception {db-id {:perms/native-query-editing :yes}}))))
    ;; Check for unrestricted data access to any tables referenced by the query
    (when-let [table-ids (:perms/data-access required-perms)]
      (doseq [[table-id _] table-ids]
        (or
         (= (get-in gtap-perms [:perms/data-access table-id]) :unrestricted)
         (= (data-perms/table-permission-for-user api/*current-user-id* :perms/data-access db-id table-id) :unrestricted)
         (throw (perms-exception {db-id {:perms/data-access {table-id :unrestricted}}})))))
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
