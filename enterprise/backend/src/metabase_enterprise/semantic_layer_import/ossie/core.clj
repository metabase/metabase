(ns metabase-enterprise.semantic-layer-import.ossie.core
  "The Apache Ossie source: [[interface/raw->ir]] for `:ossie`, which parses a semantic model document, YAML or JSON in
  either of the shapes in use (0.1.1 and 0.2.0.dev0, see [[metabase-enterprise.semantic-layer-import.ossie.document]]),
  into the IR (see [[metabase-enterprise.semantic-layer-import.ossie.parse]]), with `:dialect` choosing which of the
  document's SQL dialects is read (see `::parse/options`).
  [[metabase-enterprise.semantic-layer-import.core/convert!]] loads this namespace the first time it converts an Ossie
  document. See the README in this directory for how each Ossie construct converts or why it does not."
  (:require
   [metabase-enterprise.semantic-layer-import.interface :as interface]
   [metabase-enterprise.semantic-layer-import.ossie.parse :as parse]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.util.malli :as mu]))

(mu/defmethod interface/raw->ir :ossie :- ::ir/semantic-layer
  [_source-type :- [:= :ossie]
   filename     :- :string
   options      :- ::parse/options]
  (parse/parse-file options filename))
