(ns metabase-enterprise.sandbox.models.params.field-values
  (:require
   [metabase-enterprise.advanced-permissions.api.util
    :as advanced-perms.api.u]
   [metabase-enterprise.sandbox.api.table :as table]
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :refer [GroupTableAccessPolicy]]
   [metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions
    :as row-level-restrictions]
   [metabase.api.common :as api]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models :refer [Field PermissionsGroupMembership]]
   [metabase.models.field :as field]
   [metabase.models.field-values :as field-values]
   [metabase.models.params.field-values :as params.field-values]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util :as u]
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
  (let [group-ids (t2/select-fn-set :group_id PermissionsGroupMembership :user_id api/*current-user-id*)
        gtaps     (t2/select GroupTableAccessPolicy
                             :group_id [:in group-ids]
                             :table_id table-id)]
    (when gtaps
      (row-level-restrictions/assert-one-gtap-per-table gtaps)
      ;; there shold be only one gtap per table and we only need one table here
      ;; see docs in [[metabase.models.permissions]] for more info
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
          field-ids            (t2/select-fn-set :id Field :table_id table_id)]
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
                                         (lib.util.match/match-one v [:dimension [:field field-id _]] field-id))]
                    {k (get login-attributes k)})))])))

(defenterprise field-id->field-values-for-current-user
  "Fetch *existing* FieldValues for a sequence of `field-ids` for the current User. Values are returned as a map of
    {field-id FieldValues-instance}
  Returns `nil` if `field-ids` is empty or no matching FieldValues exist."
  :feature :sandboxes
  [field-ids]
  (let [fields                   (when (seq field-ids)
                                   (t2/hydrate (t2/select Field :id [:in (set field-ids)]) :table))
        {unsandboxed-fields false
         sandboxed-fields   true} (group-by (comp boolean field-is-sandboxed?) fields)]
    (merge
     ;; use the normal OSS batched implementation for any Fields that aren't subject to sandboxing.
     (when (seq unsandboxed-fields)
       (params.field-values/default-field-id->field-values-for-current-user
         (map u/the-id unsandboxed-fields)))
     ;; for sandboxed fields, fetch the sandboxed values individually.
     (into {} (for [{field-id :id, :as field} sandboxed-fields]
                [field-id (select-keys (params.field-values/get-or-create-advanced-field-values! :sandbox field)
                                       [:values :human_readable_values :field_id])])))))

(defenterprise get-or-create-field-values-for-current-user!*
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These
  should be filtered as appropriate for the current User (currently this only applies to the EE impl)."
  :feature :sandboxes
  [field]
  (cond
    (field-is-sandboxed? field)
    (params.field-values/get-or-create-advanced-field-values! :sandbox field)

    ;; Impersonation can have row-level security enforced by the database, so we still need to store field values per-user.
    ;; TODO: only do this for DBs with impersonation in effect
    (and api/*current-user-id*
         (advanced-perms.api.u/impersonated-user?))
    (params.field-values/get-or-create-advanced-field-values! :impersonation field)

    :else
    (params.field-values/default-get-or-create-field-values-for-current-user! field)))

(defenterprise hash-key-for-linked-filters
  "Returns a hash-key for linked-filter FieldValues if the field is sandboxed, otherwise fallback to the OSS impl."
  :feature :sandboxes
  [field-id constraints]
  (let [field (t2/select-one Field :id field-id)]
    (if (field-is-sandboxed? field)
      (str (hash (concat [field-id
                          constraints]
                         (field->gtap-attributes-for-current-user field))))
      (field-values/default-hash-key-for-linked-filters field-id constraints))))

(defenterprise hash-key-for-sandbox
  "Returns a hash-key for FieldValues if the field is sandboxed, otherwise fallback to the OSS impl."
  :feature :sandboxes
  [field-id]
  (let [field (t2/select-one Field :id field-id)]
    (when (field-is-sandboxed? field)
      (str (hash (concat [field-id]
                         (field->gtap-attributes-for-current-user field)))))))
