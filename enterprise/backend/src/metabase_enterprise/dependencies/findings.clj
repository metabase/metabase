(ns metabase-enterprise.dependencies.findings
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def ^:private model->dependency-type
  {:model/Card :card
   :model/Transform :transform
   :model/Segment :segment})

(defmulti ^:private get-db-id
  "Gets the database id for a toucan instance"
  {:arglists '([toucan-instance])}
  t2/model)

(defmethod get-db-id :default
  [toucan-instance]
  (:database_id toucan-instance))

(defmethod get-db-id :model/Transform
  [toucan-instance]
  (some-> toucan-instance :source :query lib/database-id))

(defmethod get-db-id :model/Segment
  [toucan-instance]
  (some-> toucan-instance :definition lib/database-id))

(defn upsert-analysis!
  "Given a Toucan entity, run its analysis and write the results into `:model/AnalysisFinding`.

  If any row exists already, it is replaced. If it does not exist, it is created."
  [toucan-instance]
  (when-not (lib-be/metadata-provider-cache)
    (log/warn "FIXME: deps.findings/upsert-analysis! ran without reusing `MetadataProvider`s"))
  (when-let [db-id (get-db-id toucan-instance)]
    (let [mp (lib-be/application-database-metadata-provider db-id)
          model (t2/model toucan-instance)
          results (try (deps.analysis/check-entity mp (model->dependency-type model) (:id toucan-instance))
                       (catch Exception e
                         (log/error "Error analyzing entity" e)
                         [(lib/validation-error (.getMessage e))]))
          success (empty? results)]
      (deps.analysis-finding/upsert-analysis! (model->dependency-type model) (:id toucan-instance) success results))))

(defn analyze-instances!
  [instances]
  (doseq [instance instances]
    (try (upsert-analysis! instance)
         (catch Exception e
           (log/errorf e "Analyzing entity %s %s failed"
                       (t2/model instance) (:id instance))))))

(mu/defn analyze-batch! :- :int
  [type :- [:enum :card :transform :segment]
   batch-size :- :int]
  (let [instances (deps.analysis-finding/instances-for-analysis type batch-size)]
    (lib-be/with-metadata-provider-cache
      (analyze-instances! instances))
    (count instances)))
