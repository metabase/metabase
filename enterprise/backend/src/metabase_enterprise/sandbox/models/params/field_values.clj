(ns metabase-enterprise.sandbox.models.params.field-values
  (:require
   [metabase-enterprise.sandbox.api.table :as table]
   [metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions
    :as row-level-restrictions]
   [metabase.api.common :as api]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.field :as field]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(comment api/keep-me)

(defn field-is-sandboxed?
  "Check if a field is sandboxed."
  [{:keys [table], :as field}]
  ;; slight optimization: for the `field-id->field-values` version we can batched hydrate `:table` to avoid having to
  ;; make a bunch of calls to fetch Table. For `get-or-create-field-values` we don't hydrate `:table` so we can fall
  ;; back to fetching it manually with `field/table`
  (table/only-sandboxed-perms? (or table (field/table field))))

(defn- table-id->gtap
  "Find the GTAP for current user that apply to table `table-id`."
  [table-id]
  (let [group-ids (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id api/*current-user-id*)
        gtaps     (t2/select :model/GroupTableAccessPolicy
                             :group_id [:in group-ids]
                             :table_id table-id)]
    (when gtaps
      (row-level-restrictions/assert-one-gtap-per-table gtaps)
      ;; there shold be only one gtap per table and we only need one table here
      ;; see docs in [[metabase.permissions.models.permissions]] for more info
      (t2/hydrate (first gtaps) :card))))

(defn- field->gtap-attributes-for-current-user
  "Returns the gtap attributes for current user that applied to `field`.

  The gtap-attributes is a list with 2 elements:
  1. card-id - for GTAP that use a saved question
  2. the timestamp when the saved question was last updated
  3. a map:
    if query is mbql query:
      - with key is the user-attribute that applied to the table that `field` is in
      - value is the user-attribute of current user corresponding to the key
    for native query, this map will be the login-attributes of user

  For example we have an GTAP rules
  {:card_id              1 ;; a mbql query
   :attribute_remappings {\"State\" [:dimension [:field 3 nil]]}}

  And users with login-attributes {\"State\" \"CA\"}

  ;; (field-id->gtap-attributes-for-current-user (t2/select-one Field :id 3))
  ;; -> [1, {\"State\" \"CA\"}]"
  [{:keys [table_id] :as _field}]
  (when-let [gtap (table-id->gtap table_id)]
    (let [login-attributes     (:login_attributes @api/*current-user*)
          attribute_remappings (:attribute_remappings gtap)
          field-ids            (t2/select-fn-set :id :model/Field :table_id table_id)]
      [(:card_id gtap)
       (-> gtap :card :updated_at)
       (if (= :native (get-in gtap [:card :query_type]))
         ;; For sandbox that uses native query, we can't narrow down to the exact attribute
         ;; that affect the current table. So we just hash the whole login-attributes of users.
         ;; This makes hashing a bit less efficient but it ensures that user get a new hash
         ;; if they change login attributes
         login-attributes
         (into {} (for [[k v] attribute_remappings
                        ;; get attribute that map to fields of the same table
                        :when (contains? field-ids
                                         (lib.util.match/match-one v
                                           ;; new style with {:stage-number }
                                           [:dimension [:field field-id _] _] field-id
                                           ;; old style without stage number
                                           [:dimension [:field field-id _]] field-id))]
                    {k (get login-attributes k)})))])))

(defenterprise hash-input-for-sandbox
  "Returns a hash-input for FieldValues if the field is sandboxed."
  :feature :sandboxes
  [field]
  (when (field-is-sandboxed? field)
    {:sandbox-attributes (field->gtap-attributes-for-current-user field)}))
