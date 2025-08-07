(ns metabase-enterprise.transforms.jobs
  (:require
   [metabase-enterprise.transforms.execute :as execute]
   [metabase-enterprise.transforms.ordering :as ordering]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn execute-jobs!
  [jobs]
  nil)

(defn- get-deps [ordering transform-ids]
  (loop [found #{}
         [current-transform & more-transforms] transform-ids]
    (if current-transform
      (recur (conj found current-transform)
             (if (found current-transform)
               more-transforms
               (into more-transforms (get ordering current-transform))))
      found)))

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

(defn- next-transform [{:keys [ordering transforms-by-id]} complete]
  (-> (ordering/available-transforms ordering #{} complete)
      first
      transforms-by-id))

(defn execute-transforms! [transform-ids-to-run run-method]
  (let [plan (get-plan transform-ids-to-run)]
    (loop [complete #{}]
      (when-let [current-transform (next-transform plan complete)]
        (log/info "Executing job transform" (pr-str (:id current-transform)))
        (execute/execute-mbql-transform! current-transform {:run-method run-method})
        (recur (conj complete (:id current-transform)))))))
