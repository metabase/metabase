(ns metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions
  (:require [clojure.tools.logging :as log]
            [metabase-enterprise.sandbox.models.group-table-access-policy :as gtap :refer [GroupTableAccessPolicy]]
            [metabase.api.common :as api :refer [*current-user* *current-user-id* *current-user-permissions-set*]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [permissions :as perms]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [table :refer [Table]]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.query-processor
             [error-type :as qp.error-type]
             [store :as qp.store]]
            [metabase.query-processor.middleware
             [annotate :as annotate]
             [fetch-source-query :as fetch-source-query]]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  query->gtap                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- all-table-ids [m]
  (set
   (reduce
    concat
    (mbql.u/match m
      (_ :guard (every-pred map? :source-table (complement :gtap?)))
      (let [recursive-ids (all-table-ids (dissoc &match :source-table))]
        (cons (:source-table &match) recursive-ids))))))

(defn- query->all-table-ids [query]
  (let [ids (all-table-ids query)]
    (when (seq ids)
      (qp.store/fetch-and-store-tables! ids)
      (set ids))))

(defn- table-should-have-segmented-permissions?
  "Determine whether we should apply segmented permissions for `table-or-table-id`."
  [table-id]
  (let [table (assoc (qp.store/table table-id) :db_id (u/get-id (qp.store/database)))]
    (and
     ;; User does not have full data access
     (not (perms/set-has-full-permissions? @*current-user-permissions-set* (perms/table-query-path table)))
     ;; User does have segmented access
     (perms/set-has-full-permissions? @*current-user-permissions-set* (perms/table-segmented-query-path table)))))

(defn- assert-one-gtap-per-table
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

(defn- tables->gtaps [table-ids]
  (qp.store/cached [*current-user-id* table-ids]
    (let [group-ids (qp.store/cached *current-user-id*
                      (db/select-field :group_id PermissionsGroupMembership :user_id *current-user-id*))
          gtaps     (when (seq group-ids)
                      (db/select GroupTableAccessPolicy
                        :group_id [:in group-ids]
                        :table_id [:in table-ids]))]
      (when (seq gtaps)
        (assert-one-gtap-per-table gtaps)
        gtaps))))

(defn- query->table-id->gtap [query]
  {:pre [(some? *current-user-id*)]}
  (when-let [gtaps (some->> (query->all-table-ids query)
                            ((comp seq filter) table-should-have-segmented-permissions?)
                            tables->gtaps)]
    (u/key-by :table_id gtaps)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Applying a GTAP                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private target-field->base-type :- (s/maybe su/FieldType)
  "If the `:target` of a parameter contains a `:field-id` clause, return the base type corresponding to the Field it
  references. Otherwise returns `nil`."
  [[_ target-field-clause]]
  (when-let [field-id (u/ignore-exceptions (mbql.u/field-clause->id-or-literal target-field-clause))]
    (when (integer? field-id)
      ;; TODO -- we should be using the QP store for this. But when trying to change this I ran into "QP Store is not
      ;; initialized" errors. We should figure out why that's the case and then fix this
      (db/select-one-field :base_type Field :id field-id))))

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
  (let [attr-value      (get login-attributes attr-name ::not-found)
        field-base-type (target-field->base-type target)]
    (when (= attr-value ::not-found)
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
  (let [query        {:database (:id (qp.store/database))
                      :type     :query
                      :query    source-query}
        preprocessed (binding [api/*current-user-id* nil]
                       ((resolve 'metabase.query-processor/query->preprocessed) query))]
    (select-keys (:query preprocessed) [:source-query :source-metadata])))

(s/defn ^:private card-gtap->source
  [{card-id :card_id, :as gtap}]
  (update-in (fetch-source-query/card-id->source-query-and-metadata card-id)
             [:source-query :parameters]
             concat
             (gtap->parameters gtap)))

(defn- table-gtap->source [{table-id :table_id, :as gtap}]
  {:source-query {:source-table table-id, :parameters (gtap->parameters gtap)}})

;; If a GTAP source query doesn't have results metadata for whatever reason, we can infer the results metadata by
;; running the query on its own for the User in question. We'll run the query with a `LIMIT 0`, so it doesn't return
;; any rows, but it should be enough to give us the relevant metadata for the result columns.
;;
;; Note that we only need to infer metadata in this fashion for situations where we're applying GTAPs to joined tables
;; and using `:fields :all` for that join -- we need to know the columns that are produced in order to build the
;; surrounding query correctly. (We probably could use `SELECT *`, but at this time we're always selecting every Field
;; individually)

(s/defn ^:private run-gtap-source-query-for-metadata :- [mbql.s/SourceQueryMetadata]
  [gtapped-table-id :- su/IntGreaterThanZero source-query :- mbql.s/SourceQuery]
  (let [query {:database (:id (qp.store/database))
               :type     :query
               :query    source-query}
        cols  (binding [api/*current-user-permissions-set* (atom #{"/"})]
                (-> ((resolve 'metabase.query-processor/process-query) (assoc query :limit 0))
                    :data :cols))]
    (u/prog1 (for [col cols]
               (select-keys col [:name :base_type :display_name :special_type]))
      (log/tracef "Inferred source query metadata:\n%s" (u/pprint-to-str 'magenta <>))
      ;; Make sure the columns returned when running a source query match up with those in the original Table. A GTAP
      ;; can *remove* columns from the original Table, but it cannot add new ones. Columns cannot change types
      ;; completely, but they can change to a type that is a descendant of the type in the original Table.
      (gtap/check-columns-match-table gtapped-table-id <>))))

;; This metadata will be the same regardless of what user runs the query in question, so we only need to run it once
;; for each GTAP Card; we can save it and reuse it after that point. `update-metadata-for-gtap!` takes care of that.

(defn- update-metadata-for-gtap!
  "Callback that saves results metadata for the Card associated with a GTAP if it does not already have it."
  [{card-id :card_id, gtap-id :id} new-metadata]
  (cond
    (not card-id)
    (log/tracef "Not updating metadata for GTAP %s: GTAP has no associated Card ID" gtap-id)

    (db/exists? Card :id card-id, :result_metadata [:not= nil])
    (log/tracef "Not updating metadata for GTAP %s Card %s: Card already has result metadata" gtap-id card-id)

    :else
    (do
      (log/tracef "Saving results metadata for GTAP %s Card %s" gtap-id card-id)
      (db/update! Card card-id :result_metadata new-metadata))))

(s/defn ^:private gtap->source :- {:source-query                     s/Any
                                   (s/optional-key :source-metadata) [mbql.s/SourceQueryMetadata]
                                   s/Keyword                         s/Any}
  "Get the source query associated with a `gtap`.

  `save-metadata!` is a callback function with the signature

    (save-metadata! result-metadata)

  that will be called if we end up running the GTAP source query in question to infer the metadata. This callback
  should save the metadata so we don't have to run the query again in the future."
  [{card-id :card_id, table-id :table_id, :as gtap} :- su/Map run-gtap-source-query-for-metadata?]
  (let [source-query            (preprocess-source-query ((if card-id card-gtap->source table-gtap->source) gtap))
        run-query-for-metadata? (and run-gtap-source-query-for-metadata? (empty? (:source-metadata source-query)))]
    (if-not run-query-for-metadata?
      source-query
      (let [metadata (run-gtap-source-query-for-metadata table-id source-query)]
        (update-metadata-for-gtap! gtap metadata)
        (assoc source-query :source-metadata metadata)))))

(s/defn ^:private gtap->perms-set :- #{perms/ObjectPath}
  "Calculate the set of permissions needed to run the query associated with a GTAP; this set of permissions is excluded
  during the normal QP perms check.

  Background: when applying GTAPs, we don't want the QP perms check middleware to throw an Exception if the Current
  User doesn't have permissions to run the underlying GTAP query, which will likely be greater than what they actually
  have. (For example, a User might have segmented query perms for Table 15, which is why we're applying a GTAP in the
  first place; the actual perms required to normally run the underlying GTAP query is more likely something like
  *full* query perms for Table 15.) The QP perms check middleware subtracts this set from the set of required
  permissions, allowing the user to run their GTAPped query."
  [{card-id :card_id, table-id :table_id}]
  (if card-id
    (qp.store/cached card-id
      (query-perms/perms-set (db/select-one-field :dataset_query Card :id card-id), :throw-exceptions? true))
    #{(perms/table-query-path (Table table-id))}))

(defn- gtaps->perms-set [gtaps]
  (set (mapcat gtap->perms-set gtaps)))


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
  (let [run-gtap-source-query-for-metadata? (= (:fields m) :all)]
    (u/prog1 (merge
              (dissoc m :source-table :source-query)
              (gtap->source gtap run-gtap-source-query-for-metadata?))
      (log/tracef "Applied GTAP: replaced\n%swith\n%s"
                  (u/pprint-to-str 'yellow m)
                  (u/pprint-to-str 'green <>)))))

(defn- apply-gtaps
  "Replace `:source-table` entries that refer to Tables for which we have applicable GTAPs with `:source-query` entries
  from their GTAPs."
  [m table-id->gtap]
  ;; replace maps that have `:source-table` key and a matching entry in `table-id->gtap`, but do not have `:gtap?` key
  (mbql.u/replace m
    (_ :guard (every-pred map? (complement :gtap?) :source-table #(get table-id->gtap (:source-table %))))
    (let [updated             (apply-gtap &match (get table-id->gtap (:source-table &match)))
          ;; now recursively apply gtaps anywhere else they might exist at this level, e.g. `:joins`
          recursively-updated (merge
                               (select-keys updated [:source-table :source-query])
                               (apply-gtaps (dissoc updated :source-table :source-query) table-id->gtap))]
      ;; add a `:gtap?` key next to every `:source-table` key so when we do a second pass after adding JOINs they
      ;; don't get processed again
      (mbql.u/replace recursively-updated
        (_ :guard (every-pred map? :source-table))
        (assoc &match :gtap? true)))))

(defn- id->col-info [query field-id]
  (when field-id
    (annotate/col-info-for-field-clause (:query query) [:field-id field-id])))

(defn- update-col-metadata [query field-name->id-delay {:keys [id source], field-ref :field_ref, field-name :name, :as col}]
  (let [id (or id (when (and (= (first field-ref) :field-literal)
                             field-name)
                    (get @field-name->id-delay field-name)))]
    (merge
     col
     (id->col-info query id)
     (when (= source :native)
       {:source :fields}))))

(defn- merge-metadata
  "Merge column metadata from the source Table into the current results `metadata`. This way the final results metadata
  coming back matches what we'd get if the query was not running with a GTAP."
  [query metadata]
  (let [source-table-id      (mbql.u/query->source-table-id query)
        field-name->id-delay (delay
                               (u/prog1 (when source-table-id
                                          (db/select-field->id :name Field :table_id source-table-id))
                                 (qp.store/fetch-and-store-fields! (vals <>))))]
    (update metadata :cols (fn [cols]
                             (mapv (partial update-col-metadata query field-name->id-delay) cols)))))

(defn- gtapped-query
  "Apply GTAPs to `query` and return the updated version of `query`."
  [query table-id->gtap]
  (-> query
      (apply-gtaps table-id->gtap)
      (update :gtap-perms (fn [perms]
                            (into (set perms) (gtaps->perms-set (vals table-id->gtap)))))))

(defn apply-row-level-permissions
  "Does the work of swapping the given table the user was querying against with a nested subquery that restricts the
  rows returned. Will return the original query if there are no segmented permissions found."
  [qp]
  (fn [query rff context]
    (if-let [table-id->gtap (when *current-user-id*
                              (query->table-id->gtap query))]
      (qp
       (gtapped-query query table-id->gtap)
       (fn [metadata]
         (rff (merge-metadata query metadata)))
       context)
      (qp query rff context))))
