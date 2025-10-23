(ns metabase-enterprise.dependencies.findings
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase.lib-be.core :as lib-be]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn upsert-analysis!
  "Given a Toucan entity, run its analysis and write the results into `:model/AnalysisFinding`.

  If any row exists already, it is replaced. If it does not exist, it is created."
  [entity-type toucan-instance]
  (when-not (lib-be/metadata-provider-cache)
    (log/warn "FIXME: deps.findings/upsert-analysis! ran without reusing `MetadataProvider`s"))
  (let [mp (lib-be/application-database-metadata-provider)]))
