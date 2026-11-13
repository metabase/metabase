(ns metabase-enterprise.dependencies.findings-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest failed-entity-columns-cover-every-analyzed-type-test
  (is (= deps.analysis-finding/analyzable-entities
         (set (keys @#'dependencies.db/failed-entity-columns)))))

(deftest cause-columns-cover-every-source-type-test
  (is (= (set (mc/children (mr/resolve-schema ::lib.schema.validate/source-entity-type)))
         (set (keys @#'deps.findings/cause-columns)))))
