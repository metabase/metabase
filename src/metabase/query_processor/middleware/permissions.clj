(ns metabase.query-processor.middleware.permissions
  "Middleware for checking that the current user has permissions to run the current query."
  (:require
   [metabase.api.common
    :refer [*current-user-id* *current-user-permissions-set*]]
   [metabase.audit :as audit]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.interface :as mi]
   [metabase.models.query.permissions :as query-perms]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def ^:dynamic *card-id*
  "ID of the Card currently being executed, if there is one. Bind this in a Card-execution so we will use
  Card [Collection] perms checking rather than ad-hoc perms checking."
  nil)

(defn perms-exception
  "Returns an ExceptionInfo instance containing data relevant for a permissions error."
  ([required-perms]
   (perms-exception (tru "You do not have permissions to run this query.") required-perms))

  ([message required-perms & [additional-ex-data]]
   (ex-info message
            (merge {:type                 qp.error-type/missing-required-permissions
                    :required-permissions required-perms
                    :actual-permissions   (data-perms/permissions-for-user *current-user-id*)
                    :permissions-error?   true}
                   additional-ex-data))))

(defenterprise check-block-permissions
  "OSS implementation always returns `nil` because block permissions are an EE-only feature."
  metabase-enterprise.advanced-permissions.models.permissions.block-permissions
  [_query])

(mu/defn ^:private check-card-read-perms
  "Check that the current user has permissions to read Card with `card-id`, or throw an Exception. "
  [database-id :- ::lib.schema.id/database
   card-id     :- ::lib.schema.id/card]
  (qp.store/with-metadata-provider database-id
    (let [card (or (some-> (lib.metadata.protocols/card (qp.store/metadata-provider) card-id)
                           (update-keys u/->snake_case_en)
                           (vary-meta assoc :type :model/Card))
                   (throw (ex-info (tru "Card {0} does not exist." card-id)
                                   {:type    qp.error-type/invalid-query
                                    :card-id card-id})))]
      (log/tracef "Required perms to run Card: %s" (pr-str (mi/perms-objects-set card :read)))
      (when-not (mi/can-read? card)
        (throw (perms-exception (tru "You do not have permissions to view Card {0}." card-id)
                                (mi/perms-objects-set card :read)
                                {:card-id *card-id*}))))))

(def ^:dynamic *param-values-query*
  "Used to allow users looking at a dashboard to view (possibly chained) filters."
  false)

(defenterprise check-audit-db-permissions
  "OSS implementation always throws an exception since queries over the audit DB are not permitted."
  metabase-enterprise.audit-app.permissions
  [query]
  (throw (ex-info (tru "Querying this database requires the audit-app feature flag")
                  query)))

(defn remove-permissions-key
  "Pre-processing middleware. Removes the `::perms` key from the query. This is where we store important permissions
  information like perms coming from sandboxing (GTAPs). This is programatically added by middleware when appropriate,
  but we definitely don't want users passing it in themselves. So remove it if it's present."
  [query]
  (dissoc query ::query-perms/perms))

(mu/defn check-query-permissions*
  "Check that User with `user-id` has permissions to run `query`, or throw an exception."
  [{database-id :database, :as outer-query} :- [:map [:database ::lib.schema.id/database]]]
  (when *current-user-id*
    (log/tracef "Checking query permissions. Current user permissions = %s"
                (pr-str (data-perms/permissions-for-user *current-user-id*)))
    (when (= audit/audit-db-id database-id)
      (check-audit-db-permissions outer-query))
    (let [card-id (or *card-id* (:qp/source-card-id outer-query))
          required-perms (query-perms/required-perms-for-query outer-query :already-preprocessed? true)]
      (cond
        card-id
        (do
          (check-card-read-perms database-id card-id)
          (when-not (query-perms/check-data-perms outer-query required-perms :throw-exceptions? false)
            (check-block-permissions outer-query)))

        ;; set when querying for field values of dashboard filters, which only require
        ;; collection perms for the dashboard and not ad-hoc query perms
        *param-values-query*
        (when-not (query-perms/check-data-perms outer-query required-perms :throw-exceptions? false)
          (check-block-permissions outer-query))

        :else
        (do
          (query-perms/check-data-perms outer-query required-perms :throw-exceptions? true)
          ;; check perms for any Cards referenced by this query (if it is a native query)
          (doseq [{query :dataset-query} (lib/template-tags-referenced-cards
                                          (lib/query (qp.store/metadata-provider) outer-query))]
            (check-query-permissions* query)))))))

(defn check-query-permissions
  "Middleware that check that the current user has permissions to run the current query. This only applies if
  `*current-user-id*` is bound. In other cases, like when running public Cards or sending pulses, permissions need to
  be checked separately before allowing the relevant objects to be create (e.g., when saving a new Pulse or
  'publishing' a Card)."
  [qp]
  (fn [query rff]
    (check-query-permissions* query)
    (qp query rff)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Writeback fns                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn check-query-action-permissions*
  "Check that User with `user-id` has permissions to run query action `query`, or throw an exception."
  [{database-id :database, :as outer-query} :- [:map
                                                [:database ::lib.schema.id/database]
                                                [:type [:enum :query :native]]]]
  (log/tracef "Checking query permissions. Current user perms set = %s" (pr-str @*current-user-permissions-set*))
  (when *card-id*
    (check-card-read-perms database-id *card-id*))
  (when-not (query-perms/check-data-perms
             outer-query
             (query-perms/required-perms-for-query outer-query :already-preprocessed? true)
             :throw-exceptions? false)
    (check-block-permissions outer-query)))

(defn check-query-action-permissions
  "Middleware that check that the current user has permissions to run the current query action."
  [qp]
  (fn [query rff]
    (check-query-action-permissions* query)
    (qp query rff)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Non-middleware util fns                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn current-user-has-adhoc-native-query-perms?
  "If current user is bound, do they have ad-hoc native query permissions for `query`'s database? (This is used by
  [[metabase.query-processor.compile/compile]] and
  the [[metabase.query-processor.middleware.catch-exceptions/catch-exceptions]] middleware to check the user should be
  allowed to see the native query before converting the MBQL query to native.)"
  [{database-id :database, :as _query}]
  (or
   (not *current-user-id*)
   (= (data-perms/full-db-permission-for-user *current-user-id* :perms/create-queries database-id)
      :query-builder-and-native)))

(defn check-current-user-has-adhoc-native-query-perms
  "Check that the current user (if bound) has adhoc native query permissions to run `query`, or throw an
  Exception. (This is used by the `POST /api/dataset/native` endpoint to check perms before converting an MBQL query
  to native.)"
  [{database-id :database, :as query}]
  (when-not (current-user-has-adhoc-native-query-perms? query)
    (throw (perms-exception {database-id {:perms/create-queries :query-builder-and-native}}))))
