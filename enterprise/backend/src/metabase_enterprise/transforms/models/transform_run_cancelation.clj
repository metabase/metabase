(ns metabase-enterprise.transforms.models.transform-run-cancelation
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRunCancelation [_model] :transform_run_cancelation)

(derive :model/TransformRunCancelation :metabase/model)

(defn mark-cancel-started-run!
  "Mark a started run for cancelation."
  ([run-id]
   (mark-cancel-started-run! run-id {}))
  ([run-id properties]
   (t2/insert! :model/TransformRunCancelation
               (assoc properties
                      :run_id run-id)
               {:where [:exists {:select [1]
                                 :from   [:transform_run]
                                 :where  [:and
                                          [:= :transform_run.id run-id]
                                          :transform_run.is_active]}]})))

(defn reducible-canceled-local-runs
  "Return a reducible sequence of local canceled runs."
  []
  (t2/reducible-select :model/TransformRunCancelation))

(defn delete-cancelation!
  "Delete a cancelation once it has been handled."
  [run-id]
  (t2/delete! :model/TransformRunCancelation
              :run_id run-id
              :run_id [:not-in {:select :wr.id
                                :from   [[:transform_run :wr]]
                                :where  :wr.is_active}]))

(defn delete-old-canceling-runs!
  "Delete cancelations for runs that are no longer running."
  []
  (t2/delete! :model/TransformRunCancelation
              :run_id [:not-in {:select :wr.id
                                :from   [[:transform_run :wr]]
                                :where  :wr.is_active}]))
