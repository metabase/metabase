(ns metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.mbql.util :as mbql.u]
            [metabase.util.i18n :refer [trs tru]]))

(defn- maybe-apply-column-level-perms-check* [{{{source-query-fields :fields} :source-query} :query, :as query}]
  (let [restricted-field-ids (and (or (:gtap-perms query)
                                      (get-in query [:query :gtap-perms]))
                                  (set (mbql.u/match source-query-fields [:field-id id] id)))]
    (when (seq restricted-field-ids)
      (let [fields-ids-in-query (set (mbql.u/match (m/dissoc-in query [:query :source-query]) [:field-id id] id))]
        (when-not (every? restricted-field-ids fields-ids-in-query)
          (log/warn (trs "User ''{0}'' attempted to access an inaccessible field. Accessible fields {1}, fields in query {2}"
                         *current-user-id* (pr-str restricted-field-ids) (pr-str fields-ids-in-query)))
          (throw (ex-info (str (tru "User not able to query field")) {:status 403})))))))

(defn maybe-apply-column-level-perms-check
  "Check column-level permissions if applicable."
  [qp]
  (fn [query rff context]
    (maybe-apply-column-level-perms-check* query)
    (qp query rff context)))
