(ns metabase-enterprise.sandbox.api.table
  (:require
   [clojure.set :as set]
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.api.table :as api.table]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.table :as table :refer [Table]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn ^:private find-gtap-question :- [:maybe (mi/InstanceOf Card)]
  "Find the associated GTAP question (if there is one) for the given `table-or-table-id` and
  `user-or-user-id`. Returns nil if no question was found."
  [table-or-table-id user-or-user-id]
  (t2/select-one Card
                 {:select [:c.id :c.dataset_query]
                  :from   [[:sandboxes]]
                  :join   [[:permissions_group_membership :pgm] [:= :sandboxes.group_id :pgm.group_id]
                           [:report_card :c] [:= :c.id :sandboxes.card_id]]
                  :where  [:and
                           [:= :sandboxes.table_id (u/the-id table-or-table-id)]
                           [:= :pgm.user_id (u/the-id user-or-user-id)]]}))

(mu/defn only-sandboxed-perms? :- :boolean
  "Returns true if the user has only segemented and not full table permissions. If the user has full table permissions
  we wouldn't want to apply this segment filtering."
  [table :- (mi/InstanceOf Table)]
  (and
   (not (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                         (perms/table-query-path table)))
   (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                    (perms/table-sandboxed-query-path table))))

(mu/defn ^:private query->fields-ids :- [:maybe [:sequential :int]]
  [{{{:keys [fields]} :query} :dataset_query} :- [:maybe :map]]
  (mbql.u/match fields [:field (id :guard integer?) _] id))

(defn- maybe-filter-fields [table query-metadata-response]
  ;; If we have sandboxed permissions and the associated GTAP limits the fields returned, we need make sure the
  ;; query_metadata endpoint also excludes any fields the GTAP query would exclude
  (if-let [gtap-field-ids (and (only-sandboxed-perms? table)
                               (seq (query->fields-ids (find-gtap-question table api/*current-user-id*))))]
    (update query-metadata-response :fields #(filter (comp (set gtap-field-ids) u/the-id) %))
    query-metadata-response))

(api/defendpoint GET "/:id/query_metadata"
  "This endpoint essentially acts as a wrapper for the OSS version of this route. When a user has sandboxed permissions
  that only gives them access to a subset of columns for a given table, those inaccessable columns should also be
  excluded from what is show in the query builder. When the user has full permissions (or no permissions) this route
  doesn't add/change anything from the OSS version. See the docs on the OSS version of the endpoint for more
  information."
  [id include_sensitive_fields include_hidden_fields include_editable_data_model]
  {id                          ms/PositiveInt
   include_sensitive_fields    [:maybe ms/BooleanString]
   include_hidden_fields       [:maybe ms/BooleanString]
   include_editable_data_model [:maybe ms/BooleanString]}
  (let [table            (api/check-404 (t2/select-one Table :id id))
        sandboxed-perms? (only-sandboxed-perms? table)
        thunk            (fn []
                           (maybe-filter-fields
                            table
                            (api.table/fetch-query-metadata
                             table
                             {:include-sensitive-fields?    include_sensitive_fields
                              :include-hidden-fields?       include_hidden_fields
                              :include-editable-data-model? include_editable_data_model})))]
    ;; if the user has sandboxed perms, temporarily upgrade their perms to read perms for the Table so they can see the
    ;; metadata
    (if sandboxed-perms?
      (binding [api/*current-user-permissions-set* (atom
                                                    (set/union
                                                     @api/*current-user-permissions-set*
                                                     (mi/perms-objects-set table :read)))]
        (thunk))
      (thunk))))

(api/define-routes)
