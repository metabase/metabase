(ns metabase-enterprise.semantic-layer-import.dbt.core
  "Import the semantic layer of a dbt project: parse the `manifest.json` `dbt parse` writes into the IR (see
  [[metabase-enterprise.semantic-layer-import.dbt.parse]]) and hand it to
  [[metabase-enterprise.semantic-layer-import.core/convert!]], which writes the serdes tree. See the README in this
  directory for how to produce the manifest and import the result."
  (:require
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
   [metabase-enterprise.semantic-layer-import.dbt.parse :as parse]
   [metabase-enterprise.semantic-layer-import.schemas.config :as config]
   [metabase.util.malli :as mu]))

(mu/defn convert! :- ::semantic-layer-import/report
  "Parse the dbt `manifest` file, with `:entity-models` choosing where an entity joins when several semantic models
  are keyed by it (see `::parse/options`), and import it with `config` (see `::config/config`) into a serdes tree
  under `out-dir`. Returns a report of what was converted and what was not (see `::semantic-layer-import/report`).
  Check the tree with [[semantic-layer-import/preflight]], then import it with

      MB_DB_CONNECTION_URI=... clojure -M:run:ee import <out-dir> -e"
  [{:keys [manifest entity-models out-dir config]} :- [:map {:closed true}
                                                       [:manifest      :string]
                                                       [:entity-models {:optional true} [:map-of :string :string]]
                                                       [:out-dir       :string]
                                                       [:config        ::config/config]]]
  (semantic-layer-import/convert! {:semantic-layer (parse/parse-manifest-file (cond-> {}
                                                                                entity-models
                                                                                (assoc :entity-models entity-models))
                                                                              manifest)
                                   :out-dir        out-dir
                                   :config         config}))

(comment
  (convert! {:manifest "/path/to/dbt-business-intelligence/target/manifest.json"
             :out-dir  "/path/to/dbt-metrics-serdes"
             :config   {:databases     {"dbt_bi" "Sales DB"}
                        :driver        :postgres
                        :creator-email "admin@example.com"}})
  (semantic-layer-import/preflight {:out-dir "/path/to/dbt-metrics-serdes"}))
