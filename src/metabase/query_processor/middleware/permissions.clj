(ns metabase.query-processor.middleware.permissions
  "Middleware for checking that the current user has permissions to run the current query."
  (:require [clojure.tools.logging :as log]
            [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.models
             [card :refer [Card]]
             [interface :as mi]
             [permissions :as perms]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.resolve-referenced :as qp.resolve-referenced]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private check-card-read-perms
  "Check that the current user has permissions to read Card with `card-id`, or throw an Exception. "
  [card-id :- su/IntGreaterThanZero]
  (let [{collection-id :collection_id, :as card} (or (db/select-one [Card :collection_id] :id card-id)
                                                     (throw (ex-info (tru "Card {0} does not exist." card-id)
                                                                     {:type error-type/invalid-query})))]
    (log/tracef "Required perms to run Card: %s" (pr-str (mi/perms-objects-set card :read)))
    (when-not (mi/can-read? card)
      (throw (ex-info (tru "You do not have permissions to view Card {0}." card-id)
                      {:type error-type/missing-required-permissions})))))

(defn- perms-exception [required-perms]
  (ex-info (tru "You do not have permissions to run this query.")
    {:type                 error-type/missing-required-permissions
     :required-permissions required-perms
     :actual-permissions   @*current-user-permissions-set*
     :permissions-error?   true}))

(declare check-query-permissions*)

(s/defn ^:private check-ad-hoc-query-perms
  [outer-query]
  (let [required-perms (query-perms/perms-set outer-query, :throw-exceptions? true, :already-preprocessed? true)]
    (log/tracef "Required ad-hoc perms: %s" (pr-str required-perms))
    (when-not (perms/set-has-full-permissions-for-set? @*current-user-permissions-set* required-perms)
      (throw (perms-exception required-perms)))
    (doseq [{:keys [dataset_query]} (qp.resolve-referenced/tags-referenced-cards outer-query)]
      (check-query-permissions* dataset_query))))

(s/defn ^:private check-query-permissions*
  "Check that User with `user-id` has permissions to run `query`, or throw an exception."
  [{{:keys [card-id]} :info, :as outer-query} :- su/Map]
  (when *current-user-id*
    (log/tracef "Checking query permissions. Current user perms set = %s" (pr-str @*current-user-permissions-set*))
    (if card-id
      (check-card-read-perms card-id)
      (check-ad-hoc-query-perms outer-query))))

(defn check-query-permissions
  "Middleware that check that the current user has permissions to run the current query. This only applies if
  `*current-user-id*` is bound. In other cases, like when running public Cards or sending pulses, permissions need to
  be checked separately before allowing the relevant objects to be create (e.g., when saving a new Pulse or
  'publishing' a Card)."
  [qp]
  (fn [query rff context]
    (check-query-permissions* query)
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
