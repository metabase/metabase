(ns metabase-enterprise.semantic-layer-import.interface
  "What a source implements: [[raw->ir]], which parses a semantic layer as the source writes it into the IR (see
  [[metabase-enterprise.semantic-layer-import.schemas.ir]]). [[metabase-enterprise.semantic-layer-import.core/convert!]]
  loads a source's namespace the first time it converts something of that source's, calls its method, and does the
  rest of the import the same way for every source."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::raw
  "A semantic layer as its source writes it, before it is parsed: for dbt, the path of the `manifest.json` `dbt parse`
  writes. Its shape is the source's own, which the source's [[raw->ir]] method checks."
  [:schema {::mr/deliberately-open true, :description "a semantic layer as its source writes it"} :any])

(mr/def ::options
  "A source's own options, next to the import's config: for dbt, `:entity-models` (see
  `:metabase-enterprise.semantic-layer-import.dbt.parse/options`). Each source's [[raw->ir]] method checks its own."
  [:map {::mr/deliberately-open true, :description "a source's own options"}])

(defmulti raw->ir
  "Parse `raw`, a semantic layer as the `source-type` source writes it (see `::raw`), into an `::ir/semantic-layer`,
  with the source's own `options` (see `::options`), `{}` when there are none. Whatever the IR has no place for goes
  in its `:unsupported` with a reason, rather than failing the run.

  A source implements it with `mu/defmethod`, giving `raw` and `options` its own schemas, in the namespace
  [[metabase-enterprise.semantic-layer-import.core]] loads for the source."
  {:arglists '([source-type raw options])}
  (fn [source-type _raw _options]
    source-type))
