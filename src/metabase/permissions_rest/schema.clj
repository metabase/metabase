(ns metabase.permissions-rest.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defn- kw-int->int-decoder
  "Decode the `:123` shape an integer id takes when it arrives as a JSON object key. Anything else is handed on
  untouched for validation to reject."
  [kw-int]
  (cond
    (int? kw-int)                           kw-int
    (or (keyword? kw-int) (string? kw-int)) (parse-long (name kw-int))
    :else                                   kw-int))

(mr/def ::decodable-keyword-int
  "Integer malli schema that knows how to decode itself from the :123 sort of shape used in perm-graphs. Decodes under
  `:api`, so a request body carrying a graph can be typed with these schemas and left to `metabase.api.macros` to
  decode."
  [:schema {:decode/api kw-int->int-decoder} ms/PositiveInt])

(mr/def ::id       ::decodable-keyword-int)
(mr/def ::group-id ::decodable-keyword-int)

(mr/def ::native
  "native permissions"
  [:maybe [:enum :write :none :full :limited]])

(mr/def ::perms
  "Perms that get reused for TablePerms and SchemaPerms"
  [:enum
   :all
   :blocked
   :full
   :legacy-no-self-service
   :limited
   :no
   :none
   :query-builder
   :sandboxed
   :segmented
   :unrestricted])

(defn- named-or-granular
  "A permission given either by name at the level it is written at, or broken down by `granular-schema` into the
  level below -- a database's into its schemas, a schema's into its tables.

  Dispatched on `map?` rather than written as an `[:or [:ref ::perms] granular-schema]`: `:or` runs every child's
  decoder, and a `:map-of` decoder reduces over whatever it is handed, so a scalar there throws out of the decoder
  and turns a bad request body into a 500."
  [granular-schema]
  [:multi {:dispatch map?}
   [true  granular-schema]
   [false [:ref ::perms]]])

(mr/def ::table-perms
  (named-or-granular
   [:map
    [:read  {:optional true} [:enum :all :none]]
    [:query {:optional true} [:enum :all :none :segmented]]]))

