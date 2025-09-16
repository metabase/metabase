(ns metabase-enterprise.sandbox.query-processor.middleware.column-level-perms-check
  (:require
   [medley.core :as m]
   [metabase.api.common :refer [*current-user-id*]]
   ;; legacy usage -- don't use Legacy MBQL utils in QP code going forward, prefer Lib. This will be updated to use
   ;; Lib only soon
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.premium-features.core :refer [defenterprise-schema]]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- field-ids [form]
  (set (lib.util.match/match form
         [:field (id :guard integer?) _]
         id)))

(def ^:private ^:dynamic *gtap-perms*
  "TODO: these used to be passed as a `:gtap-perms` key as part of QP context... not sure where this used to get passed
  in."
  nil)

(mu/defn- maybe-apply-column-level-perms-check*
  {:arglists '([query])}
  [{{{source-query-fields :fields} :source-query} :query, :as query} :- ::mbql.s/Query]
  (let [restricted-field-ids (and *gtap-perms*
                                  (field-ids source-query-fields))]
    (when (seq restricted-field-ids)
      (let [fields-ids-in-query (field-ids (m/dissoc-in query [:query :source-query]))]
        (when-not (every? restricted-field-ids fields-ids-in-query)
          (log/warnf "User '%s' attempted to access an inaccessible field. Accessible fields %s, fields in query %s"
                     *current-user-id* (pr-str restricted-field-ids) (pr-str fields-ids-in-query))
          (throw (ex-info (str (tru "User not able to query field")) {:status 403})))))))

(defenterprise-schema maybe-apply-column-level-perms-check :- ::qp.schema/qp
  "Check column-level permissions if applicable."
  :feature :sandboxes
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::mbql.s/Query
          rff   :- ::qp.schema/rff]
    (maybe-apply-column-level-perms-check* query)
    (qp query rff)))
