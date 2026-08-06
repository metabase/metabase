(ns metabase-enterprise.sandbox.api.table
  (:require
   [metabase-enterprise.sandbox.api.column-filter :as col-filter]
   [metabase-enterprise.sandbox.api.util :as sandbox.api.util]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.table :as schema.table]
   [toucan2.core :as t2]))

(mu/defn only-sandboxed-perms? :- :boolean
  "Returns true if the user has sandboxed permissions for the given table. If a sandbox policy exists, it overrides
  existing permission on the table."
  [table :- (ms/InstanceOf :model/Table)]
  (boolean (seq (sandbox.api.util/enforced-sandboxes-for-tables #{(:id table)}))))

(defn- filter-fields-for-sandboxing [table query-metadata-response]
  ;; Filter the fields list through the centralized column-filter helper. For tables sandboxed via user attribute
  ;; only (no card_id) the helper is a pass-through, preserving the original behavior.
  (update query-metadata-response :fields
          #(col-filter/filter-fields-for-table (u/the-id table) %)))

(defenterprise fetch-table-query-metadata
  "Returns the query metadata used to power the Query Builder for the given table `id`. `include-sensitive-fields?`,
  `include-hidden-fields?` and `include-editable-data-model?` can be either booleans or boolean strings."
  :feature :sandboxes
  [id opts]
  (let [table (api/check-404 (t2/select-one :model/Table :id id))
        thunk (fn [] (schema.table/fetch-query-metadata* table opts))]
    (if (only-sandboxed-perms? table)
      (filter-fields-for-sandboxing
       table
       ;; if the user has sandboxed perms, temporarily upgrade their perms to read perms for the Table so they can
       ;; fetch the metadata
       (perms/with-additional-table-permission :perms/view-data (:db_id table) (u/the-id table) :unrestricted
         (perms/with-additional-table-permission :perms/create-queries (:db_id table) (u/the-id table) :query-builder
           (thunk))))
      ;; Not sandboxed, so user can fetch full metadata
      (thunk))))

(defenterprise batch-fetch-table-query-metadatas
  "Returns the query metadata used to power the Query Builder for the tables specified by`ids`.
  Options:
    - `include-sensitive-fields?` - if true, includes fields with visibility_type :sensitive (default false)"
  :feature :sandboxes
  [ids opts]
  (for [table (schema.table/batch-fetch-query-metadatas* ids opts)]
    (if (only-sandboxed-perms? table)
      (filter-fields-for-sandboxing
       table
       ;; if the user has sandboxed perms, temporarily upgrade their perms to read perms for the Table so they can
       ;; fetch the metadata
       (perms/with-additional-table-permission :perms/view-data (:db_id table) (u/the-id table) :unrestricted
         (perms/with-additional-table-permission :perms/create-queries (:db_id table) (u/the-id table) :query-builder
           table)))
      ;; Not sandboxed, so user can fetch full metadata
      table)))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/query_metadata"
  "This endpoint essentially acts as a wrapper for the OSS version of this route. When a user has sandboxed permissions
  that only gives them access to a subset of columns for a given table, those inaccessible columns should also be
  excluded from what is show in the query builder. When the user has full permissions (or no permissions) this route
  doesn't add/change anything from the OSS version. See the docs on the OSS version of the endpoint for more
  information."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_sensitive_fields include_hidden_fields include_editable_data_model]}
   :- [:map
       [:include_sensitive_fields    {:default false} [:maybe ms/BooleanValue]]
       [:include_hidden_fields       {:default false} [:maybe ms/BooleanValue]]
       [:include_editable_data_model {:default false} [:maybe ms/BooleanValue]]]]
  (fetch-table-query-metadata id {:include-sensitive-fields?    include_sensitive_fields
                                  :include-hidden-fields?       include_hidden_fields
                                  :include-editable-data-model? include_editable_data_model}))
