(ns metabase-enterprise.metabot-v3.tools.execute-query
  (:require
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.query-processor :as qp]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- extract-card-template-tags
  "Parse SQL query for card references like {{#123}} and generate template-tags map.
   Returns a map of tag-name -> template-tag-spec for all card references found."
  [sql-query]
  (when sql-query
    (let [card-refs (re-seq #"\{\{#(\d+)\}\}" sql-query)]
      (into {}
            (for [[_match card-id-str] card-refs
                  :let [card-id (parse-long card-id-str)
                        tag-name (str "#" card-id)]]
              [tag-name {:id tag-name
                         :name tag-name
                         :display-name tag-name
                         :type :card
                         :card-id card-id}])))))

(defn execute-query
  "Execute an ad-hoc query and return results.
   Accepts the same parameters as the /api/dataset endpoint."
  [{:keys [database type native query] :as query-map}]
  (try
    ;; Permission checks
    (when-not database
      (throw (ex-info (tru "`database` is required for all queries")
                      {:status-code 400, :agent-error? true})))
    (api/read-check :model/Database database)

    ;; Publish table read event if applicable
    (let [table-id (get-in query-map [:query :source-table])]
      (when (int? table-id)
        (events/publish-event! :event/table-read {:object  (t2/select-one :model/Table :id table-id)
                                                  :user-id api/*current-user-id*})))

    ;; Build the query in the format expected by QP
    (let [;; Normalize "sql" type to "native" for QP compatibility
          normalized-type (case type
                            "sql" "native"
                            type)
          ;; Auto-generate template-tags for card references if needed
          enhanced-native (when native
                            (let [sql-query (get native :query)
                                  auto-tags (extract-card-template-tags sql-query)
                                  existing-tags (get native :template-tags)]
                              (if (seq auto-tags)
                                (assoc native :template-tags (merge auto-tags existing-tags))
                                native)))
          qp-query (cond-> {:database database}
                     normalized-type (assoc :type normalized-type)
                     enhanced-native (assoc :native enhanced-native)
                     query (assoc :query query))

          ;; Add constraints and middleware settings (same as /api/dataset)
          query-with-constraints (-> qp-query
                                     (update-in [:middleware :js-int-to-string?] (fnil identity true))
                                     qp/userland-query-with-default-constraints)

          ;; Execute the query synchronously
          info {:executed-by api/*current-user-id*
                :context :ad-hoc}
          results (qp/process-query (assoc query-with-constraints :info info))]

      {:structured-output {:data results
                           :status "completed"}})
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))

(comment
  ;; Test with a SQL query that references a model/card
  ;; template-tags are now auto-generated from {{#ID}} patterns
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 430
            api/*is-superuser?* true]
    (def tsp-result (execute-query
                     {:database 26
                      :type "native"
                      :native {:query "SELECT title, number, created_at
FROM {{#6113}} as project_issues
LIMIT 5"}})))

  ;; You can also manually specify template-tags (they will be merged with auto-generated ones)
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 430
            api/*is-superuser?* true]
    (def tsp-result-manual (execute-query
                            {:database 26
                             :type "native"
                             :native {:query "SELECT * FROM {{#6113}} WHERE name = {{user_name}}"
                                      :template-tags {"user_name" {:type :text
                                                                   :id "user_name-123"
                                                                   :name "user_name"}}}})))
  -)

