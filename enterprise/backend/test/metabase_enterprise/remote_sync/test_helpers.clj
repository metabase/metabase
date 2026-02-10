(ns metabase-enterprise.remote-sync.test-helpers
  "Test helpers for remote sync functionality, including MockSource implementation."
  (:require
   [clojure.string :as str]
   [clojure.test :as t]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn generate-collection-yaml
  "Generate YAML content for a collection with the given `entity-id` and `name`.
  Optionally accepts `:parent-id` for nested collections."
  [entity-id name & {:keys [parent-id]}]
  (format "name: %s
description: null
entity_id: %s
slug: %s
created_at: '2024-08-28T09:46:18.671622Z'
archived: false
type: null
parent_id: %s
personal_owner_id: null
namespace: null
authority_level: null
serdes/meta:
- id: %s
  label: %s
  model: Collection
archive_operation_id: null
archived_directly: null
is_sample: false
"
          name entity-id (str/replace (u/lower-case-en name) #"\s+" "_")
          (or parent-id "null") entity-id (str/replace (u/lower-case-en name) #"\s+" "_")))

(defn generate-v57-collection-yaml
  "Generate YAML content for a collection in v57 format. In v57, remote-synced collections
  used `type: remote-synced` instead of `is_remote_synced: true`. Used to test backward
  compatibility when importing exports from v57 Metabase instances. Optionally accepts
  `:parent-id` and `:type` (e.g., `\"remote-synced\"`)."
  [entity-id name & {:keys [parent-id type]}]
  (format "name: %s
description: null
entity_id: %s
slug: %s
created_at: '2024-08-28T09:46:18.671622Z'
archived: false
type: %s
parent_id: %s
personal_owner_id: null
namespace: null
authority_level: null
serdes/meta:
- id: %s
  label: %s
  model: Collection
archive_operation_id: null
archived_directly: null
is_sample: false
"
          name entity-id (str/replace (u/lower-case-en name) #"\s+" "_")
          (or type "null") (or parent-id "null") entity-id (str/replace (u/lower-case-en name) #"\s+" "_")))

(defn generate-card-yaml
  "Generate YAML content for a card with the given `entity-id`, `name`, and `collection-id`.
  Optionally accepts a `type` (defaults to `\"question\"`)."
  [entity-id name collection-id & [type]]
  (format "name: %s
description: null
entity_id: %s
created_at: '2024-08-28T09:46:24.692002Z'
creator_id: rasta@metabase.com
display: table
archived: false
collection_id: %s
collection_preview: true
collection_position: null
query_type: null
database_id: test-data (h2)
table_id: null
enable_embedding: false
embedding_params: null
made_public_by_id: null
public_uuid: null
parameters: []
parameter_mappings: []
dataset_query: {}
result_metadata: null
visualization_settings:
  column_settings: null
card_schema: 22
serdes/meta:
- id: %s
  label: %s
  model: Card
archived_directly: false
dashboard_id: null
metabase_version: v1.54.4-SNAPSHOT (c6780bb)
source_card_id: null
type: %s
document_id: null
"
          name entity-id collection-id entity-id (str/replace (u/lower-case-en name) #"\s+" "_") (or type "question")))

(defn generate-dashboard-yaml
  "Generate YAML content for a dashboard with the given `entity-id`, `name`, and `collection-id`.
  Optionally accepts `:dashcards` to include dashboard cards."
  [entity-id name collection-id & {:keys [dashcards]}]
  (let [dashcards-yaml (if dashcards
                         (str/join "\n" (map (fn [dc]
                                               (format "- entity_id: %s
  card_id: %s
  created_at: '2024-08-28T09:46:24.733016Z'
  row: 0
  col: 0
  size_x: 4
  size_y: 4
  action_id: null
  dashboard_tab_id: null
  inline_parameters: []
  parameter_mappings: []
  series: []
  visualization_settings:
    column_settings: null
  serdes/meta:
  - id: %s
    model: Dashboard
  - id: %s
    model: DashboardCard"
                                                       (:entity_id dc) (:card_id dc) entity-id (:entity_id dc)))
                                             dashcards))
                         "[]")]
    (format "name: %s
description: null
entity_id: %s
created_at: '2024-08-28T09:46:24.726993Z'
creator_id: rasta@metabase.com
archived: false
collection_id: %s
auto_apply_filters: true
collection_position: null
position: null
enable_embedding: false
embedding_params: null
made_public_by_id: null
public_uuid: null
show_in_getting_started: false
caveats: null
points_of_interest: null
parameters: []
serdes/meta:
- id: %s
  label: %s
  model: Dashboard
archived_directly: false
dashcards:
%s
initially_published_at: null
tabs: []
width: fixed
"
            name entity-id collection-id entity-id (str/replace (u/lower-case-en name) #"\s+" "_") dashcards-yaml)))

(defrecord MockSourceSnapshot [source-id base-url branch fail-mode files-atom]
  source.p/SourceSnapshot
  (list-files [_this]
    (case fail-mode
      :list-files-error (throw (Exception. "Failed to list files"))
      :network-error (throw (java.net.UnknownHostException. "Remote host not found"))
      :branch-error (throw (Exception. "Invalid branch specified"))
      :auth-error (throw (Exception. "Authentication failed"))
      :repo-not-found (throw (Exception. "Repository not found"))
      ;; Default success case - return files from atom
      (keys (get @files-atom branch {}))))

  (read-file [_this path]
    (case fail-mode
      :read-file-error (throw (Exception. "Failed to read file"))
      :network-error (throw (java.net.UnknownHostException. "Remote host not found"))
      :auth-error (throw (Exception. "Authentication failed"))
      :repo-not-found (throw (Exception. "Repository not found"))
      :branch-error (throw (Exception. "Invalid branch specified"))
      ;; Default success case - return file content from atom
      (get-in @files-atom [branch path] "")))

  (write-files! [_this _message files]
    (case fail-mode
      :write-files-error (throw (Exception. "Failed to write files"))
      :store-error (throw (Exception. "Store failed"))
      :network-error (throw (java.net.UnknownHostException. "Remote host not found"))
      ;; Default success case - handle both writes and removals
      (let [write-entries (remove #(or (:remove? %) (str/blank? (:path %))) files)
            removal-prefixes (into #{} (comp (filter :remove?)
                                             (map :path)
                                             (remove str/blank?))
                                   files)
            current-files (get @files-atom branch {})
            ;; Remove files matching removal prefixes
            after-removals (into {}
                                 (remove (fn [[path _]]
                                           (some #(or (= path %) (str/starts-with? path %))
                                                 removal-prefixes))
                                         current-files))
            ;; Add new files
            final-files (into after-removals (map (juxt :path :content) write-entries))]
        (swap! files-atom assoc branch final-files)))
    "write-files-version")

  (version [_this]
    "mock-version"))

(defrecord MockSource [source-id base-url branch fail-mode files-atom branches-atom]
  source.p/Source
  (create-branch [_this branch _base]
    (swap! branches-atom conj [branch (str branch "-ref")]))

  (branches [_this]
    (case fail-mode
      :branches-error (throw (java.net.UnknownHostException. "Network error"))
      :auth-error (throw (Exception. "Authentication failed"))
      :repo-not-found (throw (Exception. "Repository not found"))
      ;; Default success case
      @branches-atom))

  (default-branch [_this]
    "main")

  (snapshot [_this]
    (->MockSourceSnapshot source-id base-url branch fail-mode files-atom)))

(defn create-mock-source
  "Create a mock Source for testing. Optionally accepts `:branch`, `:fail-mode`, and `:initial-files`."
  [& {:keys [branch fail-mode initial-files]
      :or {branch "main"
           fail-mode nil
           initial-files nil}}]
  (let [default-files {"main" {"collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/M-Q4pcV0qkiyJ0kiSWECl_some_collection.yaml"
                               (generate-collection-yaml "M-Q4pcV0qkiyJ0kiSWECl" "Some Collection")

                               "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/cards/f1C68pznmrpN1F5xFDj6d_some_question.yaml"
                               (generate-card-yaml "f1C68pznmrpN1F5xFDj6d" "Some Question" "M-Q4pcV0qkiyJ0kiSWECl")

                               "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/dashboards/Q_jD-f-9clKLFZ2TfUG2h_shared_dashboard.yaml"
                               (generate-dashboard-yaml "Q_jD-f-9clKLFZ2TfUG2h" "Shared Dashboard" "M-Q4pcV0qkiyJ0kiSWECl"
                                                        :dashcards [{:entity_id "UkpFcfUZMZt9ehChwnrAO" :card_id "f1C68pznmrpN1F5xFDj6d"}])}

                       "develop" {"collections/test-dev-collectionxx-_/test-dev-collection.yaml"
                                  (generate-collection-yaml "test-dev-collectionxx" "Dev Collection")

                                  "collections/test-dev-collectionxx-_/cards/test-dev-card.yaml"
                                  (generate-card-yaml "test-dev-cardxxxxxxxx" "Dev Card" "test-dev-collectionxx")}}

        files-atom (atom (or initial-files default-files))
        branches-atom (atom #{["main" "main-ref"] ["develop" "develop-ref"]})]
    (->MockSource "test-source" "https://test.example.com" branch fail-mode files-atom branches-atom)))

(defn clean-object
  "Test fixture that resets the RemoteSyncObject table before running tests to prevent existing
  entries from affecting dirty state checks."
  [f]
  (let [old-models (t2/select :model/RemoteSyncObject)]
    (try
      (t2/delete! :model/RemoteSyncObject)
      (f)
      (finally
        (t2/delete! :model/RemoteSyncObject)
        (when (seq old-models)
          (t2/insert! :model/RemoteSyncObject old-models))))))

(defmacro with-clean-object
  "Execute `body` with a clean RemoteSyncObject table."
  [& body]
  `(clean-object (fn [] ~@body)))

(defn clean-task-table
  "Test fixture that resets the RemoteSyncTask table to an empty state before running tests."
  [f]
  (let [old-models (t2/select :model/RemoteSyncTask)]
    (try
      (t2/delete! :model/RemoteSyncTask)
      (f)
      (finally
        (t2/delete! :model/RemoteSyncTask)
        (when (seq old-models)
          (t2/insert! :model/RemoteSyncTask old-models))))))

(defn clean-optional-feature-models
  "Test fixture that cleans Transform, TransformTag, and PythonLibrary tables to prevent
  conflict detection during first-import tests."
  [f]
  (let [old-transforms (t2/select :model/Transform)
        old-tags (t2/select :model/TransformTag :built_in_type nil)
        old-libs (t2/select :model/PythonLibrary)]
    (try
      (t2/delete! :model/TransformTag :built_in_type nil)
      (t2/delete! :model/Transform)
      (t2/delete! :model/PythonLibrary)
      (f)
      (finally
        (t2/delete! :model/TransformTag :built_in_type nil)
        (t2/delete! :model/Transform)
        (t2/delete! :model/PythonLibrary)
        (when (seq old-transforms) (t2/insert! :model/Transform old-transforms))
        (when (seq old-tags) (t2/insert! :model/TransformTag old-tags))
        (when (seq old-libs) (t2/insert! :model/PythonLibrary old-libs))))))

(def clean-remote-sync-state
  "Composed test fixture that ensures RemoteSyncObject, RemoteSyncTask, and optional feature
  model tables (Transform, TransformTag, PythonLibrary) are clean."
  (t/compose-fixtures clean-object (t/compose-fixtures clean-task-table clean-optional-feature-models)))

(defn generate-table-yaml
  "Generate YAML content for a table with the given `table-name` and `db-name`.
  Optionally accepts `:schema`, `:is-published` (defaults to true), and `:description`."
  [table-name db-name & {:keys [schema is-published description]
                         :or {is-published true
                              description nil}}]
  (format "name: %s
description: %s
entity_type: entity/GenericTable
active: true
display_name: %s
visibility_type: null
schema: %s
points_of_interest: null
caveats: null
show_in_getting_started: false
field_order: database
initial_sync_status: complete
is_upload: false
database_require_filter: false
is_defective_duplicate: false
is_writable: false
data_authority: unconfigured
data_source: null
owner_email: null
owner_user_id: null
is_published: %s
created_at: '2024-08-28T09:46:18.671622Z'
archived_at: null
deactivated_at: null
data_layer: null
db_id: %s
collection_id: null
serdes/meta:
- id: %s
  model: Database
%s- id: %s
  model: Table
"
          table-name
          (or description "null")
          (str/replace (u/upper-case-en table-name) #"_" " ")
          (or schema "null")
          is-published
          db-name
          db-name
          (if schema (format "- id: %s\n  model: Schema\n" schema) "")
          table-name))

(defn generate-field-yaml
  "Generate YAML content for a field with the given `field-name`, `table-name`, and `db-name`.
  Optionally accepts `:schema`, `:base-type`, `:description`, and `:database-type`."
  [field-name table-name db-name & {:keys [schema base-type description database-type]
                                    :or {base-type "type/Text"
                                         database-type "VARCHAR"
                                         description nil}}]
  (format "name: %s
display_name: %s
description: %s
created_at: '2024-08-28T09:46:18.671622Z'
active: true
visibility_type: normal
table_id:
- %s
- %s
- %s
database_type: %s
base_type: %s
effective_type: null
semantic_type: null
database_is_auto_increment: false
database_required: false
fk_target_field_id: null
dimensions: []
json_unfolding: false
parent_id: null
coercion_strategy: null
preview_display: true
position: 1
custom_position: 0
database_position: 0
has_field_values: null
settings: null
caveats: null
points_of_interest: null
nfc_path: null
serdes/meta:
- id: %s
  model: Database
%s- id: %s
  model: Table
- id: %s
  model: Field
database_default: null
database_indexed: null
database_is_generated: null
database_is_nullable: null
database_is_pk: null
database_partitioned: null
"
          field-name
          (str/replace (u/upper-case-en field-name) #"_" " ")
          (or description "null")
          db-name
          (or schema "null")
          table-name
          database-type
          base-type
          db-name
          (if schema (format "- id: %s\n  model: Schema\n" schema) "")
          table-name
          field-name))

(defn generate-segment-yaml
  "Generate YAML content for a segment with the given `segment-name`, `table-name`, and `db-name`.
  Optionally accepts `:schema`, `:description`, `:entity-id`, and `:filter-field-name`."
  [segment-name table-name db-name & {:keys [schema description entity-id filter-field-name]
                                      :or {description "Test segment"
                                           filter-field-name "Some Field"}}]
  (let [eid (or entity-id segment-name)]
    (format "archived: false
caveats: null
created_at: '2024-08-28T09:46:18.671622Z'
creator_id: rasta@metabase.com
definition:
  database: %s
  query:
    filter:
    - <
    - - field
      - - %s
        - %s
        - %s
        - %s
      - null
    - 18
    source-table:
    - %s
    - %s
    - %s
  type: query
description: %s
entity_id: %s
name: %s
points_of_interest: null
show_in_getting_started: false
table_id:
- %s
- %s
- %s
serdes/meta:
- id: %s
  label: %s
  model: Segment
"
            db-name
            db-name
            (or schema "null")
            table-name
            filter-field-name
            db-name
            (or schema "null")
            table-name
            description
            eid
            segment-name
            db-name
            (or schema "null")
            table-name
            eid
            (str/replace (u/lower-case-en segment-name) #"\s+" "_"))))

(defn generate-action-yaml
  "Generate YAML content for an action with the given `entity-id`, `name`, and `model-id`.
  Optionally accepts `:type` (defaults to `\"implicit\"`) and `:kind` (defaults to `\"row/create\"`)."
  [entity-id name model-id & {:keys [type kind]
                              :or {type "implicit"
                                   kind "row/create"}}]
  (format "name: %s
description: null
entity_id: %s
created_at: '2024-08-28T09:46:24.692002Z'
creator_id: rasta@metabase.com
archived: false
model_id: %s
type: %s
parameters: []
parameter_mappings: []
visualization_settings:
  column_settings: null
public_uuid: null
made_public_by_id: null
%s
serdes/meta:
- id: %s
  label: %s
  model: Action
"
          name
          entity-id
          model-id
          type
          (if (= type "implicit")
            (format "implicit:\n- kind: %s\n" kind)
            "")
          entity-id
          (str/replace (u/lower-case-en name) #"\s+" "_")))

(defn generate-transform-yaml
  "Generate YAML content for a transform with the given `entity-id` and `name`.
  Optionally accepts `:collection-id` for transforms inside a collection."
  [entity-id name & {:keys [collection-id]}]
  (format "name: %s
description: null
entity_id: %s
collection_id: %s
created_at: '2024-08-28T09:46:18.671622Z'
creator_id: rasta@metabase.com
source_database_id: test-data (h2)
source:
  type: query
  query:
    database: test-data (h2)
    type: query
    query:
      source-table:
      - test-data (h2)
      - PUBLIC
      - VENUES
target:
  type: table
  name: test_output
  schema: PUBLIC
serdes/meta:
- id: %s
  label: %s
  model: Transform
"
          name entity-id (or collection-id "null") entity-id (str/replace (u/lower-case-en name) #"\s+" "_")))

(defn generate-measure-yaml
  "Generate YAML content for a measure with the given `measure-name`, `table-name`, and `db-name`.
  Optionally accepts `:schema`, `:description`, `:entity-id`, and `:agg-field-name`."
  [measure-name table-name db-name & {:keys [schema description entity-id agg-field-name]
                                      :or {description "Test measure"
                                           agg-field-name "Some Field"}}]
  (let [eid (or entity-id measure-name)]
    (format "archived: false
created_at: '2024-08-28T09:46:18.671622Z'
creator_id: rasta@metabase.com
definition:
  database: %s
  query:
    aggregation:
    - - sum
      - - field
        - - %s
          - %s
          - %s
          - %s
        - null
    source-table:
    - %s
    - %s
    - %s
  type: query
description: %s
entity_id: %s
name: %s
table_id:
- %s
- %s
- %s
serdes/meta:
- id: %s
  label: %s
  model: Measure
"
            db-name
            db-name
            (or schema "null")
            table-name
            agg-field-name
            db-name
            (or schema "null")
            table-name
            description
            eid
            measure-name
            db-name
            (or schema "null")
            table-name
            eid
            (str/replace (u/lower-case-en measure-name) #"\s+" "_"))))

(defn generate-snippet-yaml
  "Generates YAML content for a NativeQuerySnippet."
  [entity-id name content & {:keys [collection-id]}]
  (format "name: %s
description: null
entity_id: %s
content: '%s'
archived: false
template_tags: null
created_at: '2024-08-28T09:46:18.671622Z'
creator_id: rasta@metabase.com
collection_id: %s
serdes/meta:
- id: %s
  label: %s
  model: NativeQuerySnippet
"
          name entity-id content (or collection-id "null")
          entity-id (str/replace (u/lower-case-en name) #"\s+" "_")))