(mr/def ::schema-perms
  (named-or-granular
   [:map-of
    [:or [:ref ::id]
     (mu/refuse #(tru "Invalid DB permissions: permissions for a schema must be keyed by table id."))]
    [:or [:ref ::table-perms]
     (mu/refuse #(tru "Invalid DB permissions: unrecognized permissions for a table."))]]))

(defn- kw->name-decoder
  "Decode the keyword a JSON object key arrives as back into the schema name it stands for. Anything else is handed on
  untouched for validation to reject -- this runs over request bodies, so it can't assume `name` will work."
  [schema-name]
  (cond-> schema-name
    (keyword? schema-name) name))

(mr/def ::schema-graph
  [:map-of
   [:string {:decode/api kw->name-decoder}]
   [:or [:ref ::schema-perms]
    (mu/refuse #(tru "Invalid DB permissions: unrecognized permissions for a schema."))]])

(mr/def ::schemas
  [:multi {:dispatch map?}
   [true [:ref ::schema-graph]]
   [false [:enum
           :all
           :segmented
           :none
           :block
           :blocked
           :full
           :limited
           :impersonated
           :unrestricted
           :sandboxed
           :legacy-no-self-service
           :query-builder-and-native
           :query-builder
           :no]]])

(mr/def ::data-perms
  [:map
   [:native  {:optional true} [:ref ::native]]
   [:schemas {:optional true} [:ref ::schemas]]])

(mr/def ::strict-data-perms
  "Data perms that care about how view-data and make-queries are related to one another.
  If you have write access for native queries, you must have data access to all schemas."
  [:and
   [:ref ::data-perms]
   [:fn {:error/fn (fn [_ _] (trs "Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."))}
    (fn [{:keys [native schemas]}]
      (not (and (= native :write) schemas (not (#{:all :impersonated} schemas)))))]])

;;; closed: a per-database key the graph update doesn't act on is a request we can't honour, not one to apply the rest
;;; of
(mr/def ::db-perms
  "the permissions one group has on one database"
  [:map {:closed true}
   [:view-data      {:optional true} [:ref ::schemas]]
   [:create-queries {:optional true} [:ref ::schemas]]
   [:data           {:optional true} [:ref ::strict-data-perms]]
   [:download       {:optional true} [:ref ::strict-data-perms]]
   [:data-model     {:optional true} [:ref ::strict-data-perms]]
   [:details        {:optional true} [:enum :yes :no]]
   [:transforms     {:optional true} [:enum :yes :no]]
   [:workspaces     {:optional true} [:enum :yes :no]]])

(defn- valid-db-perms?
  "Whether the permissions a group has on one database hang together: 'view-data' may not be 'blocked' when
  'create-queries' is 'query-builder-and-native'."
  [{:keys [create-queries view-data]}]
  (not (and (= create-queries :query-builder-and-native) (= view-data :blocked))))

(mr/def ::strict-db-graph
  "like db-graph, but with added validations:
   - Ensures 'view-data' is not 'blocked' if 'create-queries' is 'query-builder-and-native'."
  [:map-of
   [:ref ::id]
   [:and
    [:ref ::db-perms]
    [:fn {:error/fn (fn [_ _] (trs "Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."))}
     valid-db-perms?]]])

(mr/def ::data-permissions-graph
  "Used to transform, and verify data permissions graph"
  [:map
   [:groups [:map-of [:ref ::group-id] [:maybe [:ref ::strict-db-graph]]]]])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     PUT /api/permissions/graph REQUEST BODY                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; Docstrings stay short from here on: `metabase.api.macros` describes the schema back to the caller in the 400.

(mr/def ::attribute-name
  "a user attribute name"
  ;; attribute names reach us as keywords, JSON object keys having been keywordized on the way in
  [:schema {:decode/normalize (fn [attribute]
                                (cond-> attribute
                                  (keyword? attribute) u/qualified-name))}
   ms/NonBlankString])

;;; The same shape `:metabase-enterprise.sandbox.schema/attribute-remappings` gives the column for `/api/mt/gtap`.
(mr/def ::attribute-remapping
  "a field name, a field id, or a parameter target"
  [:orn
   [:field-name       ms/NonBlankString]
   [:field-id         ::lib.schema.id/field]
   [:parameter-target [:ref ::lib.schema.parameter/target]]])

;;; A remapping the schema can't read is refused rather than left to be pruned: a sandbox stored without the
;;; remapping that was meant to restrict it is a sandbox that filters nothing.
(mr/def ::attribute-remappings
  "a map of user attribute name -> the field or parameter target it is remapped onto"
  [:map-of
   [:or [:ref ::attribute-name]
    (mu/refuse #(tru "Invalid attribute remappings: a user attribute name must be a non-blank string."))]
   [:or [:ref ::attribute-remapping]
    (mu/refuse #(tru "Invalid attribute remappings: a user attribute must be remapped onto a field name, a field id, or a parameter target."))]])

;;; One without an `:id` is created, one with an `:id` is updated -- and only in the keys the request actually
;;; carries, so `:card_id`/`:attribute_remappings` have to keep their present/absent distinction.
(mr/def ::sandbox-update
  "a sandbox to write alongside a permissions graph update"
  [:and
   [:map
    [:id                   {:optional true} ms/PositiveInt]
    [:group_id             {:optional true} ms/PositiveInt]
    [:table_id             {:optional true} ms/PositiveInt]
    [:card_id              {:optional true} [:maybe ms/PositiveInt]]
    [:attribute_remappings {:optional true} [:maybe [:ref ::attribute-remappings]]]
    [:permission_id        {:optional true} [:maybe ms/PositiveInt]]]
   [:fn {:error/fn (fn [_ _] (trs "Invalid sandbox: an update needs an id, and a new sandbox needs a group_id and a table_id."))}
    (fn [{:keys [id group_id table_id]}]
      (boolean (or id (and group_id table_id))))]])

(mr/def ::impersonation-update
  "a connection impersonation policy to write alongside a permissions graph update"
  [:map
   [:group_id  ms/PositiveInt]
   [:db_id     ms/PositiveInt]
   [:attribute ms/NonBlankString]])

(mr/def ::graph-update-request
  "the permissions graph, plus the sandboxes and connection impersonations to write with it"
  [:map
   [:groups [:and
             [:multi {:dispatch map?}
              [true [:map-of
                     [:or [:ref ::group-id]
                      (mu/refuse #(tru "Invalid permissions graph: it must be keyed by group id."))]
                     [:multi {:dispatch map?}
                      [true [:map-of
                             [:or [:ref ::id]
                              (mu/refuse #(tru "Invalid permissions graph: permissions for a group must be keyed by database id."))]
                             [:or [:ref ::db-perms]
                              (mu/refuse #(tru "Invalid DB permissions: unrecognized permissions for a database."))]]]
                      [false [:or :nil
                              (mu/refuse #(tru "Invalid permissions graph: permissions for a group must be keyed by database id."))]]]]]
              [false (mu/refuse #(tru "Invalid permissions graph: it must be keyed by group id, then by database id."))]]
             [:fn {:error/fn (fn [_ _] (trs "Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."))}
              (fn [groups]
                (or (not (map? groups))
                    (every? (fn [db-graph] (every? valid-db-perms? (vals db-graph)))
                            (vals groups))))]]]
   [:revision       {:optional true} [:maybe ms/Int]]
   [:force          {:optional true} [:maybe :boolean]]
   [:sandboxes      {:optional true} [:maybe [:sequential [:ref ::sandbox-update]]]]
   [:impersonations {:optional true} [:maybe [:sequential [:ref ::impersonation-update]]]]])
