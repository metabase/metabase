(ns metabase.ai.summary
  (:require
   [metabase.ai.openai :as ai.openai]
   [metabase.query-processor.card :as qp.card]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private max-rows 200)
(def ^:private max-cols 50)
(def ^:private max-string-length 500)

(defn- truncate-string
  [value]
  (if (and (string? value) (> (count value) max-string-length))
    (str (subs value 0 max-string-length) "…")
    value))

(defn- truncate-row
  [row col-count]
  (mapv (comp truncate-string) (take col-count row)))

(defn- limit-result-data
  [result]
  (let [cols      (vec (take max-cols (get-in result [:data :cols])))
        col-count (count cols)
        rows      (vec (map #(truncate-row % col-count)
                            (take max-rows (get-in result [:data :rows]))))]
    {:cols cols
     :rows rows
     :row-count (count rows)
     :col-count col-count}))

(defn- build-prompt
  [{:keys [question-name question-description parameters cols rows]}]
  (let [payload {:question   {:name question-name
                              :description question-description}
                 :parameters parameters
                 :columns    (mapv (fn [{:keys [name base_type]}]
                                     {:name name
                                      :base_type base_type})
                                   cols)
                 :rows       rows}]
    (str "Summarize the following question results for a business user. "
         "Highlight trends, outliers, and notable patterns. Use markdown headings and bullet points. "
         "If there are filters, mention them.\n\n"
         (json/encode payload))))

(mu/defn run-card-query
  "Run a card query with constraints suitable for AI summary generation."
  [card-id :- ms/PositiveInt
   parameters :- [:maybe [:sequential [:map-of :keyword :any]]]]
  (qp.card/process-query-for-card
   card-id
   :api
   :parameters parameters
   :constraints {:max-results max-rows
                 :max-results-bare-rows max-rows}
   :middleware {:process-viz-settings? false
                :skip-results-metadata? false}
   :make-run (fn [qp _export-format]
               (fn [query info]
                 (qp (update query :info merge info) nil)))))

(defn summarize-result!
  [{:keys [card parameters result]}]
  (when-not (= :completed (:status result))
    (throw (ex-info "Query failed for AI summary." {:status (:status result)})))
  (let [{:keys [cols rows row-count col-count]} (limit-result-data result)
        prompt (build-prompt {:question-name (:name card)
                              :question-description (:description card)
                              :parameters parameters
                              :cols cols
                              :rows rows})
        {:keys [markdown model]} (ai.openai/summarize! prompt)]
    {:markdown       markdown
     :model          model
     :row_count_sent row-count
     :col_count_sent col-count}))
