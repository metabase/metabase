(ns metabase.prototype.filter-summary
  "Prototype: an LLM turns the filters of a question, like \"City is San Francisco\" and \"Quantity is between 100
  and 1,000\", into one short phrase, like \"In San Francisco with quantity between 100 and 1,000\". The filter bar
  shows the phrase in place of the pills."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util.log :as log]))

(def ^:private response-schema
  {:type       "object"
   :properties {:summary {:type        "string"
                          :description "The summary of the filters, as one short phrase."}}
   :required   ["summary"]})

(def ^:private system-prompt
  "You summarize the filters of a question in a data tool as one short phrase. The filter bar shows the phrase under
the title of the question, in place of the filter pills, so that the user reads it at a glance.

Rules:
- Write one phrase, not a sentence. No period at the end. Start with a capital letter.
- Keep it short, but keep every filter: about 4 words for each filter, so about 12 words for 3 filters and 24
  for 6. Never drop a filter to make the phrase shorter.
- Write a phrase that flows, joined with prepositions like \"in\", \"on\", \"with\", \"from\" and \"over\", not a
  list with commas. Put places first. Examples:
  - \"City is San Francisco\" and \"Quantity is between 100 and 1,000\" give \"In San Francisco with quantity
    between 100 and 1,000\".
  - \"State is California\", \"Plan is Pro, Business\" and \"Lifetime Value is greater than 1,000\" give \"In
    California on Pro or Business plans with lifetime value over 1,000\".
- Use compact words: \"active\" for \"Status is active\", \"satisfaction ≤ 40\" for \"Satisfaction Score is less
  than or equal to 40\", \"not seen in 30 days\" for \"Last Seen At is before 30 days ago\", \"in the last 12
  months\" for a previous period. Name a group of places when all of its members are in the values and no other
  place is, like \"5 EU countries\" for Germany, France, Italy, Spain and the Netherlands.
- Example with 6 filters: \"Channel is Online, Mobile App\", \"Status is not cancelled, returned\", \"Total is
  between 200 and 2,000\", \"Ordered At is previous 12 months\", \"Product → Category is Electronics\" and
  \"Customer → Country is Germany, France\" give \"Electronics orders from Germany or France, online or in the app,
  total 200–2,000, last 12 months, not cancelled or returned\".
- Keep every filter. Do not drop a condition, and do not add one. Exclusions too, like \"not cancelled or
  returned\" for \"Status is not cancelled, returned\".
- Keep the numbers and the dates exact. Keep the thousands separators of the input.
- Always write names for country and state codes: \"Country is DE, FR\" gives \"in Germany or France\", and
  \"State is CA\" gives \"in California\". With more than 3 places, name the group when the values are exactly
  that group, like \"in the Nordics\", or else write the count, like \"in 5 European countries\".
- Write \"or\" between the values of one filter, like \"on Pro or Business plans\".
- Use the column names only where the phrase needs them. \"Plan is Pro\" can be \"Pro plan\".
- Do not repeat the title of the question.")

(defn- user-message [{:keys [question_name filters]}]
  (str (when-not (str/blank? question_name)
         (str "Question title: " question_name "\n\n"))
       "Filters:\n"
       (str/join "\n" (map #(str "- " %) filters))))

(defn- summarize* [request]
  (let [response (metabot.self/call-llm-structured
                  (metabot.settings/llm-mini-model)
                  [{:role "system" :content system-prompt}
                   {:role "user" :content (user-message request)}]
                  response-schema
                  0
                  256
                  ;; Prototype: "unknown", because the EE usage log rejects sources that it does not know.
                  {:source              "unknown"
                   :tag                 "prototype-filter-summary"
                   :required-permission :permission/metabot-other-tools})
        summary  (some-> (:summary response) str/trim (str/replace #"\.$" ""))]
    (log/infof "Prototype filter summary: %s -> %s" (pr-str (:filters request)) (pr-str summary))
    (when (seq summary)
      summary)))

(def ^:private summarize-cached
  "The same filters get the same summary, with no new call to the LLM."
  (memoize/lru summarize* :lru/threshold 500))

(defn summarize-filters
  "Ask the LLM for a short summary of the `filters`, the texts of the filter pills. Returns `{:summary \"...\"}`, or
  `{:summary nil}` when the LLM gives no summary."
  [request]
  {:summary (summarize-cached (select-keys request [:question_name :filters]))})
