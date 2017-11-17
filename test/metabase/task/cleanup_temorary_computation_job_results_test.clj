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

;; check that cleanup-temporary-results deletes :temporary ComputationJobResult objects
(expect
  (tt/with-temp* [ComputationJob       [{job-id :id} {:type   :simple-job
                                                      :status :done}]
                  ComputationJobResult [{result-id :id} {:job_id     job-id
                                                         :permanence :temporary
                                                         :payload    1}]]
    (let [initial-count (db/count ComputationJobResult)]
      (db/update! ComputationJobResult result-id
        :created_at (->> #'task/temporary-result-lifetime
                         var-get
                         (t/minus (t/now) (t/days 1))
                         t.coerce/to-sql-time))
      (#'task/cleanup-temporary-results!)
      (> initial-count (db/count ComputationJobResult)))))
