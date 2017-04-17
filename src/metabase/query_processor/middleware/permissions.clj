(ns metabase.query-processor.middleware.permissions
  "Middleware for checking that the current user has permissions to run the current query."
  (:require [metabase.api.common :refer [*current-user-id*]]
            [metabase.query-processor.permissions :as perms]
            [metabase.util :as u]))

(defn- check-query-permissions* [query]
  ;; TODO - should we do anything if there is no *current-user-id* (for something like a pulse?)
  (u/prog1 query
    (when *current-user-id*
      (perms/check-query-permissions *current-user-id* query))))

(defn check-query-permissions
  "Middleware that check that the current user has permissions to run the current query."
  [qp]
  (comp qp check-query-permissions*))
