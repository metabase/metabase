(ns metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions
  "Apply segmented a.k.a. sandboxing anti-permissions to the query, i.e. replace sandboxed Tables with the
  appropriate [[metabase-enterprise.sandbox.models.group-table-access-policy]]s (GTAPs). See dox
  for [[metabase.models.permissions]] for a high-level overview of the Metabase permissions system."
  (:require
   [clojure.core.memoize :as memoize]
   [medley.core :as m]
   [metabase-enterprise.sandbox.api.util :as mt.api.u]
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :as gtap
    :refer [GroupTableAccessPolicy]]
   [metabase.api.common :as api :refer [*current-user* *current-user-id*]]
   [metabase.db.connection :as mdb.connection]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.card :refer [Card]]
   [metabase.models.field :refer [Field]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group-membership
    :refer [PermissionsGroupMembership]]
   [metabase.models.query.permissions :as query-perms]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.fetch-source-query
    :as fetch-source-query]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment mdb.connection/keep-me) ; used for [[memoize/ttl]]

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  query->gtap                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- all-table-ids [m]
  (set
   (reduce
    concat
    (mbql.u/match m
      (_ :guard (every-pred map? :source-table (complement ::gtap?)))
      (let [recursive-ids (all-table-ids (dissoc &match :source-table))]
        (cons (:source-table &match) recursive-ids))))))

(defn- query->all-table-ids [query]
  (let [ids (all-table-ids query)]
    (when (seq ids)
      (qp.store/fetch-and-store-tables! ids)
      (set ids))))

(defn assert-one-gtap-per-table
  "Make sure all referenced Tables have at most one GTAP."
  [gtaps]
  (doseq [[table-id gtaps] (group-by :table_id gtaps)
          :when            (> (count gtaps) 1)]
    (throw (ex-info (tru "Found more than one group table access policy for user ''{0}''"
                         (:email @*current-user*))
                    {:type      qp.error-type/client
                     :table-id  table-id
                     :gtaps     gtaps
                     :user      *current-user-id*
                     :group-ids (map :group_id gtaps)}))))

(defn- tables->sandboxes [table-ids]
  (qp.store/cached [*current-user-id* table-ids]
    (let [group-ids           (qp.store/cached *current-user-id*
                                (t2/select-fn-set :group_id PermissionsGroupMembership :user_id *current-user-id*))
          sandboxes           (when (seq group-ids)
                               (t2/select GroupTableAccessPolicy :group_id [:in group-ids]
                                 :table_id [:in table-ids]))
          enforced-sandboxes (mt.api.u/enforced-sandboxes sandboxes group-ids)]
       (when (seq enforced-sandboxes)
         (assert-one-gtap-per-table enforced-sandboxes)
         enforced-sandboxes))))

