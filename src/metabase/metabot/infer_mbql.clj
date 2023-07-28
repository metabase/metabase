(ns metabase.metabot.infer-mbql
  (:require [cheshire.core :as json]
            [clojure.pprint :as pp]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [malli.core :as m]
            [malli.core :as mc]
            [malli.error :as me]
            [malli.generator :as mg]
            [malli.json-schema :as mjs]
            [malli.provider :as mp]
            [malli.transform :as mtx]
            [metabase.metabot.client :as metabot-client]
            [metabase.metabot.util :as metabot-util]
            [metabase.query-processor :as qp]
            [metabase.util :as u]
            [toucan2.core :as t2]))

(defn schema
  "Returns Malli schema for subset of MBQL constrained to available field IDs."
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
       [:or
        [:tuple [:enum :count]]
        [:tuple {:title       "Aggregation"
                 :description "A single aggregate operation over a field"}
         ::available_aggregations
         ::available_fields]]]]
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

(defn aggregate-and-breakout-example-gen [ids]
  (let [[x y] (take 2 (cycle (shuffle ids)))]
    {:aggregation [[:min x]
                   [:max x]
                   [:avg x]]
     :breakout    [y]}))

(def select-top-10-example
  {:fields   [58 59]
   :limit    10
   :order-by [[:asc {:field_id 58}]]})

(defn select-top-10-example-gen [ids]
  (let [[x y] (take 2 (cycle (shuffle ids)))]
    {:fields   x
     :limit    y
     :order-by [[:asc {:field_id x}]]}))

(def filter-by-value-example
  {:fields  [59 65]
   :filters [[:< 65 {:value 3.6}]
             [:> 65 {:value 3.4}]]})

(defn filter-by-value-example-gen [ids]
  (let [[x y] (take 2 (cycle (shuffle ids)))]
    {:fields  [x y]
     :filters [[:< y {:value 3.6}]
               [:> y {:value 3.4}]]}))

(def filter-by-ref-example
  {:aggregation [[:count 58]]
   :filters     [[:> 58 {:field_id 38}]]})

(defn filter-by-ref-example-gen [ids]
  (let [[x y] (take 2 (cycle (shuffle ids)))]
    {:aggregation [[:count x]]
     :filters     [[:> x {:field_id y}]]}))

(def sum-over-states-example
  {:aggregation [[:sum 40]]
   :filters     [[:= 53 {:values ["CO" "UT" "NV"]}]]})

(defn sum-over-states-example-gen [ids]
  (let [[x y] (take 2 (cycle (shuffle ids)))]
    {:aggregation [[:sum x]]
     :filters     [[:= y {:values ["CO" "UT" "NV"]}]]}))

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
  [{:keys [model]}
   {:keys [breakout aggregation fields filters order-by] :as coerced-response}]
  (let [{model-id :id :keys [database_id]} model
        id->ref    (model-field-ref-lookup model)
        inner-mbql (cond-> (assoc
                             coerced-response
                             :source-table (format "card__%s" model-id))
                     aggregation
                     (update :aggregation (partial mapv (fn [[op id]]
                                                          (cond-> [op {}] id (conj (id->ref id))))))
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
    {:database  database_id
     :lib/type  :mbql/query
     :stages    [(-> inner-mbql
                     (dissoc :llm/usage)
                     (assoc :lib/type :mbql.stage/mbql))]
     :llm/usage (:llm/usage inner-mbql)}))

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

(defn parse-result [{:keys [usage] :as raw-response}]
  (let [response (metabot-util/find-result
                   (fn [message]
                     (metabot-util/extract-json message))
                   raw-response)]
    (if (:error response)
      (throw
        (ex-info
          "LLM did not produce MBQL response."
          (doto
            {:fail   response
             :reason :llm-generated-error}
            tap>)))
      (assoc response :llm/usage usage))))

(defn validate-result [{:keys [user_prompt schema]} json-response]
  (try
    (mc/coerce schema json-response mtx/json-transformer)
    (catch Exception e
      (log/warnf
        "Response does not comply with schema: %s"
        (with-out-str
          (pp/pprint json-response)))
      (throw
        (ex-info
          "Response does not comply with schema"
          (doto
            {:user-prompt      user_prompt
             :invalid-response json-response
             :reason           :invalid-response
             :error            (me/humanize (get-in (ex-data e) [:data :explain]))}
            tap>))))))

(defn generate-prompt [{:keys [model schema user_prompt]}]
  (let [field-info (mapv #(select-keys % [:id :name :possible_values]) (:result_metadata model))
        ids        (map :id field-info)]
    (->prompt
      [:system ["You are a pedantic Metabase query generation assistant."
                "You respond to user queries by building a JSON object that conforms to this json schema:"
                (json-block (-> schema mjs/transform))
                "Here are some example queries (Note that field ids in the examples are just placeholders. They may not be found in the actual schema.):"
                ;(str/join "\n" (map json-block (gen-samples model)))
                (json-block (select-top-10-example-gen ids))
                (json-block (aggregate-and-breakout-example-gen ids))
                (json-block (filter-by-value-example-gen ids))
                (json-block (filter-by-ref-example-gen ids))
                (json-block (sum-over-states-example-gen ids))
                "If you are unable to generate a query, return a JSON object like:"
                (json-block {:error      "I was unable to generate a query because..."
                             :query      "<user's original query>"
                             :suggestion ["<example natural-language query that might work based on the data model>"]})
                "A JSON description of the fields available in the user's data model:"
                (json-block field-info)
                "Take a natural-language query from the user and construct a query using the supplied schema, available fields, and what you already know."
                "Respond only with schema compliant JSON."]]
      [:user user_prompt])))

(defn create-context [model user_prompt]
  {:model       (update model :result_metadata #(mapv metabot-util/add-field-values %))
   :schema      (schema model)
   :user_prompt user_prompt})

(defn infer-mbql
  "Returns MBQL query from natural language user prompt"
  [model user_prompt]
  (let [context (create-context model user_prompt)]
    (->> context
         generate-prompt
         metabot-client/invoke-metabot
         parse-result
         (validate-result context)
         (postprocess-result context))))

(defn infer-question-from-mbql
  "Given an MBQL query, have the LLM attempt to guess what question you might have asked to create it."
  [mbql]
  (let [{sql-query :query} (qp/compile mbql)
        prompt (->prompt
                 [:system ["You are a helpful assistant that determines what question the provided SQL query is answering in plain English."
                           "Pretend you don't know anything about the underlying table structure."]]
                 [:user ["```SQL"
                         sql-query
                         "```"
                         "Question:"]])]
    (get-in (metabot-client/invoke-metabot prompt) [:choices 0 :message :content])))

(comment
  (def model-id 1)
  (def model (t2/select-one 'Card :id model-id))

  (def prompt "What are the 5 highest rated products by average product rating?")
  (def prompt "Show me total sales grouped by category where rating is between 1.5 and 3.4.")

  ;; Generate some MBQL
  (def mbql (infer-mbql model prompt))
  (pp/pprint mbql)

  ;; Process the results
  (def query-results (qp/process-query mbql))
  (pp/pprint query-results)

  ;; Try to back out our question
  (def inferred-question (infer-question-from-mbql mbql))
  (pp/pprint inferred-question)
  )