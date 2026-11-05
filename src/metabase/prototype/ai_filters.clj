(ns metabase.prototype.ai-filters
  "Prototype: an LLM turns a natural language request, like \"pro customers in the EU\", into one or more filters.
  The client sends the columns that the query can filter on, with their operators. The LLM picks the columns, the
  operators and the values in one call, with no agent loop."
  (:require
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.prototype.db :as prototype.db]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private max-listed-values
  "Columns with more values do not send them to the LLM, so that the prompt stays small."
  100)

(def ^:private response-schema
  {:type       "object"
   ;; The filters come first, so that the model builds them before it decides the status.
   :properties {:filters {:type        "array"
                          :description "The filters. They all apply together, with AND. Empty when rejected."
                          :items       {:type       "object"
                                        :properties {:column   {:type        "integer"
                                                                :description "The `id` of the column."}
                                                     :operator {:type        "string"
                                                                :description "The `key` of an operator of the
column."}
                                                     :values   {:type        "array"
                                                                :description "The values, as strings."
                                                                :items       {:type "string"}}}
                                        :required   ["column" "operator" "values"]}}
                :reason  {:type        "string"
                          :description "Why the request was rejected, in one short sentence for the user."}
                :status  {:type        "string"
                          :description "`ok`, or `rejected` when the request is unclear, or the columns cannot
express it."}}
   :required   ["status" "filters"]})

(def ^:private system-prompt
  "You turn a request in natural language into filters for a query in a data tool. The user typed the request in
the filter bar, like a search box. You get the columns that the query can filter on, and the operators of each
column. Answer with the filters that together express the request.

Rules:
- Use only the given columns, by their `id`, and only the operators of that column, by their `key`.
- Every given column is available on each row of the query, also the columns of other tables: the query already
  joins these tables. Never reject a request because of a missing join or relation between tables.
- When many columns fit, pick the most direct one. Example: for \"EU customers\", a column like \"Is EU Member\"
  is better than a list of country codes.
- All filters apply together, with AND. For alternatives on one column, like \"US or Canada\", use one filter with
  a `multi` operator and many values. Do not make two filters on the same column for this.
- When the request names a table, like \"product price\", use the column of that table.
- The value kind of an operator tells how many values to give:
  - `none`: no values.
  - `single`: exactly 1 value.
  - `range`: exactly 2 values, the start first.
  - `multi`: 1 or more values.
  - `amount-unit`: exactly 2 values, a positive whole number and a unit, like [\"30\", \"day\"]. Units: minute,
    hour, day, week, month, quarter, year.
  - `unit`: exactly 1 value, a unit, like [\"month\"].
- Dates are `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm:ss` when a time is needed.
- Prefer relative date operators to fixed dates for requests relative to today, so that the filter stays correct
  over time. Example: \"older than 40\" on a birth date is `more-than-ago` with [\"40\", \"year\"], not `before`
  a fixed date. Use fixed dates only for requests with calendar dates, like \"before 2020\".
- Number values are plain numbers, like `1500` or `0.25`, with no units or thousands separators. Use the column
  statistics for requests about the data, like \"high\" or \"above average\". An estimate is fine.
- When a column has known values, use only values from that list, spelled exactly as in the list. Map the request
  to these values with your world knowledge. Example: \"EU\" for a column of country codes gives the codes of the
  EU member countries that are in the list.
- Use your world knowledge for values. Example: \"west coast states\" gives CA, OR and WA.
- Groups of countries, states or other places, like G7, EU, NATO, BRICS or the Nordics, map to a list of codes
  with your world knowledge. Never reject them.
- Regions, like Eastern Europe, Southeast Asia, Latin America, the Middle East or the Midwest, are groups of places
  too. When no column names the region exactly, use a column of countries or states with the list of its members.
  A region does not need its own column. A broader column, like a continent, is not a match for a smaller region.
- Do not invent constraints that the request does not ask for.
- Return `rejected`, with no filters, when the request is gibberish, is not a filter, or a part of it cannot be
  expressed with the given columns and operators. Do not guess a column for it. Give a short, neutral reason that
  names the part that you could not express.
- First build the filters for each part of the request. Only then decide the status.")

(defn- fingerprint-stats [fingerprint]
  (let [number-stats (get-in fingerprint [:type :type/Number])
        date-stats   (get-in fingerprint [:type :type/DateTime])
        global       (:global fingerprint)]
    (cond-> {}
      (:distinct-count global) (assoc :distinct_count (:distinct-count global))
      number-stats             (merge (select-keys number-stats [:min :max :avg :q1 :q3]))
      date-stats               (merge (select-keys date-stats [:earliest :latest])))))

(defn- listed-values
  "The known values of a column, as strings: the options of its operators, or the field values of a text column
  with few values."
  [column field]
  (or (some #(not-empty (:options %)) (:operators column))
      (let [values (->> (:values field)
                        (map #(if (sequential? %) (first %) %))
                        (remove nil?))]
        (when (and (= "string" (:kind column))
                   (<= 1 (count values) max-listed-values))
          (mapv str values)))))

(defn- operator-set-key [operators]
  (mapv #(dissoc % :options) operators))

(defn- prompt-columns
  "The columns for the prompt. Columns share their operator lists by name, so that the prompt stays small."
  [columns fields-by-id]
  (let [operator-sets (into {}
                            (map-indexed (fn [index operators] [operators (str "ops" (inc index))]))
                            (distinct (map (comp operator-set-key :operators) columns)))]
    {:operator-sets (into (sorted-map)
                          (map (fn [[operators set-name]]
                                 [set-name (mapv (fn [{:keys [key label value_kind]}]
                                                   {:key key :label label :value_kind value_kind})
                                                 operators)]))
                          operator-sets)
     :columns       (for [{:keys [id table kind field_id operators] :as column} columns
                          :let [field (get fields-by-id field_id)
                                stats (fingerprint-stats (:fingerprint field))
                                known (listed-values column field)]]
                      (cond-> {:id        id
                               :table     table
                               :name      (:name column)
                               :kind      kind
                               :operators (get operator-sets (operator-set-key operators))}
                        (:semantic_type field)    (assoc :semantic_type (name (:semantic_type field)))
                        (:description field)      (assoc :description (:description field))
                        (seq stats)               (assoc :statistics stats)
                        known                     (assoc :known_values known)))}))

(defn- user-message [{:keys [prompt today]} {:keys [operator-sets columns]}]
  (str "Today: " today
       "\n\nOperator sets:\n" (json/encode operator-sets)
       "\n\nColumns:\n" (apply str (interpose "\n" (map json/encode columns)))
       "\n\nRequest: " prompt))

(defn- matching-values
  "The `values` that are in `known-values`, in the spelling of `known-values`, or nil when one of them is not
  there. Case does not matter."
  [values known-values]
  (let [by-lower (into {} (map (juxt u/lower-case-en identity)) known-values)
        matched  (mapv #(by-lower (u/lower-case-en %)) values)]
    (when (every? some? matched)
      (vec (distinct matched)))))

(defn- valid-count? [value-kind values]
  (case value-kind
    "none"        (empty? values)
    "single"      (= 1 (count values))
    "range"       (= 2 (count values))
    "amount-unit" (= 2 (count values))
    "unit"        (= 1 (count values))
    (pos? (count values))))

(defn- validate-filter
  "The filter with the values in the spelling of the known values, or nil when it is not valid."
  [columns-by-id known-values-by-id {:keys [column operator values]}]
  (when-let [{:keys [operators kind]} (get columns-by-id column)]
    (when-let [{:keys [value_kind]} (some #(when (= operator (:key %)) %) operators)]
      (let [values (mapv str values)
            known  (get known-values-by-id column)
            values (if (and known (#{"single" "multi"} value_kind) (not= "number" kind))
                     (matching-values values known)
                     values)]
        (when (and values (valid-count? value_kind values))
          {:column column :operator operator :values values})))))

(defn suggest-filters
  "Ask the LLM for the filters of a natural language request. Returns `{:status \"ok\" :filters [...]}` or
  `{:status \"rejected\" :reason \"...\"}`."
  [{:keys [prompt columns] :as request}]
  (let [fields-by-id       (u/index-by :id (prototype.db/fields-for-filters (vec (keep :field_id columns))))
        {prompt-cols :columns :as prompt-data} (prompt-columns columns fields-by-id)
        columns-by-id      (u/index-by :id columns)
        known-values-by-id (into {} (keep (fn [{:keys [id known_values]}]
                                            (when known_values [id known_values])))
                                 prompt-cols)
        response           (metabot.self/call-llm-structured
                            (metabot.settings/llm-mini-model)
                            [{:role "system" :content system-prompt}
                             {:role "user" :content (user-message request prompt-data)}]
                            response-schema
                            0
                            2048
                            ;; Prototype: "unknown", because the EE usage log rejects sources that it does not know.
                            {:source              "unknown"
                             :tag                 "prototype-filters"
                             :required-permission :permission/metabot-other-tools})
        ;; Keys below the top level of a structured response are strings.
        raw-filters        (map #(update-keys % keyword) (:filters response))
        filters            (into [] (keep #(validate-filter columns-by-id known-values-by-id %)) raw-filters)]
    (log/infof "Prototype filters: %s -> %s %s, valid %s"
               (pr-str prompt) (:status response) (pr-str raw-filters) (pr-str filters))
    (cond
      ;; The model can leave out the status when it gives filters.
      (or (= "rejected" (:status response)) (empty? raw-filters))
      {:status "rejected"
       :reason (or (not-empty (:reason response)) "These filters could not be created.")}

      ;; A filter that is not valid means that a part of the request is lost, so the whole request fails.
      (or (empty? filters) (not= (count filters) (count raw-filters)))
      {:status "rejected"
       :reason "Some of these filters could not be created with the columns of this question."}

      :else
      {:status "ok" :filters filters})))
