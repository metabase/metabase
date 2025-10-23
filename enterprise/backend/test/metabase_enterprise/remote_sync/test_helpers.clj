(ns metabase-enterprise.remote-sync.test-helpers
  "Test helpers for remote sync functionality, including MockSource implementation."
  (:require
   [clojure.string :as str]
   [clojure.test :as t]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn generate-collection-yaml
  "Generates YAML content for a collection.

  Args:
    entity-id: The unique identifier for the collection.
    name: The name of the collection.
    parent-id: Optional parent collection ID.

  Returns:
    A string containing the YAML representation of the collection."
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

(defn generate-card-yaml
  "Generates YAML content for a card.

  Args:
    entity-id: The unique identifier for the card.
    name: The name of the card.
    collection-id: The ID of the collection containing this card.

  Returns:
    A string containing the YAML representation of the card."
  [entity-id name collection-id]
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
type: question
document_id: null
"
          name entity-id collection-id entity-id (str/replace (u/lower-case-en name) #"\s+" "_")))

(defn generate-dashboard-yaml
  "Generates YAML content for a dashboard.

  Args:
    entity-id: The unique identifier for the dashboard.
    name: The name of the dashboard.
    collection-id: The ID of the collection containing this dashboard.
    dashcards: Optional collection of dashboard cards to include.

  Returns:
    A string containing the YAML representation of the dashboard."
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
      ;; Default success case - write files to atom
      (swap! files-atom assoc branch (into {} (map (juxt :path :content) files)))))

  (version [_this]
    "mock-version"))

(defn create-mock-source
  "Create a mock Source for testing"
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
  "Reset the object table before running tests to prevent existing extries from affecting dirty state checks"
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
  "Macro to wrap a body to execute in a clean change log table"
  [& body]
  `(clean-object (fn [] ~@body)))

(defn clean-task-table
  "Reset the task table to an empty state before running tests."
  [f]
  (let [old-models (t2/select :model/RemoteSyncTask)]
    (try
      (t2/delete! :model/RemoteSyncTask)
      (f)
      (finally
        (t2/delete! :model/RemoteSyncTask)
        (when (seq old-models)
          (t2/insert! :model/RemoteSyncTask old-models))))))

(def clean-remote-sync-state
  "Fixture to make sure sync state is clean"
  (t/compose-fixtures clean-object clean-task-table))
