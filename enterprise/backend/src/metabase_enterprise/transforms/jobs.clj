(ns metabase-enterprise.transforms.jobs
  (:require
   [metabase-enterprise.transforms.execute :as execute]
   [metabase-enterprise.transforms.ordering :as ordering]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- get-deps [ordering transform-ids]
  (loop [found #{}
         [current-transform & more-transforms] transform-ids]
    (if current-transform
      (recur (conj found current-transform)
             (if (found current-transform)
               more-transforms
               (into more-transforms (get ordering current-transform))))
      found)))

(defn- next-transform [{:keys [ordering transforms-by-id]} complete]
  (-> (ordering/available-transforms ordering #{} complete)
      first
      transforms-by-id))

(defn- get-plan [transform-ids]
  (let [all-transforms (t2/select :model/Transform)
        global-ordering (ordering/transform-ordering all-transforms)
        relevant-ids (get-deps global-ordering transform-ids)]
    {:transforms-by-id (into {}
                             (keep (fn [{:keys [id] :as transform}]
                                     (when (relevant-ids id)
                                       [id transform])))
                             all-transforms)
     :ordering (select-keys global-ordering relevant-ids)}))

(defn execute-transforms! [transform-ids-to-run {:keys [run-method start-promise]}]
  (let [plan (get-plan transform-ids-to-run)]
    (when start-promise
      (deliver start-promise :started))
    (loop [complete #{}]
      (when-let [current-transform (next-transform plan complete)]
        (log/info "Executing job transform" (pr-str (:id current-transform)))
        (execute/execute-mbql-transform! current-transform {:run-method run-method})
        (recur (conj complete (:id current-transform)))))))

(defn execute-jobs!
  [job-ids opts]
  (let [transforms (t2/select-fn-set :transform_id
                                     :transform_job_tags
                                     {:select :transform_tags.transform_id
                                      :from :transform_job_tags
                                      :left-join [:transform_tags [:=
                                                                   :transform_tags.tag_id
                                                                   :transform_job_tags.tag_id]]
                                      :where [:in :transform_job_tags.job_id job-ids]})]
    (log/info "Executing transform jobs" (pr-str job-ids) "with transforms" (pr-str transforms))
    (execute-transforms! transforms opts)))
