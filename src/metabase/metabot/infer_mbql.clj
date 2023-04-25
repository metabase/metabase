(ns metabase.metabot.infer-mbql
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [malli.core :as mc]
            [malli.generator :as mg]
            [malli.json-schema :as mjs]
            [malli.transform :as mtx]
            [metabase.metabot.client :as metabot-client]
            [metabase.metabot.util :as metabot-util]
            [metabase.query-processor :as qp]
            [toucan2.core :as t2]))

(defn schema
  "Returns Malli schema for subset of MBQL constrained to available field IDs"
  [{:keys [result_metadata]}]
  (mc/schema
    [:map {:registry
           {::available_fields
            (into [:enum
                   {:title       "Field id"
                    :description "The id for a field to be used in the query"}]
                  (mapv :id result_metadata))
            ::available_aggregations
            (into [:enum
                   {:title       "Aggregation"
                    :description "An aggregation that can be performed on data"}]
                  [:avg :count :count-where :distinct :max :median
                   :min :percentile :share :stddev :sum :sum-where :var])
            ::operators
            (into [:enum
                   {:title       "Boolean operators"
                    :description "af"}]
                  [:< :<= := :>= :>])}}
     [:aggregation
      {:optional true}
      [:vector
       [:tuple {:title       "Aggregation"
                :description "A single aggregate operation over a field"}
        ::available_aggregations
        ::available_fields]]]
     [:breakout
      {:optional true}
      [:vector {:min 1} ::available_fields]]
     [:fields
      {:optional true}
      [:vector {:title       "Fields"
                :description "Selected fields from the full set of available fields"
                :min         1} ::available_fields]]
     [:filters
      {:optional true}
      [:vector
       [:tuple {:title       "Filter"
                :description "A boolean operation that can be used to filter results"}
        ::operators
        ::available_fields
        [:or
         [:map [:field_id ::available_fields]]
         [:map [:value [:or :int :double :string]]]]]]]
     [:limit
      {:title       "Limit"
       :description "The number of items to return in a query."
       :optional    true}
      pos-int?]
     [:order-by
      {:title       "Sort order"
       :description "A sequential set of asc|desc plus field id tuples determining the return data sort order."
       :optional    true}
      [:vector
       [:tuple
        [:enum :asc :desc]
        ::available_fields]]]]))

(def aggregate-and-breakout-example
  {:aggregation [[:min 58]
                 [:max 58]
                 [:avg 58]]
   :breakout    [62]})

(def select-top-10-example
  {:fields   [58 59]
   :limit    10
   :order-by [[:asc 58]]})

(defn- model-field-ref-lookup
  [{:keys [result_metadata]}]
  (zipmap
    (map :id result_metadata)
    (map :field_ref result_metadata)))

(defn- postprocess-result
  [{model-id :id :keys [database_id] :as model} json-response]
  (let [{:keys [breakout aggregation fields filters order-by]
         :as   coerced-response} (mc/coerce (schema model) json-response mtx/json-transformer)
        id->ref    (model-field-ref-lookup model)
        inner-mbql (cond-> (assoc
                             coerced-response
                             :source-table (format "card__%s" model-id))
                     aggregation
                     (update :aggregation (partial mapv (fn [[op id]]
                                                          [op (id->ref id)])))
                     breakout
                     (update :breakout (partial mapv id->ref))
                     fields
                     (update :fields (partial mapv id->ref))
                     filters
                     (update :filters (fn [filters]
                                        (mapv
                                          (fn [[op id m]]
                                            (let [{:keys [field_id value]} m]
                                              [op
                                               (id->ref id)
                                               (or (id->ref field_id) value)]))
                                          filters)))
                     order-by
                     (update :order-by (fn [clauses]
                                         (mapv
                                           (fn [[op id]]
                                             [op (id->ref id)])
                                           clauses))))]
    (tap> inner-mbql)
    {:database database_id
     :type     :query
     :query    inner-mbql}))

(defn- ->prompt
  "Returns {:messages [{:role ... :content ...} ...]} prompt map for use in API calls."
  [& role-content-pairs]
  {:messages (for [[role content] role-content-pairs]
               {:role    (name role)
                :content (if (sequential? content)
                           (str/join "\n" content)
                           content)})})

(defn- json-block
  "Returns Markdown-style code block string with x encoded as JSON"
  [x]
  (str "\n```\n" (json/generate-string x) "\n```\n"))

