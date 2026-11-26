(ns metabase-enterprise.sandbox.models.params.field-values
  (:require
   [metabase-enterprise.sandbox.api.table :as table]
   [metabase-enterprise.sandbox.api.util :as sandbox.api.util]
   [metabase-enterprise.sandbox.db :as sandbox.db]
   [metabase-enterprise.sandbox.query-processor.middleware.sandboxing :as sandboxing]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.warehouse-schema.models.field :as field]
   [toucan2.core :as t2]))

(comment api/keep-me)

(defn field-is-sandboxed?
  "Check if a field is sandboxed."
  [{:keys [table], :as field}]
  ;; slight optimization: for the `field-id->field-values` version we can batched hydrate `:table` to avoid having to
  ;; make a bunch of calls to fetch Table. For `get-or-create-field-values` we don't hydrate `:table` so we can fall
  ;; back to fetching it manually with `field/table`
  (table/only-sandboxed-perms? (or table (field/table field))))

(defn- table-id->sandbox
  "Find the GTAP for current user that apply to table `table-id`. Returns nil when there is no current user (e.g. when
  called from a background sync), since sandboxes are scoped to a user's group memberships."
  [table-id]
  (when api/*current-user-id*
    (let [group-ids (sandbox.db/user-group-ids api/*current-user-id*)
          sandboxes (when (seq group-ids)
                      (sandbox.db/sandboxes-for-groups-and-table group-ids table-id))]
      (when sandboxes
        (sandboxing/assert-one-sandbox-per-table sandboxes)
        ;; there should be only one gtap per table and we only need one table here
        ;; see docs in [[metabase.permissions.models.permissions]] for more info
        (t2/hydrate (first sandboxes) :card)))))

(defn- field->sandbox-attributes-for-current-user
  "Returns the gtap attributes for current user that applied to `field`.

  The gtap-attributes is a list with 3 elements:
  1. card-id - for GTAP that use a saved question
  2. the timestamp when the saved question was last updated
  3. a map:
    if query is mbql query:
      - with an entry for every user-attribute in the GTAP's `attribute_remappings`
      - value is the user-attribute of current user corresponding to the key
    for native query, this map will be the login-attributes of user

  The query processor applies *every* attribute remapping when it runs the sandboxed query —
  including remappings whose target is a column of a joined table, or a column referenced by
  name — so every remapped attribute can change which rows the user sees and must be part of
  this fingerprint. Narrowing the map to remappings that target the sandboxed table's own
  columns let two users with different values for a joined-table attribute share one cached
  FieldValues row (SEC-874).

  For example we have an GTAP rules
  {:card_id              1 ;; a mbql query
   :attribute_remappings {\"State\" [:dimension [:field 3 nil]]}}

  And users with login-attributes {\"State\" \"CA\"}

  ;; (field-id->gtap-attributes-for-current-user (t2/select-one Field :id 3))
  ;; -> [1, {\"State\" \"CA\"}]"
  [{table-id :table_id, :as _field}]
  (when-let [sandbox (table-id->sandbox table-id)]
    (let [login-attributes     (api/current-user-attributes)
          attribute-remappings (:attribute_remappings sandbox)]
      [(:card_id sandbox)
       (-> sandbox :card :updated_at)
       (if (= :native (get-in sandbox [:card :query_type]))
         ;; For sandbox that uses native query, we can't narrow down to the exact attribute
         ;; that affect the current table. So we just hash the whole login-attributes of users.
         ;; This makes hashing a bit less efficient but it ensures that user get a new hash
         ;; if they change login attributes
         login-attributes
         (into {} (for [k (keys attribute-remappings)]
                    [k (get login-attributes k)])))])))

(defenterprise hash-input-for-sandbox
  "Returns a hash-input for FieldValues if the field is sandboxed.
  The attributes are nil when they can't be resolved, and while the `:sandboxes` feature is unavailable."
  :feature :none
  [field]
  (when (field-is-sandboxed? field)
    {:sandbox-attributes (when (premium-features/has-feature? :sandboxes)
                           (field->sandbox-attributes-for-current-user field))}))

(defn- sandbox-token
  "The sandbox fingerprint of the current user on the Table of `field`, whose sandbox is enforced for them."
  [field]
  (if-let [[card-id updated-at attributes] (field->sandbox-attributes-for-current-user field)]
    [card-id (str updated-at) attributes]
    [::indeterminate-sandbox api/*current-user-id*]))

(defenterprise sandbox-tokens-for-tables
  "[[sandbox-token-for-table]] of each of `table-ids`, by id, with whether a sandbox is enforced read for all of them
  together."
  :feature :none
  [table-ids]
  (let [sandboxed (into #{} (map :table_id) (sandbox.api.util/enforced-sandboxes-for-tables (set table-ids)))]
    (into {}
          (map (fn [table-id]
                 [table-id (when (contains? sandboxed table-id)
                             (sandbox-token {:table_id table-id}))]))
          table-ids)))

(defenterprise sandbox-token-for-table
  "The sandbox fingerprint of the current user on `table-id`, the GTAP card, its `:updated_at` as a string and the
  resolved user-attribute values, which [[metabase.permissions.data-access-token]] digests before anything stores it,
  read from the same enforced sandboxes and attributes as the FieldValues cache without reading the Table: nil when
  no sandbox is enforced for them there, and a user-scoped indeterminate token, never nil, when one is enforced but
  its attributes are not found."
  :feature :none
  [table-id]
  (get (sandbox-tokens-for-tables [table-id]) table-id))
