(ns metabase-enterprise.sandbox.api.table
  (:require
   [compojure.core :refer [GET]]
   [metabase-enterprise.sandbox.api.util :as sandbox.api.util]
   [metabase.api.common :as api]
   [metabase.api.table :as api.table]
   [metabase.models.data-permissions :as data-perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn- find-sandbox-source-card :- [:maybe (ms/InstanceOf :model/Card)]
  "Find the associated sandboxing card (if there is one) for the given `table-or-table-id` and `user-or-user-id`.
  Returns nil if no question was found."
  [table-or-table-id user-or-user-id]
  (t2/select-one :model/Card
                 {:select [:c.id :c.dataset_query :c.result_metadata]
                  :from   [[:sandboxes]]
                  :join   [[:permissions_group_membership :pgm] [:= :sandboxes.group_id :pgm.group_id]
                           [:report_card :c] [:= :c.id :sandboxes.card_id]]
                  :where  [:and
                           [:= :sandboxes.table_id (u/the-id table-or-table-id)]
                           [:= :pgm.user_id (u/the-id user-or-user-id)]]}))

(mu/defn only-sandboxed-perms? :- :boolean
  "Returns true if the user has sandboxed permissions for the given table. If a sandbox policy exists, it overrides existing permission on
  the table."
  [table :- (ms/InstanceOf :model/Table)]
  (boolean (seq (sandbox.api.util/enforced-sandboxes-for-tables #{(:id table)}))))

(defn- filter-fields-by-name [names fields]
  (filter #(contains? names (:name %))
          fields))

(defn- filter-fields-by-id [ids fields]
  (filter #(contains? ids (:id %))
          fields))

(defn- filter-fields-for-sandboxing [table query-metadata-response]
  ;; If we have sandboxed permissions and the associated sandbox limits the fields returned, we need to make sure
  ;; the query_metadata endpoint also excludes any fields the sandbox query would exclude.
  (if-let [sandbox-source-card (find-sandbox-source-card table api/*current-user-id*)]
    (case (get-in sandbox-source-card [:dataset_query :type])
      :native (update query-metadata-response :fields
                      (partial filter-fields-by-name
                               (->> sandbox-source-card :result_metadata (map :name) set)))
      :query  (update query-metadata-response :fields
                      (partial filter-fields-by-id
                               (->> sandbox-source-card :result_metadata (map u/id) set))))
    ;; Sandboxed via user attribute, not a source question, so no column-level sandboxing is in place
    query-metadata-response))

(defenterprise fetch-table-query-metadata
  "Returns the query metadata used to power the Query Builder for the given table `id`. `include-sensitive-fields?`,
  `include-hidden-fields?` and `include-editable-data-model?` can be either booleans or boolean strings."
  :feature :sandboxes
  [id opts]
  (let [table (api/check-404 (t2/select-one :model/Table :id id))
        thunk (fn [] (api.table/fetch-query-metadata* table opts))]
    (if (only-sandboxed-perms? table)
      (filter-fields-for-sandboxing
       table
         ;; if the user has sandboxed perms, temporarily upgrade their perms to read perms for the Table so they can
         ;; fetch the metadata
       (data-perms/with-additional-table-permission :perms/view-data (:db_id table) (u/the-id table) :unrestricted
         (data-perms/with-additional-table-permission :perms/create-queries (:db_id table) (u/the-id table) :query-builder
           (thunk))))
      ;; Not sandboxed, so user can fetch full metadata
      (thunk))))

(defenterprise batch-fetch-table-query-metadatas
  "Returns the query metadata used to power the Query Builder for the tables specified by`ids`."
  :feature :sandboxes
  [ids]
  (for [table (api.table/batch-fetch-query-metadatas* ids)]
    (if (only-sandboxed-perms? table)
      (filter-fields-for-sandboxing
       table
         ;; if the user has sandboxed perms, temporarily upgrade their perms to read perms for the Table so they can
         ;; fetch the metadata
       (data-perms/with-additional-table-permission :perms/view-data (:db_id table) (u/the-id table) :unrestricted
         (data-perms/with-additional-table-permission :perms/create-queries (:db_id table) (u/the-id table) :query-builder
           table)))
      ;; Not sandboxed, so user can fetch full metadata
      table)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint GET "/:id/query_metadata"
  "This endpoint essentially acts as a wrapper for the OSS version of this route. When a user has sandboxed permissions
  that only gives them access to a subset of columns for a given table, those inaccessable columns should also be
  excluded from what is show in the query builder. When the user has full permissions (or no permissions) this route
  doesn't add/change anything from the OSS version. See the docs on the OSS version of the endpoint for more
  information."
  [id include_sensitive_fields include_hidden_fields include_editable_data_model]
  {id                          ms/PositiveInt
   include_sensitive_fields    [:maybe ms/BooleanValue]
   include_hidden_fields       [:maybe ms/BooleanValue]
   include_editable_data_model [:maybe ms/BooleanValue]}
  (fetch-table-query-metadata id {:include-sensitive-fields?    include_sensitive_fields
                                  :include-hidden-fields?       include_hidden_fields
                                  :include-editable-data-model? include_editable_data_model}))

(api/define-routes)