(defn infer-mbql
  "Returns MBQL query from natural language user prompt"
  [user_prompt {:keys [result_metadata] :as model}]
  (let [malli-schema  (schema model)
        json-schema   (mjs/transform malli-schema)
        field-info    (mapv #(select-keys % [:id :name]) result_metadata)
        prompt        (->prompt
                        [:system ["You are a pedantic Metabase query generation assistant."
                                  "You respond to user queries by building a JSON object that conforms to this json schema:"
                                  (json-block json-schema)
                                  "If you are unable to generate a query, return a JSON object like:"
                                  (json-block {:error      "I was unable to generate a query because..."
                                               :query      "<user's original query>"
                                               :suggestion ["<example natural-language query that might work based on the data model>"]})
                                  "A JSON description of the fields available in the user's data model:"
                                  (json-block field-info)
                                  "Take a natural-language query from the user and construct a query using the supplied schema and available fields."
                                  "Respond only with schema compliant JSON."]]
                        [:user user_prompt])
        json-response (metabot-util/find-result
                        (fn [message]
                          (tap> message)
                          (metabot-util/extract-json message))
                        (metabot-client/invoke-metabot prompt))]
    (tap> json-response)
    ;; handle cases where the LLM detects its own errors first
    (if (:error json-response)
      {:fail   json-response
       :reason :llm-generated-error}
      (try
        (postprocess-result model json-response)
        (catch Exception e
          (log/error e "Error validating MBQL generated from natural-language query")
          {:fail   json-response
           :reason :invalid-response})))))

(comment
  (->> (t2/select-one 'Card :id 1) :result_metadata (map :name))

  (let [model         (t2/select-one 'Card :id 1)
        json-response {:aggregation [["sum" 41]], :filters [["=" 50 {:value "Boston"}]]}
        malli-schema  (schema model)]
    (mc/coerce malli-schema json-response mtx/json-transformer)
    malli-schema)

  ;; This works pretty well
  (let [{:keys [fail] :as mbql} (infer-mbql
                                  "Provide descriptive stats for sales per state"
                                  (t2/select-one 'Card :id 1))]
    (if fail
      fail
      {:mbql mbql
       :data (qp/process-query mbql)}))

  ; [:fail {:aggregation [], :breakout [65 36], :fields [], :filters [], :limit 10, :order-by [["desc" 65]]}]
  (let [{:keys [fail] :as mbql} (infer-mbql
                                  "What are the 10 highest rated products?"
                                  (t2/select-one 'Card :id 1))]
    (if fail
      [:fail fail]
      mbql))

  ;; A working solution
  ;; 65 is RATING
  ;; 64 is EAN
  (qp/process-query
    {:database 1,
     :type     :query,
     :query    {:aggregation  [[:max [:field 65 {:join-alias "Products"}]]],
                :breakout     [[:field 64 {:join-alias "Products"}]],
                :order-by     [[:desc [:field 65 {:join-alias "Products"}]]],
                :limit        10,
                :source-table "card__1"}})

  (let [{:keys [fail] :as mbql} (infer-mbql
                                  "What products have a rating greater than 2.0?"
                                  (t2/select-one 'Card :id 1))]
    (if fail
      [:fail fail]
      mbql))

  ;; A working solution to the above
  ;; 36 is PRODUCT_ID
  ;; 59 is TITLE
  ;; 65 is RATING
  (qp/process-query
    {:database 1,
     :type     :query,
     :query    {:fields       [[:field 36 nil] [:field 59 {:join-alias "Products"}]],
                :filters      [[:> [:field 65 {:join-alias "Products"}] 2.0]],
                :source-table "card__1"}})

  (let [{:keys [fail] :as mbql} (infer-mbql
                                  "Show me total sales grouped by category where rating is between 1.5 and 3.4."
                                  (t2/select-one 'Card :id 1))]
    (if fail
      [:fail fail]
      mbql))


  ;; So close =>  [:fail {:filters [["=" {:field_id 47} {:value "@gmail.com"}]], :breakout [{:field_id 47}]}]
  (let [{:keys [fail] :as mbql} (infer-mbql
                                  "Show me email addresses from gmail."
                                  (t2/select-one 'Card :id 1))]
    (if fail
      [:fail fail]
      mbql))

  (let [{:keys [fail] :as mbql} (infer-mbql
                                  "Show me the total sales for products sold in Boston."
                                  (t2/select-one 'Card :id 1))]
    (if fail
      [:fail fail]
      mbql))

  ;; Bad results
  {:aggregation [["sum" 41]], :filters [["=" 50 "Boston"]]}

  (let [{:keys [fail] :as mbql} (infer-mbql
                                  "How many sales were in Idaho?"
                                  (t2/select-one 'Card :id 1))]
    (if fail
      fail
      {:mbql mbql
       :data (update-in (qp/process-query mbql) [:data :rows] (fn [rows] (take 10 rows)))}))

  (let [model        (t2/select-one 'Card :id 1)
        malli-schema (schema model)]
    (mg/generate malli-schema))

  ;; Generic stats on pricing by category
  (let [model         (t2/select-one 'Card :id 1)
        malli-schema  (schema model)
        json-response aggregate-and-breakout-example
        result        (postprocess-result
                        model
                        json-response)]
    (qp/process-query result))

  ;; Select the top 10 items by field 58. Show only fields 58 and 58
  (let [model         (t2/select-one 'Card :id 1)
        malli-schema  (schema model)
        json-response select-top-10-example
        result        (postprocess-result
                        model
                        json-response)]
    (qp/process-query result))

  ;; Random query generator -- useful for checking our schema
  ;; It frequently generates good queries/data...and also frequently does not
  (let [model        (t2/select-one 'Card :id 1)
        malli-schema (schema model)
        result       (postprocess-result
                       model
                       (mg/generate malli-schema))
        limit        (get-in result [:query :limit])
        result       (cond-> result
                       (nil? limit)
                       (assoc-in [:query :limit] 2))]
    (qp/process-query result))
  )
