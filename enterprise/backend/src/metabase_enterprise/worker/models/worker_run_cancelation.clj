(ns metabase-enterprise.worker.models.worker-run-cancelation
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(methodical/defmethod t2/table-name :model/WorkerRunCancelation [_model] :worker_run_cancelation)

(derive :model/WorkerRunCancelation :metabase/model)

(defn mark-cancel-started-run!
  "Mark a started run for cancelation."
  ([run-id]
   (mark-cancel-started-run! run-id {}))
  ([run-id properties]
   (t2/insert! :model/WorkerRunCancelation
               (assoc properties
                      :run_id run-id)
               {:where [:exists {:select [1]
                                 :from   [:worker_run]
                                 :where  [:and
                                          [:= :worker_run.run_id run-id]
                                          :worker_run.is_active]}]})))

(defn reducible-canceled-local-runs
  "Return a reducible sequence of local canceled runs."
  []
  (t2/reducible-select :model/WorkerRunCancelation))

(defn delete-cancelation!
  "Delete a cancelation once it has been handled."
  [run-id]
  (t2/delete! :model/WorkerRunCancelation
              :run-id run-id))

(defn delete-old-canceling-runs!
  "Delete cancelations that are no longer running."
  []
  (t2/delete! :model/WorkerRunCancelation
              :run_id [:not [:in {:select :run_id
                                  :from   [[:worker_run_cancelation :wrc]]
                                  :join   [[:worker_run :wr] [:= :wr.run_id :wrc.run_id]]
                                  :where  :wr.is_active}]]))
