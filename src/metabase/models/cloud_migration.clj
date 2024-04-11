(ns metabase.models.cloud-migration
  "A model representing a migration to cloud."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def CloudMigration "Cloud Migration" :model/CloudMigration)

(doto :model/CloudMigration
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/CloudMigration [_model] :cloud_migration)

(t2/deftransforms :model/CloudMigration
  {:state mi/transform-keyword})
