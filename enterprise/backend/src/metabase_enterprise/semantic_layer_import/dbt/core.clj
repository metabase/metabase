(ns metabase-enterprise.semantic-layer-import.dbt.core
  "The dbt source: [[interface/raw->ir]] for `:dbt`, which parses the `manifest.json` `dbt parse` writes into the IR
  (see [[metabase-enterprise.semantic-layer-import.dbt.parse]]), with `:entity-models` choosing where an entity joins
  when several semantic models are keyed by it (see `::parse/options`).
  [[metabase-enterprise.semantic-layer-import.core/convert!]] loads this namespace the first time it converts a dbt
  project. See the README in this directory for how to produce the manifest and import the result."
  (:require
   [metabase-enterprise.semantic-layer-import.dbt.parse :as parse]
   [metabase-enterprise.semantic-layer-import.interface :as interface]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.util.malli :as mu]))

(mu/defmethod interface/raw->ir :dbt :- ::ir/semantic-layer
  [_source-type      :- [:= :dbt]
   manifest-filename :- :string
   options           :- ::parse/options]
  (parse/parse-manifest-file options manifest-filename))
