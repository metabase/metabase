(ns metabase-enterprise.data-testing.models.data-test-run
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.default-fields :as t2.default-fields]))

(methodical/defmethod t2/table-name :model/DataTestRun [_model] :data_test_run)

(derive :model/DataTestRun :metabase/model)

(t2.default-fields/define-default-fields :model/DataTestRun
  data-testing.db/run-columns)

(defn- stored-result-decoder
  "A function from a stored result as it reads from JSON, with every map key a keyword, to the result as the run
  reported it: keywords where the schema has them, and the keys of rows and tables as strings."
  []
  (mr/cached ::stored-result-decoder
             ::data-testing.schema/stored-run-result
             #(mc/decoder ::data-testing.schema/stored-run-result
                          (mtx/transformer mtx/json-transformer {:name :normalize}))))

(defn- result-out
  "The stored result read from the JSON `s`, or nil when it is not one this version can read."
  [s]
  (when-let [result (mi/json-out-with-keywordization s)]
    (let [decoded ((stored-result-decoder) result)]
      (if (mr/validate ::data-testing.schema/stored-run-result decoded)
        decoded
        (log/warn "Ignoring a data_test_run.result that is not a stored run result")))))

(t2/deftransforms :model/DataTestRun
  {:status    mi/transform-keyword
   :test_type mi/transform-keyword
   :result    {:in mi/json-in :out result-out}})

(methodical/defmethod t2/batched-hydrate [:model/DataTestRun :initiated_by_user]
  "Add the user who started each run, or nil."
  [_model _k runs]
  (let [user-ids (into #{} (keep :initiated_by) runs)
        id->user (when (seq user-ids) (data-testing.db/users-by-id user-ids))]
    (for [run runs]
      (assoc run :initiated_by_user (get id->user (:initiated_by run))))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DataTestRun [_model]
  {:skip? false})
