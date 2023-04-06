(ns metabase.models.model-index
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.db.connection :as mdb.connection]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan.models :as models]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; model lifecycle ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(models/defmodel ModelIndex :model_index)
(models/defmodel ModelIndexValue :model_index_value)


;; switch to the one in mi after #29513 lands
(t2/define-before-insert ::created-at-timestamp
  [instance]
  #_{:clj-kondo/ignore [:private-call]}
  (#'mi/add-created-at-timestamp instance))

(derive ModelIndex ::created-at-timestamp)

(def normalize-field-ref
  "Normalize the field ref. Ensure it's well-formed mbql, not just json."
  (comp #'mbql.normalize/canonicalize-mbql-clauses
        #'mbql.normalize/normalize-tokens))

(t2/deftransforms ModelIndex
  {:pk_ref    {:in  json/generate-string
               :out (comp normalize-field-ref #(json/parse-string % true))}
   :value_ref {:in  json/generate-string
               :out (comp normalize-field-ref #(json/parse-string % true))}})

(t2/define-after-insert ModelIndex
  [model-index]
  ;; cyclic requires. it needs to know how to populate the index.
  (let [refresh-job (requiring-resolve 'metabase.task.index-values/add-indexing-job)]
    (refresh-job model-index)))

(t2/define-before-delete ModelIndex
  [model-index]
  (let [remove-refresh-job (requiring-resolve 'metabase.task.index-values/remove-indexing-job)]
    (remove-refresh-job model-index)))

;;;; indexing functions

(defn- fetch-values
  [model-index]
  (let [model (t2/select-one Card :id (:model_id model-index))]
    (try [nil (->> (qp/process-query
                    {:database (:database_id model)
                     :type     :query
                     :query    {:source-table (format "card__%d" (:id model))
                                :fields       [(:pk_ref model-index) (:value_ref model-index)]
                                :order-by     [[:desc (:value_ref model-index)]]
                                :limit        5001
                                :breakout   [(:pk_ref model-index) (:value_ref model-index)]}})
                   :data :rows)]
         (catch Exception e
           (log/warn (trs "Error fetching indexed values for model {0}" (:id model)) e)
           [(ex-message e) []]))))

(defmulti add-values "Index values in a model."
  (fn [_indexing-info] (mdb.connection/db-type)))

(defmethod add-values :h2
  [model-index]
  (let [[error-message values] (fetch-values model-index)
        new-generation         (inc (:generation model-index 0))]
    (if-not (str/blank? error-message)
      (t2/update! ModelIndex (:id model-index) {:status          "error"
                                                :error           error-message
                                                :state_change_at :%now
                                                :generation      new-generation})
      (do
        ;; we just delete and recreate
        (t2/delete! ModelIndexValue :model_index_id (:id model-index))
        (t2/insert! ModelIndexValue (map (fn [[id v]]
                                           {:name           v
                                            :model_pk       id
                                            :model_index_id (:id model-index)
                                            :generation     new-generation})
                                         values))
        (t2/update! ModelIndex (:id model-index)
                    {:generation      new-generation
                     :state_change_at :%now
                     :status          (if (> (count values) 5000) "overflow" "indexed")})))))

(defmethod add-values :postgres
  [model-index]
  (let [[error-message values] (fetch-values model-index)
        new-generation         (inc (:generation model-index 0))]
    (if-not (str/blank? error-message)
      (t2/update! ModelIndex (:id model-index) {:status          "error"
                                                :error           error-message
                                                :state_change_at :%now
                                                :generation      new-generation})
      ;; use upserts and delete ones with old generations
      (do
        (t2/query {:insert-into   [:model_index_value]
                   :values        (into []
                                        (comp (filter (fn [[id v]] (and id v)))
                                              (map (fn [[id v]]
                                                     {:name           v
                                                      :model_pk       id
                                                      :model_index_id (:id model-index)
                                                      :generation     new-generation})))
                                        values)
                   :on-conflict   [:model_index_id :model_pk]
                   :do-update-set {:generation new-generation}})
        (t2/delete! ModelIndexValue
                    :model_index_id (:id model-index)
                    :generation     [:< new-generation])
        (t2/update! ModelIndex (:id model-index)
                    {:generation      new-generation
                     :state_change_at :%now
                     :state           (if (> (count values) 5000) "overflow" "indexed")})))))

;; todo: mysql
