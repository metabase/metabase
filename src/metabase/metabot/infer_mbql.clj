(ns metabase.metabot.infer-mbql
  (:require [cheshire.core :as json]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [malli.core :as mc]
            [malli.generator :as mg]
            [malli.json-schema :as mjs]
            [malli.transform :as mtx]
            [metabase.db.query :as mdb.query]
            [metabase.lib.core :as lib]
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
                  [:avg :count :count-where :distinct :max :median :min :percentile :share :stddev :sum :sum-where :var])
            ;; TODO - Add in unary operations as well. [:is-null :not-null :is-empty :not-empty :not]
            ;; TODO - Add in options (e.g. case sensitive contains)
            ;::unary-operators
            ;(into [:enum
            ;       {:title       "Unary operators - take exactly one argument"
            ;        :description (str/join "\n"
            ;                               ["Operations that can be used for comparison and filters."
            ;                                "Will always compare a field (referenced by id) with either:"
            ;                                "1. A scalar value of the form \"{'value': x}\" where x is a valid json type."
            ;                                "2. An array of scalar values of the form \"{'values': [x0, x1,...xn]}\" where x0 through xn are valid json types."
            ;                                "3. A reference to another field of the form \"{'field_id': id}\" where x id is an available field id."])}]
            ;      [:is-null :not-null :is-empty :not-empty :not])
            ::binary-operators
            (into [:enum
                   {:title       "Binary operators - take at least two arguments."
                    :description (str/join "\n"
                                           ["Operations that can be used for comparison and filters."
                                            "Will always compare a field (referenced by id) with either:"
                                            "1. A scalar value of the form \"{'value': x}\" where x is a valid json type."
                                            "2. An array of scalar values of the form \"{'values': [x0, x1,...xn]}\" where x0 through xn are valid json types."
                                            "3. A reference to another field of the form \"{'field_id': id}\" where x id is an available field id."])}]
                  [:< :<= := :>= :> :ends-with :contains :does-not-contain])}}
     [:aggregation
      {:optional true}
      [:vector
       {:min 1}
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
                :min         1}
       ::available_fields]]
     [:filters
      {:optional true}
      [:vector
       {:min 1}
       [:tuple {:title       "Filter"
                :description "A boolean operation that can be used to filter results"}
        ::binary-operators
        ::available_fields
        [:or
         [:map [:field_id ::available_fields]]
         [:map [:value [:or :int :double :string :boolean]]]
         [:map [:values [:vector [:or :int :double :string :boolean]]]]]]]]
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
       {:min 1}
       [:tuple
        [:enum :asc :desc]
        [:or
         [:map [:field_id ::available_fields]]
         [:map
          {:description (str/join "\n"
                                  ["Order by an aggregate defined in this query."
                                   "The value will be the index of the aggregate in the the \"aggregation\" entry of the json."])}
          [:aggregation :int]]]]]]]))

(def aggregate-and-breakout-example
  {:aggregation [[:min 58]
                 [:max 58]
                 [:avg 58]]
   :breakout    [62]})

(def select-top-10-example
  {:fields   [58 59]
   :limit    10
   :order-by [[:asc {:field_id 58}]]})

(def filter-by-value-example
  {:fields  [59 65]
   :filters [[:< 65 {:value 3.6}]
             [:> 65 {:value 3.4}]]})

(def filter-by-ref-example
  {:aggregation [[:count 58]]
   :filters     [[:> 58 {:field_id 38}]]})

(def sum-over-states-example
  {:aggregation [[:sum 40]]
   :filters     [[:= 53 {:values ["CO" "UT" "NV"]}]]})

(defn- model-field-ref-lookup
  [{:keys [result_metadata]}]
  (zipmap
    (map :id result_metadata)
    (map (fn [{[f id opts] :field_ref}] [f (into {} opts) id]) result_metadata)))

