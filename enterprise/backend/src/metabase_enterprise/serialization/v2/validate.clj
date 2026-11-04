(ns metabase-enterprise.serialization.v2.validate
  "Checks the entities of an ingestion against the schemas of their models, without loading anything."
  (:require
   [metabase-enterprise.serialization.schema :as serialization.schema]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase.lib.core :as lib]
   [metabase.models.schema :as models.schema]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::ingestion
  "A source of serialized entities to check."
  [:fn {:error/message "an Ingestable"} #(satisfies? serdes.ingest/Ingestable %)])

(mu/defn- entity-error :- [:maybe ::serialization.schema/validation-error]
  "Why the entity at `path` of `ingestion` does not match the schema of its model, or nil when it does or its model
  has no serialization spec."
  [ingestion :- ::ingestion
   path      :- ::models.schema/external-meta]
  (let [model-name (:model (last path))]
    (when-let [spec (serdes/make-spec model-name nil)]
      (try
        (when-let [error (serdes/external-error model-name spec
                                                (lib/normalize (:schema spec) (serdes.ingest/ingest-one ingestion path)))]
          {:path (serdes/log-path-str path) :message (pr-str error)})
        (catch Exception e
          {:path (serdes/log-path-str path) :message (ex-message e)})))))

(mu/defn validate-ingestion :- [:sequential ::serialization.schema/validation-error]
  "The files of `ingestion` it could not read, and its entities that do not match the schema of their model. Ingested
  YAML carries strings for keywords, so each entity is normalized by its schema first. Reading the list of entities
  is what records the files that cannot be read."
  [ingestion :- ::ingestion]
  (let [paths (serdes.ingest/ingest-list ingestion)]
    (into (mapv (fn [e] {:path (or (:file (ex-data e)) "") :message (ex-message e)})
                (serdes.ingest/ingest-errors ingestion))
          (keep #(entity-error ingestion %))
          paths)))
