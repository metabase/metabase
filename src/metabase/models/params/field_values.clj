(ns metabase.models.params.field-values
  "Code related to fetching *cached* FieldValues for Fields to populate parameter widgets. Always used by the field
  values (`GET /api/field/:id/values`) endpoint; used by the chain filter endpoints under certain circumstances."
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.interface :as mi]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [potemkin :as p]
            [pretty.core :as pretty]
            [toucan.db :as db]))

(p/defprotocol+ FieldValuesForCurrentUser
  "Protocol for fetching FieldValues for a Field for the current User. There are different implementations for EE and
  OSS."
  (get-or-create-field-values-for-current-user!* [impl field]
    "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These
 should be filtered as appropriate for the current User (currently this only applies to the EE impl).")

  (field-id->field-values-for-current-user* [impl field-ids]
    "Fetch existing FieldValues for a sequence of `field-ids` for the current User. `field-ids` is guaranteed to be a
    non-empty set."))

(defn- default-get-or-create-field-values-for-current-user!* [field]
  (when (field-values/field-should-have-field-values? field)
    (field-values/get-or-create-field-values! field)))

(defn- default-field-id->field-values-for-current-user* [field-ids]
  (when (seq field-ids)
    (not-empty
     (let [field-values       (db/select [FieldValues :values :human_readable_values :field_id]
                                :field_id [:in (set field-ids)])
           readable-fields    (when (seq field-values)
                                (field/readable-fields-only (db/select [Field :id :table_id]
                                                              :id [:in (set (map :field_id field-values))])))
           readable-field-ids (set (map :id readable-fields))]
       (->> field-values
            (filter #(contains? readable-field-ids (:field_id %)))
            (u/key-by :field_id))))))

(def default-impl
  "Default (OSS) impl of the `FieldValuesForCurrentUser` protocol. Does not do anything special if sandboxing is in
  effect."
  (reify
    pretty/PrettyPrintable
    (pretty [_]
      `impl)

    FieldValuesForCurrentUser
    (get-or-create-field-values-for-current-user!* [_ field]
      (default-get-or-create-field-values-for-current-user!* field))

    (field-id->field-values-for-current-user* [_ field-ids]
      (default-field-id->field-values-for-current-user* field-ids))))

(def ^:private impl
  ;; if EE impl is present, use it. It implements the strategy pattern and will forward method invocations to the
  ;; default OSS impl if we don't have a valid EE token. Thus the actual EE versions of the methods won't get used
  ;; unless EE code is present *and* we have a valid EE token.
  (delay
    (u/prog1 (or (u/ignore-exceptions
                   (classloader/require 'metabase-enterprise.sandbox.models.params.field-values)
                   (some-> (resolve 'metabase-enterprise.sandbox.models.params.field-values/ee-strategy-impl) var-get))
                 default-impl)
      (log/debugf "FieldValuesForCurrentUser implementation set to %s" <>))))

(defn current-user-can-fetch-field-values?
  "Whether the current User has permissions to fetch FieldValues for a `field`."
  [field]
  ;; read permissions for a Field = partial permissions for its parent Table (including EE segmented permissions)
  (mi/can-read? field))

(defn get-or-create-field-values-for-current-user!
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These are
  filtered as appropriate for the current User, depending on MB version (e.g. EE sandboxing will filter these values).
  If the Field has a human-readable values remapping (see documentation at the top of
  `metabase.models.params.chain-filter` for an explanation of what this means), values are returned in the format

    {:values   [[original-value human-readable-value]]
     :field_id field-id}

  If the Field does *not* have human-readable values remapping, values are returned in the format

    {:values   [[value]]
     :field_id field-id}"
  [field]
  (if-let [field-values (get-or-create-field-values-for-current-user!* @impl field)]
    (-> field-values
        (assoc :values (field-values/field-values->pairs field-values))
        (dissoc :human_readable_values :created_at :updated_at :id))
    {:values [], :field_id (u/the-id field)}))

(defn field-id->field-values-for-current-user
  "Fetch *existing* FieldValues for a sequence of `field-ids` for the current User. Values are returned as a map of

    {field-id FieldValues-instance}

  Returns `nil` if `field-ids` is empty of no matching FieldValues exist."
  [field-ids]
  (when (seq field-ids)
    (not-empty (field-id->field-values-for-current-user* @impl (set field-ids)))))
