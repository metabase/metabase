(ns metabase.task.cleanup-temorary-computation-job-results-test
  (:require [clj-time
             [coerce :as t.coerce]
             [core :as t]]
            [expectations :refer :all]
            [metabase.models
             [computation-job :refer [ComputationJob]]
             [computation-job-result :refer [ComputationJobResult]]]
            [metabase.task.cleanup-temporary-computation-job-results :as task]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(tt/expect-with-temp
 [ComputationJob       [{job-id :id} {:type   :simple-job
                                      :status :done}]
  ComputationJobResult [{result-id :id} {:job_id     job-id
                                         :permanence :temporary
                                         :payload    1}]]
  true
  (let [c1 (count (ComputationJobResult))]
    (db/update! ComputationJobResult result-id
                :created_at (->> #'task/temporary-result-lifetime
                                 var-get
                                 (t/minus (t/now) (t/days 1))
                                 t.coerce/to-sql-time))
    (#'task/cleanup-temporary-results!)
    (> c1 (count (ComputationJobResult)))))
