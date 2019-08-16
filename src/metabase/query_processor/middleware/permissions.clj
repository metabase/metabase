(ns metabase.query-processor.middleware.permissions
  "Middleware for checking that the current user has permissions to run the current query."
  (:require [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.models
             [card :refer [Card]]
             [interface :as mi]
             [permissions :as perms]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private check-card-read-perms
  "Check that the current user has permissions to read Card with `card-id`, or throw an Exception. "
  [card-id :- su/IntGreaterThanZero]
  (when-not (mi/can-read? (or (db/select-one [Card :collection_id] :id card-id)
                              (throw (Exception. (tru "Card {0} does not exist." card-id)))))
    (throw (Exception. (tru "You do not have permissions to view Card {0}." card-id)))))

(defn- perms-exception [required-perms]
  (ex-info (tru "You do not have permissions to run this query.")
    {:required-permissions required-perms
     :actual-permissions   @*current-user-permissions-set*
     :permissions-error?   true}))

(s/defn ^:private check-ad-hoc-query-perms
  [outer-query]
  (let [required-perms (query-perms/perms-set outer-query, :throw-exceptions? true, :already-preprocessed? true)]
    (when-not (perms/set-has-full-permissions-for-set? @*current-user-permissions-set* required-perms)
      (throw (perms-exception required-perms)))))

(s/defn ^:private check-query-permissions*
  "Check that User with `user-id` has permissions to run `query`, or throw an exception."
  [{{:keys [card-id]} :info, :as outer-query} :- su/Map]
  (when *current-user-id*
    (if card-id
      (check-card-read-perms card-id)
      (check-ad-hoc-query-perms outer-query)))
  outer-query)

(defn check-query-permissions
  "Middleware that check that the current user has permissions to run the current query. This only applies if
  `*current-user-id*` is bound. In other cases, like when running public Cards or sending pulses, permissions need to
  be checked separately before allowing the relevant objects to be create (e.g., when saving a new Pulse or
  'publishing' a Card)."
  [qp]
  (comp qp check-query-permissions*))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Non-middleware util fns                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn check-current-user-has-adhoc-native-query-perms
  "Check that the current user (if bound) has adhoc native query permissions to run `query`, or throw an
  Exception. (This is used by `qp/query->native` to check perms before converting an MBQL query to native.)"
  [{database-id :database, :as query}]
  (when *current-user-id*
    (let [required-perms (perms/adhoc-native-query-path database-id)]
      (when-not (perms/set-has-full-permissions? @*current-user-permissions-set* required-perms)
        (throw (perms-exception required-perms))))))
