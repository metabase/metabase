(ns metabase.prototype.filter-values
  "Prototype: an LLM turns a natural language request, like \"EU countries\", into the values of one filter."
  (:require
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.prototype.db :as prototype.db]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private max-listed-values
  "Columns with more values do not send them to the LLM."
  1000)

(def ^:private response-schema
  {:type       "object"
   :properties {:status {:type        "string"
                         :description "`ok`, or `rejected` when the request is unclear, or the values cannot be found
reliably."}
                :values {:type        "array"
                         :description "The filter values, as strings. Empty when rejected."
                         :items       {:type "string"}}
                :reason {:type        "string"
                         :description "Why the request was rejected, in one short sentence for the user."}}
   :required   ["status" "values"]})

(def ^:private system-prompt
  "You are a smart autocomplete for the values of one filter in a data tool, like a search engine in place. The user
already picked the column and the operator. They describe the values they want in natural language, and you return
the exact values. Answer the request as asked, with your world knowledge. Do not judge whether it fits the column:
that is the user's choice. Example: \"average yearly salary in NY\" for a number column returns that number.

Rules:
- Return only values for this one filter. Do not change the column or the operator.
- When the column has a list of known values, return only values from that list, spelled exactly like in the list.
  Map the request to these values with your knowledge. Example: \"EU countries\" for a column of country codes
  returns the codes of the EU member countries that are in the list.
- The value kind tells how many values to return: `single` is exactly 1 value, `range` is exactly 2 values (the
  start and the end, start first), `multi` is 1 or more values.
- Number columns take plain numbers, like `1500` or `0.25`, with no units or thousands separators. When the request
  is about the data, like \"the top 10%\", use the column statistics, when they are given. An estimate is fine.
- Never reject a request because it seems unrelated to the column, its meaning or its unit. The user may compare
  the data with an outside number on purpose. Example: \"average yearly salary in NY\" for Lifetime Value returns
  about `75000`.
- Return `rejected` only when you cannot give any value: the request is gibberish, or, for a column with a list of
  known values, no known value matches it. Then give a short, neutral reason.")

(defn- fingerprint-stats [fingerprint]
  (let [number-stats (get-in fingerprint [:type :type/Number])
        global       (:global fingerprint)]
    (cond-> {}
      (:distinct-count global) (assoc :distinct_count (:distinct-count global))
      number-stats             (merge (select-keys number-stats [:min :max :avg :q1 :q3])))))

(defn- user-message
  [{:keys [prompt operator value_kind values options column_name table_name]} field listed-values]
  (str "Table: " (or (get-in field [:table :display_name]) table_name)
       "\nColumn: " (json/encode (cond-> {:name (or (:display_name field) column_name)}
                                   field (assoc :type          (some-> (or (:semantic_type field) (:base_type field)) name)
                                                :description   (:description field)
                                                :statistics    (fingerprint-stats (:fingerprint field)))))
       "\nOperator: " operator
       "\nValue kind: " value_kind
       (when (seq values)
         (str "\nCurrent values: " (json/encode values)))
       (when-let [known (seq (or options listed-values))]
         (str "\nKnown values of the column: " (json/encode known)))
       "\n\nRequest: " prompt
       "\n\nAnswer the request with values, even when it seems unrelated to the column."))

(defn- matching-values
  "The `values` that are in `known-values`, in the spelling of `known-values`. Case does not matter."
  [values known-values]
  (let [by-lower (into {} (map (juxt (comp u/lower-case-en str) str)) known-values)]
    (into [] (comp (keep #(by-lower (u/lower-case-en (str %)))) (distinct)) values)))

(defn- valid-count? [value-kind values]
  (case value-kind
    "single" (= 1 (count values))
    "range"  (= 2 (count values))
    (pos? (count values))))

(defn suggest-filter-values
  "Ask the LLM for the values of one filter. Returns `{:status \"ok\" :values [...]}` or
  `{:status \"rejected\" :reason \"...\"}`."
  [{:keys [field_id value_kind options prompt] :as request}]
  (let [field         (some-> field_id prototype.db/field-for-filter-values)
        ;; A value is a plain value, or a `[value remapped-value]` pair.
        field-values  (some->> field_id
                               prototype.db/field-values-for-filter
                               (map #(if (sequential? %) (first %) %))
                               (remove nil?))
        ;; Number filters compare with any number, so the known values do not limit them.
        number?       (some-> (:base_type field) (isa? :type/Number))
        listed-values (when (and (not number?) (<= (count field-values) max-listed-values))
                        (seq (map str field-values)))
        known-values  (or (seq options) listed-values)
        response      (metabot.self/call-llm-structured
                       (metabot.settings/llm-mini-model)
                       [{:role "system" :content system-prompt}
                        {:role "user" :content (user-message request field listed-values)}]
                       response-schema
                       0
                       1024
                       ;; Prototype: "unknown", because the EE usage log rejects sources that it does not know.
                       {:source              "unknown"
                        :tag                 "prototype-filter-values"
                        :required-permission :permission/metabot-other-tools})
        values        (cond->> (map str (:values response))
                        known-values (#(matching-values % known-values))
                        true         vec)]
    (log/infof "Prototype filter values: %s -> %s %s" (pr-str prompt) (:status response) (pr-str values))
    (if (and (= "ok" (:status response)) (valid-count? value_kind values))
      {:status "ok" :values values}
      {:status "rejected"
       :reason (or (not-empty (:reason response))
                   "The values for this request could not be found.")})))