(defn gen-samples [model]
  (let [malli-schema (schema model)
        sample-types #{:aggregation :breakout :fields :filters :limit :order-by}]
    (loop [sample       (mg/generate malli-schema)
           sampled-keys (into #{} (keys sample))
           samples      [sample]]
      (if (= sample-types sampled-keys)
        samples
        (let [new-sample (mg/generate malli-schema)]
          (recur new-sample
                 (into sampled-keys (keys new-sample))
                 (conj samples new-sample)))))))

(defn- postprocess-result
  "Given a model and the response from the LLM, attempt to convert the response to valid MBQL."
  [{model-id :id :keys [database_id] :as model} json-response]
  (let [{:keys [breakout aggregation fields filters order-by]
         :as   coerced-response} (mc/coerce (schema model) json-response mtx/json-transformer)
        _          (tap> coerced-response)
        id->ref    (model-field-ref-lookup model)
        inner-mbql (cond-> (assoc
                             coerced-response
                             :source-table (format "card__%s" model-id))
                     aggregation
                     (update :aggregation (partial mapv (fn [[op id]]
                                                          [op {} (id->ref id)])))
                     breakout
                     (update :breakout (partial mapv id->ref))
                     fields
                     (update :fields (partial mapv id->ref))
                     filters
                     (update :filters (fn [filters]
                                        (mapv
                                          (fn [[op id m]]
                                            (let [{:keys [field_id value values]} m
                                                  v (cond
                                                      field_id [(id->ref field_id)]
                                                      value [value]
                                                      values values)]
                                              (into [op {} (id->ref id)] v)))
                                          filters)))
                     order-by
                     (update :order-by (fn [clauses]
                                         (mapv
                                           (fn [[op {:keys [field_id aggregation]}]]
                                             (cond
                                               field_id [op (id->ref field_id)]
                                               aggregation [op [:aggregation aggregation]]))
                                           clauses))))]
    {:database database_id
     :lib/type :mbql/query
     :stages   [(assoc inner-mbql :lib/type :mbql.stage/mbql)]}))

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
  [user_prompt model]
  (let [json-schema   (-> model schema mjs/transform)
        {:keys [result_metadata]} (update model :result_metadata #(mapv metabot-util/add-field-values %))
        field-info    (mapv #(select-keys % [:id :name :possible_values]) result_metadata)
        prompt        (->prompt
                        [:system ["You are a pedantic Metabase query generation assistant."
                                  "You respond to user queries by building a JSON object that conforms to this json schema:"
                                  (json-block json-schema)
                                  "Here are some example queries:"
                                  ;(str/join "\n" (map json-block (gen-samples model)))
                                  (json-block select-top-10-example)
                                  (json-block aggregate-and-breakout-example)
                                  (json-block filter-by-value-example)
                                  (json-block filter-by-ref-example)
                                  (json-block sum-over-states-example)
                                  "If you are unable to generate a query, return a JSON object like:"
                                  (json-block {:error      "I was unable to generate a query because..."
                                               :query      "<user's original query>"
                                               :suggestion ["<example natural-language query that might work based on the data model>"]})
                                  "A JSON description of the fields available in the user's data model:"
                                  (json-block field-info)
                                  "Take a natural-language query from the user and construct a query using the supplied schema, available fields, and what you already know."
                                  "Respond only with schema compliant JSON."]]
                        [:user user_prompt])
        {:keys [usage] :as raw-response} (metabot-client/invoke-metabot prompt)
        json-response (metabot-util/find-result
                        (fn [message]
                          (metabot-util/extract-json message))
                        raw-response)]
    (tap> json-response)
    ;; handle cases where the LLM detects its own errors first
    (assoc
      (if (:error json-response)
        {:fail   json-response
         :reason :llm-generated-error}
        (try
          (postprocess-result model json-response)
          (catch Exception e
            (log/error e "Error validating MBQL generated from natural-language query")
            {:fail   json-response
             :reason :invalid-response})))
      :usage usage)))

(defn infer-question-from-mbql [mbql]
  (let [{:keys [query]} (qp/compile mbql)
        prompt (->prompt
                 [:system ["You are a helpful assistant that determines what question the provided SQL query is answering in plain English."
                           "Pretend you don't know anything about the underlying table structure."]]
                 [:user ["```SQL"
                         query
                         "```"
                         "Question:"]])]
    (get-in (metabot-client/invoke-metabot prompt) [:choices 0 :message :content])))

(defn try-query [model-id prompt]
  (let [{:keys [fail reason usage] :as mbql} (infer-mbql prompt (t2/select-one 'Card :id model-id))]
    (assoc
      (if fail
        {:fail   fail
         :reason reason}
        {:mbql (dissoc mbql :usage)
         :data (try
                 (let [{:keys [data row_count status]} (qp/process-query mbql)
                       {:keys [rows cols]} data]
                   {:cols      (mapv
                                 (fn [col] (select-keys col [:id :name :display_name]))
                                 cols)
                    :rows      (->> rows
                                    (map (fn [row]
                                           (into {} (map (fn [{:keys [name]} v] [(keyword name) v]) cols row))))
                                    (take 10)
                                    vec)
                    :row_count row_count
                    :status    status})
                 (catch Exception _
                   {:status :invalid-query}))})
      :usage usage)))

(defn sample-mbql [{:keys [prompt filename hint_type n-samples]
                    :or   {n-samples 10}}]
  (let [res {:prompt  prompt
             :results (vec
                        (for [i (range n-samples)
                              :let [ti  (System/currentTimeMillis)
                                    res (try-query 1 prompt)
                                    tf  (System/currentTimeMillis)]]
                          (do
                            (log/infof "Completed prompt %s of %s" (inc i) n-samples)
                            (assoc res :dt_sec (/ (- tf ti) 1000.0)))))}]
    (tap> res)
    (spit
      (format "mbql_%s_%s.json" filename hint_type)
      (json/generate-string res {:pretty true}))))

(comment
  (->> (t2/select-one 'Card :id 1) :result_metadata (map (juxt :id :name)))

  (-> (t2/select-one 'Card :id 1) schema mjs/transform)

  (let [model         (t2/select-one 'Card :id 1)
        json-response {:aggregation [["sum" 41]], :filters [["=" 50 {:value "Boston"}]]}
        malli-schema  (schema model)]
    (mc/coerce malli-schema json-response mtx/json-transformer)
    malli-schema)

  (sample-mbql {:prompt    "Provide descriptive stats for sales per state"
                :filename  "stats"
                :hint_type "curated"})

  (sample-mbql {:prompt    "What are the 10 highest rated products?"
                :filename  "top10"
                :hint_type "curated"})

  (sample-mbql {:prompt    "What products have a rating greater than 2.0?"
                :filename  "plus2rating"
                :hint_type "curated"})

  (sample-mbql {:prompt    "How many sales had a product price greater than the discount?"
                :filename  "sls_gt_disc"
                :hint_type "curated"})

  (sample-mbql {:prompt    "Show me total sales grouped by category where rating is between 1.5 and 3.4."
                :filename  "ratingsbetween15and34"
                :hint_type "curated"})

  (sample-mbql {:prompt    "Show me email addresses from gmail."
                :filename  "gmail_emails"
                :hint_type "curated"})

  (sample-mbql {:prompt    "Show me the total sales for products sold in Boston."
                :filename  "total_in_boston"
                :hint_type "curated"})

  (sample-mbql {:prompt    "How many sales were in Idaho?"
                :filename  "sales_in_id"
                :hint_type "curated"})

  (try-query 1 "Provide descriptive stats for sales per state")
  (try-query 1 "What are the 5 highest rated products by average product rating?")
  (try-query 1 "What are the 10 highest rated individual products?")
  (try-query 1 "What products have a rating greater than 2.0?")
  (try-query 1 "How many sales had a product price greater than the discount?")
  (try-query 1 "How many sales had a product price less than the discount?")
  (try-query 1 "How many sales weren't discounted?")        ;; problematic
  (try-query 1 "How many sales are there?")                 ;; problematic
  (try-query 1 "Show me total sales grouped by category where rating is between 1.5 and 3.4.")
  (try-query 1 "Show me email addresses from gmail.")
  (try-query 1 "What is the most common product category purchased by gmail users?")
  (try-query 1 "Show me the total sales for products sold in Rosebud.") ;;problematic
  (try-query 1 "Show me the total sales for products sold to residents of Rosebud.")
  (try-query 1 "What cities do people live in?")
  (try-query 1 "How many sales were in Idaho?")
  (try-query 1 "How much revenue did we have in the states CO, UT, and NV?")
  ;; "CO" "UT" "NV" -- Is that right?
  (try-query 1 "How many sales were in the intermountain west?")
  (try-query 1 "How many sales were in the pacific northwest?") ;; problematic
  ;; The above is weird. It produces this result. It's like "I don't know the answer, but maybe you should ask this
  ;; instead because I actually do know the answer."
  {:fail {:error "I was unable to generate a query because the Pacific Northwest region is not directly defined in the data model.",
          :query "How many sales were in the pacific northwest?",
          :suggestion ["How many sales were in the states WA, OR, and ID?"]},
   :reason :llm-generated-error,
   :usage {:prompt_tokens 1746, :completion_tokens 55, :total_tokens 1801}}

  ;; "I was unable to generate a query because the term 'rust belt' is not part of the data model"
  (try-query 1 "How many sales occurred in the rust belt?")
  ;; Works - "CA" "OR" "WA"
  (try-query 1 "How many sales occurred on the west coast?")
  ;; Works - "CO" "UT" "NV"
  (try-query 1 "What is the total revenue from sales in the intermountain west?")
  ;; Same problems as above
  (try-query 1 "What is the total revenue from sales in the pacific northwest?")
  (try-query 1 "How many gizmos did I sell?")
  (try-query 1 "How many sales did I have in each category?") ;; problematic - The count aggregate needs work
  (try-query 1 "What is the average sales revenue in each category?")

  (t2/select-one 'Card :id 2840)
  (-> (t2/select-one 'Card :id 1) schema mjs/transform)

  (let [model      (t2/select-one 'Card :id 1)
        {:keys [result_metadata]} (update model :result_metadata #(mapv metabot-util/add-field-values %))
        field-info (mapv #(select-keys % [:id :name :possible_values]) result_metadata)]
    field-info)

  (t2/select-one 'Field :id 62)
  (t2/select-one 'FieldValues :field_id 50)

  (let [model        (t2/select-one 'Card :id 1)
        malli-schema (schema model)]
    (mg/generate malli-schema))

  (let [{:keys [results]} (-> "mbql_sales_in_id_curated.json"
                              slurp
                              (json/parse-string true))
        freqs (frequencies (map (comp :query :mbql) results))]
    {:distinct       freqs
     :distinct_ct    (vec (vals freqs))
     :statuses       (frequencies (map (comp :status :data) results))
     :fails          (remove #{[nil nil]} (map (juxt :reason :fail) results))
     :distinct-fails (vals (frequencies (remove #{[nil nil]} (map (juxt :reason :fail) results))))
     :sample2        (map (comp (partial take 2) :rows :data) results)})

  (t2/select ['Field :name :table_id] :id 43)

  (->>
    {:database 1,
     :lib/type :mbql/query,
     :stages   [{:aggregation  [[:count {} [:field {} 43]]],
                 :filters      [[:= [:field {:join-alias "Products"} 53] "ID"]],
                 :source-table "card__1",
                 :lib/type     :mbql.stage/mbql}]}
    qp/compile
    :query
    mdb.query/format-sql
    println)

  (qp/process-query
    {:database 1,
     :lib/type :mbql/query,
     :stages   [{:aggregation  [[:avg {} [:field {:join-alias "Products"} 65]]]
                 :breakout     [[:field {:join-alias "Products"} 59]]
                 :order-by     [[:desc [:aggregation 0]]]
                 :limit        5
                 :source-table "card__1",
                 :lib/type     :mbql.stage/mbql}]})

  )