(defn- query->table-id->gtap [query]
  {:pre [(some? *current-user-id*)]}
  (let [table-ids (query->all-table-ids query)
        gtaps     (some-> table-ids tables->sandboxes)]
    (when (seq gtaps)
      (m/index-by :table_id gtaps))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Applying a GTAP                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private target-field->base-type :- (s/maybe su/FieldType)
  "If the `:target` of a parameter contains a `:field` clause, return the base type corresponding to the Field it
  references. Otherwise returns `nil`."
  [[_ target-field-clause]]
  (when-let [field-id (mbql.u/match-one target-field-clause [:field (field-id :guard integer?) _] field-id)]
    ;; TODO -- we should be using the QP store for this. But when trying to change this I ran into "QP Store is not
    ;; initialized" errors. We should figure out why that's the case and then fix this
    (t2/select-one-fn :base_type Field :id field-id)))

(defn- attr-value->param-value
  "Take an `attr-value` with a desired `target-type` and coerce to that type if need be. If not type is given or it's
  already correct, return the original `attr-value`"
  [target-type attr-value]
  (let [attr-string? (string? attr-value)]
    (cond
      ;; If the attr-value is a string and the target type is integer, parse it as a long
      (and attr-string? (isa? target-type :type/Integer))
      (Long/parseLong attr-value)
      ;; If the attr-value is a string and the target type is float, parse it as a double
      (and attr-string? (isa? target-type :type/Float))
      (Double/parseDouble attr-value)
      ;; No need to parse it if the type isn't numeric or if it's already a number
      :else
      attr-value)))

(defn- attr-remapping->parameter [login-attributes [attr-name target]]
  (let [attr-value      (get login-attributes attr-name)
        field-base-type (target-field->base-type target)]
    (when (not attr-value)
      (throw (ex-info (tru "Query requires user attribute `{0}`" (name attr-name))
                      {:type qp.error-type/missing-required-parameter})))
    {:type   :category
     :target target
     :value  (attr-value->param-value field-base-type attr-value)}))

(defn- gtap->parameters [{attribute-remappings :attribute_remappings}]
  (mapv (partial attr-remapping->parameter (:login_attributes @*current-user*))
        attribute-remappings))

(s/defn ^:private preprocess-source-query :- mbql.s/SourceQuery
  [source-query :- mbql.s/SourceQuery]
  (try
    (let [query        {:database (:id (qp.store/database))
                        :type     :query
                        :query    source-query}
          preprocessed (binding [*current-user-id* nil]
                         (classloader/require 'metabase.query-processor)
                         ((resolve 'metabase.query-processor/preprocess) query))]
      (select-keys (:query preprocessed) [:source-query :source-metadata]))
    (catch Throwable e
      (throw (ex-info (tru "Error preprocessing source query when applying GTAP: {0}" (ex-message e))
                      {:source-query source-query}
                      e)))))

(s/defn ^:private card-gtap->source
  [{card-id :card_id, :as gtap}]
  (update-in (fetch-source-query/card-id->source-query-and-metadata card-id)
             [:source-query :parameters]
             concat
             (gtap->parameters gtap)))

(defn- table-gtap->source [{table-id :table_id, :as gtap}]
  {:source-query {:source-table table-id, :parameters (gtap->parameters gtap)}})

(s/defn ^:private mbql-query-metadata :- (su/non-empty [su/Map])
  [inner-query]
  (binding [*current-user-id* nil]
    ((requiring-resolve 'metabase.query-processor/query->expected-cols)
     {:database (u/the-id (qp.store/database))
      :type     :query
      :query    inner-query})))

;; cache the original metadata for a little bit so we don't have to preprocess a query every time we apply sandboxing
(def ^:private ^{:arglists '([table-id])} original-table-metadata
  (memoize/ttl
   ^{::memoize/args-fn (fn [[table-id]]
                         [(mdb.connection/unique-identifier) table-id])}
   (fn [table-id]
     (mbql-query-metadata {:source-table table-id}))
   :ttl/threshold (u/minutes->ms 1)))

(s/defn ^:private reconcile-metadata :- (su/non-empty [su/Map])
  "Combine the metadata in `source-query-metadata` with the `table-metadata` from the Table being sandboxed."
  [source-query-metadata :- (su/non-empty [su/Map]) table-metadata]
  (let [col-name->table-metadata (m/index-by :name table-metadata)]
    (vec
     (for [col   source-query-metadata
           :let  [table-col (get col-name->table-metadata (:name col))]
           :when table-col]
       (do
         (gtap/check-column-types-match col table-col)
         table-col)))))

(s/defn ^:private native-query-metadata :- (su/non-empty [su/Map])
  [source-query :- {:source-query s/Any, s/Keyword s/Any}]
  (let [result (binding [*current-user-id* nil]
                 ((requiring-resolve 'metabase.query-processor/process-query)
                  {:database (u/the-id (qp.store/database))
                   :type     :query
                   :query    {:source-query source-query
                              :limit        0}}))]
    (or (-> result :data :results_metadata :columns not-empty)
        (throw (ex-info (tru "Error running query to determine metadata")
                        {:source-query source-query
                         :result       result})))))

(s/defn ^:private source-query-form-ensure-metadata :- {:source-query    s/Any
                                                        :source-metadata (su/non-empty [su/Map])
                                                        s/Keyword        s/Any}
  "Add `:source-metadata` to a `source-query` if needed. If the source metadata had to be resolved (because Card with
  `card-id`) didn't already have it, save it so we don't have to resolve it again next time around."
  [{:keys [source-metadata], :as source-query} :- {:source-query s/Any, s/Keyword s/Any}
   table-id                                    :- su/IntGreaterThanZero
   card-id                                     :- (s/maybe su/IntGreaterThanZero)]
  (let [table-metadata   (original-table-metadata table-id)
        ;; make sure source query has `:source-metadata`; add it if needed
        [metadata save?] (cond
                           ;; if it already has `:source-metadata`, we're good to go.
                           (seq source-metadata)
                           [source-metadata false]

                           ;; if it doesn't have source metadata, but it's an MBQL query, we can preprocess the query to
                           ;; get the expected metadata.
                           (not (get-in source-query [:source-query :native]))
                           [(mbql-query-metadata source-query) true]

                           ;; otherwise if it's a native query we'll have to run the query really quickly to get the
                           ;; expected metadata.
                           :else
                           [(native-query-metadata source-query) true])
        metadata (reconcile-metadata metadata table-metadata)]
    (assert (seq metadata))
    ;; save the result metadata so we don't have to do it again next time if applicable
    (when (and card-id save?)
      (log/tracef "Saving results metadata for GTAP Card %s" card-id)
      (t2/update! Card card-id {:result_metadata metadata}))
    ;; make sure the fetched Fields are present the QP store
    (when-let [field-ids (not-empty (filter some? (map :id metadata)))]
      (qp.store/fetch-and-store-fields! field-ids))
    (assoc source-query :source-metadata metadata)))


(s/defn ^:private gtap->source :- {:source-query                     s/Any
                                   (s/optional-key :source-metadata) [mbql.s/SourceQueryMetadata]
                                   s/Keyword                         s/Any}
  "Get the source query associated with a `gtap`."
  [{card-id :card_id, table-id :table_id, :as gtap} :- su/Map]
  (-> ((if card-id
         card-gtap->source
         table-gtap->source) gtap)
      preprocess-source-query
      (source-query-form-ensure-metadata table-id card-id)))

(defn- sandbox->table-ids
  "Returns the set of table IDs which are used by the given sandbox. These are the sandboxed table itself, as well as
  any linked tables referenced via fields in the attribute remappings. This is the set of tables which need to be
  excluded from subsequent permission checks in order to run the sandboxed query."
  [{table-id :table_id, attribute-remappings :attribute_remappings}]
  (->>
   (for [target-field-clause (vals attribute-remappings)]
     (mbql.u/match-one target-field-clause
                       [:field (field-id :guard integer?) _]
                       (t2/select-one-fn :table_id Field :id field-id)))
   (cons table-id)
   (remove nil?)
   set))

(s/defn ^:private sandbox->perms-set :- #{perms/PathSchema}
  "Calculate the set of permissions needed to run the query associated with a sandbox; this set of permissions is excluded
  during the normal QP perms check.

  Background: when applying sandboxing, we don't want the QP perms check middleware to throw an Exception if the Current
  User doesn't have permissions to run the underlying sandboxed query, which will likely be greater than what they
  actually have. (For example, a User might have sandboxed query perms for Table 15, which is why we're applying a
  sandbox in the first place; the actual perms required to normally run the underlying sandbox query is more likely
  something like *full* query perms for Table 15.) The QP perms check middleware subtracts this set from the set of
  required permissions, allowing the user to run their sandboxed query."
  [{card-id :card_id :as sandbox}]
  (if card-id
    (qp.store/cached card-id
      (query-perms/perms-set (t2/select-one-fn :dataset_query Card :id card-id), :throw-exceptions? true))
    (set (map perms/table-query-path (sandbox->table-ids sandbox)))))

(defn- sandboxes->perms-set [sandboxes]
  (set (mapcat sandbox->perms-set sandboxes)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------ apply-row-level-permissions -------------------------------------------

(defn- apply-gtap
  "Apply a GTAP to map m (e.g. a Join or inner query), replacing its `:source-table`/`:source-query` with the GTAP
  `:source-query`."
  [m gtap]
  ;; Only infer source query metadata for JOINS that use `:fields :all`. That's the only situation in which we
  ;; absolutely *need* to infer source query metadata (we need to know the columns returned by the source query so we
  ;; can generate the join against ALL fields). It's better not to infer the source metadata if we don't NEED to,
  ;; because we might be inferring the wrong thing. See comments above -- in practice a GTAP should have the same
  ;; columns as the Table it replaces, but this constraint is not enforced anywhere. If we infer metadata and the GTAP
  ;; turns out *not* to match exactly, the query could break. So only infer it in cases where the query would
  ;; definitely break otherwise.
  (u/prog1 (merge
            (dissoc m :source-table :source-query)
            (gtap->source gtap))
    (log/tracef "Applied GTAP: replaced\n%swith\n%s"
                (u/pprint-to-str 'yellow m)
                (u/pprint-to-str 'green <>))))

(defn- apply-gtaps
  "Replace `:source-table` entries that refer to Tables for which we have applicable GTAPs with `:source-query` entries
  from their GTAPs."
  [m table-id->gtap]
  ;; replace maps that have `:source-table` key and a matching entry in `table-id->gtap`, but do not have `::gtap?` key
  (mbql.u/replace m
    (_ :guard (every-pred map? (complement ::gtap?) :source-table #(get table-id->gtap (:source-table %))))
    (let [updated             (apply-gtap &match (get table-id->gtap (:source-table &match)))
          ;; now recursively apply gtaps anywhere else they might exist at this level, e.g. `:joins`
          recursively-updated (merge
                               (select-keys updated [:source-table :source-query])
                               (apply-gtaps (dissoc updated :source-table :source-query) table-id->gtap))]
      ;; add a `::gtap?` key next to every `:source-table` key so when we do a second pass after adding JOINs they
      ;; don't get processed again
      (mbql.u/replace recursively-updated
        (_ :guard (every-pred map? :source-table))
        (assoc &match ::gtap? true)))))

(defn- expected-cols [query]
  (binding [*current-user-id* nil]
    ((requiring-resolve 'metabase.query-processor/query->expected-cols) query)))

(defn- gtapped-query
  "Apply GTAPs to `query` and return the updated version of `query`."
  [original-query table-id->gtap]
  (let [sandboxed-query (apply-gtaps original-query table-id->gtap)]
    (if (= sandboxed-query original-query)
      original-query
      (-> sandboxed-query
          (assoc ::original-metadata (expected-cols original-query))
          (update-in [::qp.perms/perms :gtaps] (fn [perms] (into (set perms) (sandboxes->perms-set (vals table-id->gtap)))))))))

(def ^:private default-recursion-limit 20)
(def ^:private ^:dynamic *recursion-limit* default-recursion-limit)

(defn apply-sandboxing
  "Pre-processing middleware. Replaces source tables a User was querying against with source queries that (presumably)
  restrict the rows returned, based on presence of sandboxes."
  [query]
  (or (when-let [table-id->gtap (when *current-user-id*
                                  (query->table-id->gtap query))]
        (let [gtapped-query (gtapped-query query table-id->gtap)]
          (if (not= query gtapped-query)
            ;; Applying GTAPs to the query may have introduced references to tables that are also sandboxed,
            ;; so we need to recursively appby the middleware until new queries are not returned.
            (if (= *recursion-limit* 0)
              (throw (ex-info (trs "Reached recursion limit of {0} in \"apply-sandboxing\" middleware"
                                   default-recursion-limit)
                              query))
              (binding [*recursion-limit* (dec *recursion-limit*)]
                (apply-sandboxing gtapped-query)))
            gtapped-query)))
      query))


;;;; Post-processing

(defn- merge-metadata
  "Merge column metadata from the non-sandboxed version of the query into the sandboxed results `metadata`. This way the
  final results metadata coming back matches what we'd get if the query was not running in a sandbox."
  [original-metadata metadata]
  (letfn [(merge-cols [cols]
            (let [col-name->expected-col (m/index-by :name original-metadata)]
              (for [col cols]
                (merge
                 col
                 (get col-name->expected-col (:name col))))))]
    (update metadata :cols merge-cols)))

(defn merge-sandboxing-metadata
  "Post-processing middleware. Merges in column metadata from the original, unsandboxed version of the query."
  [{::keys [original-metadata]} rff]
  (if original-metadata
    (fn merge-sandboxing-metadata-rff* [metadata]
      (rff (merge-metadata original-metadata metadata)))
    rff))
