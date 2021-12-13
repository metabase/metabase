(ns metabase.query-processor.middleware.permissions
  "Middleware for checking that the current user has permissions to run the current query."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.models.card :refer [Card]]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.query.permissions :as query-perms]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.resolve-referenced :as qp.resolve-referenced]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:dynamic *card-id*
  "ID of the Card currently being executed, if there is one. Bind this in a Card-execution context so we will use
  Card [Collection] perms checking rather than ad-hoc perms checking."
  nil)

(defn- perms-exception
  ([required-perms]
   (perms-exception (tru "You do not have permissions to run this query.") required-perms))

  ([message required-perms & [additional-ex-data]]
   (ex-info message
            (merge {:type                 error-type/missing-required-permissions
                    :required-permissions required-perms
                    :actual-permissions   @*current-user-permissions-set*
                    :permissions-error?   true}
                   additional-ex-data))))

(def ^:private ^{:arglists '([query])} check-block-permissions
  "Assert that block permissions are not in effect for Database for a query that's only allowed to run because of
  Collection perms; throw an Exception if they are. Otherwise returns a keyword explaining why the check wasn't done,
  or why it succeeded (this is mostly for test/debug purposes). The query is still allowed to run if the current User
  has appropriate data permissions from another Group. See the namespace documentation
  for [[metabase.models.collection]] for more details.

  Note that this feature is Metabase© Enterprise Edition™ only. Actual implementation is
  in [[metabase-enterprise.advanced-permissions.models.permissions.block-permissions/check-block-permissions]] if EE code is
  present. This feature is only enabled if we have a valid Enterprise Edition™ token."
  (let [dlay (delay
               (u/ignore-exceptions
                 (classloader/require 'metabase-enterprise.advanced-permissions.models.permissions.block-permissions)
                 (resolve 'metabase-enterprise.advanced-permissions.models.permissions.block-permissions/check-block-permissions)))]
    (fn [query]
      (when-let [f @dlay]
        (f query)))))

(s/defn ^:private check-card-read-perms
  "Check that the current user has permissions to read Card with `card-id`, or throw an Exception. "
  [card-id :- su/IntGreaterThanZero]
  (let [{collection-id :collection_id, :as card} (or (db/select-one [Card :collection_id] :id card-id)
                                                     (throw (ex-info (tru "Card {0} does not exist." card-id)
                                                                     {:type    error-type/invalid-query
                                                                      :card-id card-id})))]
    (log/tracef "Required perms to run Card: %s" (pr-str (mi/perms-objects-set card :read)))
    (when-not (mi/can-read? card)
      (throw (perms-exception (tru "You do not have permissions to view Card {0}." card-id)
                              (mi/perms-objects-set card :read)
                              {:card-id *card-id*})))))

(declare check-query-permissions*)

(defn- required-perms
  {:arglists '([outer-query context])}
  [outer-query {:keys [gtap-perms]}]
  (set/difference
   (query-perms/perms-set outer-query, :throw-exceptions? true, :already-preprocessed? true)
   gtap-perms))

(defn- has-data-perms? [required-perms]
  (perms/set-has-full-permissions-for-set? @*current-user-permissions-set* required-perms))

(s/defn ^:private check-ad-hoc-query-perms
  [outer-query context]
  (let [required-perms (required-perms outer-query context)]
    (when-not (has-data-perms? required-perms)
      (throw (perms-exception required-perms))))
  ;; check perms for any Cards referenced by this query (if it is a native query)
  (doseq [{query :dataset_query} (qp.resolve-referenced/tags-referenced-cards outer-query)]
    (check-query-permissions* query)))

(s/defn ^:private check-query-permissions*
  "Check that User with `user-id` has permissions to run `query`, or throw an exception."
  [outer-query :- su/Map context]
  (when *current-user-id*
    (log/tracef "Checking query permissions. Current user perms set = %s" (pr-str @*current-user-permissions-set*))
    (if *card-id*
      (do
        (check-card-read-perms *card-id*)
        (when-not (has-data-perms? (required-perms outer-query context))
          (check-block-permissions outer-query)))
      (check-ad-hoc-query-perms outer-query context))))

(defn check-query-permissions
  "Middleware that check that the current user has permissions to run the current query. This only applies if
  `*current-user-id*` is bound. In other cases, like when running public Cards or sending pulses, permissions need to
  be checked separately before allowing the relevant objects to be create (e.g., when saving a new Pulse or
  'publishing' a Card)."
  [qp]
  (fn [query rff context]
    (check-query-permissions* query context)
    (qp query rff context)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Non-middleware util fns                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn current-user-has-adhoc-native-query-perms?
  "If current user is bound, do they have ad-hoc native query permissions for `query`'s database? (This is used by
  `qp/query->native` and the `catch-exceptions` middleware to check the user should be allowed to see the native query
  before converting the MBQL query to native.)"
  [{database-id :database, :as query}]
  (or
   (not *current-user-id*)
   (let [required-perms (perms/adhoc-native-query-path database-id)]
     (perms/set-has-full-permissions? @*current-user-permissions-set* required-perms))))

(defn check-current-user-has-adhoc-native-query-perms
  "Check that the current user (if bound) has adhoc native query permissions to run `query`, or throw an
  Exception. (This is used by `qp/query->native` to check perms before converting an MBQL query to native.)"
  [{database-id :database, :as query}]
  (when-not (current-user-has-adhoc-native-query-perms? query)
    (throw (perms-exception (perms/adhoc-native-query-path database-id)))))
