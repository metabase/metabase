(ns metabase.metaml.core
  (:require [clojure.string :as str]
            [kixi.stats.core :as stats]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.driver :as driver]
            [metabase.driver.bigquery :as bq]
            [metabase.mbql
             [normalize :as normalize]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor :as qp]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- create-model-sql
  [source-query model-name model-type label-col]
  (format "create model `%s`
options (model_type='%s',
         input_label_cols=['%s']) as (%s)" model-name model-type label-col source-query))

;; TODO
;; might be better to roll all these calls into one giant union

(defn- get-weights-for-feature
  [database model-name feature]
  (get-in (qp/process-query {:database database
                             :type     :native
                             :native   {:query (format "select category, weight
from unnest((select category_weights from ml.weights(model `%s`) where processed_input = '%s'))"
                                                       model-name feature)}})
          [:data :rows]))

(defn- get-weights-for-model
  [database model-name]
  (for [[col weight _] (get-in (qp/process-query {:database database
                                                  :type     :native
                                                  :native   {:query (format "select * from ml.weights(model `%s`)"
                                                                            model-name)}})
                               [:data :rows])]
    (let [demangled-name (str/replace col #"\w+___" "")]
      [demangled-name (or weight
                          (get-weights-for-feature database model-name col))])))

(defn- weights->predictor
  [weights]
  (let [weights (into {} (for [[k v] weights]
                           [k (cond
                                (double? v)
                                #(* % v)

                                (-> v ffirst (= "_null_filler"))
                                (constantly (-> v first second))

                                :else
                                (some-fn (into {} (map vec v))
                                         ;; If we've never seen this value guess using average
                                         (constantly (transduce (map second) stats/mean v))))]))]
    (fn [columns row]
      (reduce (fn [acc [k v]]
                (println [k v (when (weights k)
                                ((weights k) v))])
                (if (weights k)
                  (+ acc ((weights k) v))
                  acc))
              ((weights "__INTERCEPT__") 1)
              (map vector columns row)))))

(def ^:const ^Long ^:private training-timeout (* 10 60 1000)) ; 10 minutes

(defn- with-retries
  ([f] (with-retries 100 f))
  ([n f]
   (loop [i 0]
     (let [result (try
                    (f)
                    (catch Exception _ ::error))]
       (cond
         (not= result ::error) result
         (< i n)               (do
                                 (Thread/sleep (/ training-timeout n))
                                 (recur (inc i)))
         :else                 (throw (Exception. "Timeout training model")))))))

(defn train-regressor
  [query label {:keys [model-type]}]
  (let [dataset            (-> query qp/expand :database :details :dataset-id)
        model-name         (format "%s.%s" dataset (gensym))
        native             (-> query
                               (mbql.u/add-filter-clause [:not-null (magic/->reference :mbql label)])
                               (assoc-in [:query :fields]
                                         (map (partial magic/->reference :mbql)
                                              (db/select Field
                                                {:where [:and [:or [:not= :base_type "type/DateTime"]
                                                               [:not= :special_type "type/PK"]]
                                                         [:= :table_id (-> query
                                                                           :query
                                                                           :source-table)]]})))
                               qp/query->native
                               :query
                               (create-model-sql model-name
                                                 model-type
                                                 (bq/field->alias (driver/engine->driver :bigquery)
                                                                  {:field-name (:name label)
                                                                   :table-name (-> label
                                                                                   :table_id
                                                                                   Table
                                                                                   :name)})))
        create-model-query (-> query
                               (dissoc :query)
                               (assoc :type  :native
                                      :native {:query native}))
        ;; This might timeout, but we don't care
        _                  (qp/process-query create-model-query)]
    (weights->predictor (with-retries #(get-weights-for-model (:database query) model-name)))))

(defn- regressor-for-field
  [{:keys [base_type]}]
  (cond
    (isa? base_type :type/Boolean) "logistic_reg"
    (isa? base_type :type/Number)  "linear_reg"
    :else                          (throw (Exception. (format "Nil fill unsupported for type %s" base_type)))))

(defn fill-nils
  ([query label] (fill-nils query label {}))
  ([query label opts]
   (let [predictor   (train-regressor query label (merge {:model-type (regressor-for-field label)}
                                                         opts))
         result      (qp/process-query query)
         columns     (get-in result [:data :columns])
         label-index (u/index-of #{(:name label)} columns)]
     (update-in result [:data :rows]
                (partial map (fn [row]
                               (update (vec row) label-index #(or % (predictor columns row)))))))))
