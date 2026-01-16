(ns metabase-enterprise.dependencies.findings
  (:require
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti ^:private instance-db-id
  "Gets the database id for a toucan instance"
  {:arglists '([toucan-instance])}
  t2/model)

(defmethod instance-db-id :default
  [toucan-instance]
  (:database_id toucan-instance))

(defmethod instance-db-id :model/Transform
  [toucan-instance]
  (some-> toucan-instance :source :query lib/database-id))

(defmethod instance-db-id :model/Segment
  [toucan-instance]
  (some-> toucan-instance :definition lib/database-id))

(defn upsert-analysis!
  "Given a Toucan entity, run its analysis and write the results into `:model/AnalysisFinding`.

  If any row exists already, it is replaced. If it does not exist, it is created."
  [toucan-instance]
  (when-not (lib-be/metadata-provider-cache)
    (throw (ex-info "FIXME: deps.findings/upsert-analysis! ran without reusing `MetadataProvider`s"
                    {:instance toucan-instance})))
  (when-let [db-id (instance-db-id toucan-instance)]
    (let [mp (lib-be/application-database-metadata-provider db-id)
          model (t2/model toucan-instance)
          results (if (models.dependency/is-native-entity? (deps.dependency-types/model->dependency-type model)
                                                           toucan-instance)
                    []
                    (try (deps.analysis/check-entity mp (deps.dependency-types/model->dependency-type model) (:id toucan-instance))
                         (catch Exception e
                           (log/error e "Error analyzing entity")
                           [(lib/validation-exception-error (.getMessage e))])))
          success (empty? results)]
      (deps.analysis-finding/upsert-analysis! (deps.dependency-types/model->dependency-type model) (:id toucan-instance) success results))))

(defn analyze-instances!
  "Given a series of toucan entities, upsert analyses for all of them and catch errors."
  [instances]
  (doseq [instance instances]
    (try (upsert-analysis! instance)
         (catch Exception e
           (log/errorf e "Analyzing entity %s %s failed"
                       (t2/model instance) (:id instance))))))

(def supported-entities
  "Entities supported by the analysis findings code"
  #{:card :transform :segment})

(mu/defn analyze-batch! :- nat-int?
  "Add or update analyses for a batch of entities.

  Takes in an entity type and batch size, and looks for a batch of entities with missing or out of date
  AnalysisFindings and then upsert new analyses for them."
  [type :- (into [:enum] supported-entities)
   batch-size :- pos-int?]
  (let [instances (deps.analysis-finding/instances-for-analysis type batch-size)]
    (lib-be/with-metadata-provider-cache
      (analyze-instances! instances))
    (count instances)))
