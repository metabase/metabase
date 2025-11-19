(ns metabase-enterprise.representations.dev-helpers
  "TOTALLY TEMPORARY HACKS.
  Helper functions for experimenting with representations in the REPL to check
  that what we export matches what we'd want to use on import."
  (:require
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn export-card
  "Export a card (model/question) by ID to a YAML file.
   
   Usage: (export-card 123 \"/tmp/my-model.yml\")"
  [card-id filepath]
  (let [card (t2/select-one :model/Card :id card-id)
        representation (export/export-entity card)
        yaml-str (rep-yaml/generate-string representation)]
    (spit filepath yaml-str)
    (log/info "Exported card" card-id "to" filepath)))

(defn import-card
  "Import a card from a YAML file, updating the specified card ID.
   
   Usage: (import-card \"/tmp/my-model.yml\" 123)"
  [filepath card-id]
  (let [yaml-str (slurp filepath)
        representation (rep-yaml/parse-string yaml-str)
        sample-db (t2/select-one :model/Database :name "Sample Database")
        ref-index (v0-common/map-entity-index
                   {(str "database-" (:id sample-db)) sample-db})]
    (import/update! representation card-id ref-index)))

(defn import-card-string
  "Import a card from a YAML string, updating the specified card ID.
   
   Usage: (import-card-string \"_type: model\\nname: My Model\\n...\" 123)"
  [yaml-str card-id]
  (let [representation (rep-yaml/parse-string yaml-str)
        sample-db (t2/select-one :model/Database :name "Sample Database")
        ref-index (v0-common/map-entity-index
                   {(str "database-" (:id sample-db)) sample-db})]
    (import/update! representation card-id ref-index)))
