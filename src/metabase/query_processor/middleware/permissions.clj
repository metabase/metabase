(ns metabase.query-processor.middleware.permissions
  "Middleware for checking that the current user has permissions to run the current query."
  (:require [metabase.api.common :refer [*current-user-id*]]
            [metabase.query-processor.permissions :as perms]
            [metabase.util :as u]))

(defn- check-query-permissions* [query]
  (u/prog1 query
    (when *current-user-id*
      (perms/check-query-permissions *current-user-id* query))))

(defn check-query-permissions
  "Middleware that check that the current user has permissions to run the current query.
   This only applies if `*current-user-id*` is bound. In other cases, like when running
   public Cards or sending pulses, permissions need to be checked separately before allowing
   the relevant objects to be create (e.g., when saving a new Pulse or 'publishing' a Card)."
  [qp]
  (comp qp check-query-permissions*))
