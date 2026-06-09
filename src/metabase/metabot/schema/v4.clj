(ns metabase.metabot.schema.v4
  "Schemas for the v4 at-rest `metabot_message.data` formats. A `data` value is a vector in one
  of three self-describing shapes: stream-part entries (persisted AI SDK v4 data-stream parts,
  tagged by uppercase `:_type`), part entries (message parts keyed by lowercase `:type`), or a
  user message. Validates post-select values: JSON keys are keywordized, all values are strings.

  Upstream protocol: https://github.com/vercel/ai (ai@4, packages/ui-utils/src/stream-parts.ts)"
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::stream-part-entry
  "The at-rest form of an AI SDK v4 data-stream part. The `:_type` tags are the v4 protocol's
  stream-part names, uppercased."
  [:multi {:dispatch :_type}
   ["TEXT"           [:map {:closed true}
                      [:role :string]
                      [:_type [:= "TEXT"]]
                      [:content :string]]]
   ["ERROR"          [:map {:closed true}
                      [:role :string]
                      [:_type [:= "ERROR"]]
                      [:content :string]]]
   ["DATA"           [:map {:closed true}
                      [:_type [:= "DATA"]]
                      [:type :string]
                      [:version :int]
                      [:value :any]]]
   ["TOOL_CALL"      [:map {:closed true}
                      [:role :string]
                      [:_type [:= "TOOL_CALL"]]
                      [:tool_calls [:sequential [:map {:closed true}
                                                 [:id :string]
                                                 [:name :string]
                                                 [:arguments :string]]]]]]
   ["TOOL_RESULT"    [:map {:closed true}
                      [:role [:= "tool"]]
                      [:_type [:= "TOOL_RESULT"]]
                      [:tool_call_id :string]
                      [:content :string]]]
   ["FINISH_MESSAGE" [:map {:closed true}
                      [:role :string]
                      [:_type [:= "FINISH_MESSAGE"]]
                      [:finish_reason :string]
                      [:usage :map]]]])

(mr/def ::part-entry
  "A message part, keyed by lowercase `:type`."
  [:multi {:dispatch :type}
   ["text"        [:map {:closed true}
                   [:type [:= "text"]]
                   [:id {:optional true} [:maybe :string]]
                   [:text :string]]]
   ["tool-input"  [:map {:closed true}
                   [:type [:= "tool-input"]]
                   [:id :string]
                   [:function :string]
                   [:arguments [:maybe :map]]]]
   ["tool-output" [:map {:closed true}
                   [:type [:= "tool-output"]]
                   [:id :string]
                   [:function {:optional true} [:maybe :string]]
                   [:result [:maybe [:map {:closed true}
                                     [:output {:optional true} :any]
                                     [:structured-output {:optional true} :map]
                                     [:structured_output {:optional true} :map]]]]
                   [:error {:optional true} [:maybe [:or :map :string]]]
                   [:duration-ms {:optional true} [:maybe number?]]]]
   ["data"        [:map {:closed true}
                   [:type [:= "data"]]
                   [:data-type :string]
                   [:version {:optional true} :int]
                   [:data :any]]]
   ["error"       [:map {:closed true}
                   [:type [:= "error"]]
                   [:error [:or :map :string]]]]])

(mr/def ::user-message-entry
  "A user message."
  [:map {:closed true}
   [:role [:= "user"]]
   [:content :string]])

(mr/def ::message-data
  "A whole `metabot_message.data` value in the v4 format. Entries within a row are homogeneous;
  assistant placeholder rows are `[]`."
  [:or
   [:sequential {:max 0} :any]
   [:sequential {:min 1} ::user-message-entry]
   [:sequential {:min 1} ::stream-part-entry]
   [:sequential {:min 1} ::part-entry]])

(defn normalize-entry
  "Maps the non-compliant entry shapes found in production data onto their
  [[::message-data]]-compliant equivalents; compliant entries pass through unchanged:

  - `tool-output` [[::part-entry]]s carrying full tool results (`:instructions`, `:resources`,
    `:data-parts`, …) are trimmed to the persisted subset
  - `{:type \"error\" :errorText ...}` entries are rewritten to `{:type \"error\" :error ...}`"
  [entry]
  (cond
    (not (map? entry))
    entry

    (= "tool-output" (:type entry))
    (update entry :result #(some-> % (select-keys [:output :structured-output :structured_output])))

    (and (= "error" (:type entry)) (contains? entry :errorText))
    (-> entry
        (assoc :error (:errorText entry))
        (dissoc :errorText))

    :else entry))

(comment
  ;; validate a CSV dump of metabot_message (`id` and `data` columns, header row) against the
  ;; v4 at-rest schema, e.g. from psql:
  ;;   \copy (select id, data from metabot_message) to 'dump.csv' with csv header
  (require '[clojure.data.csv :as csv]
           '[clojure.java.io :as io]
           '[malli.error :as me]
           '[metabase.util.json :as json])

  (defn validate-csv [path]
    (with-open [reader (io/reader path)]
      (let [[header & rows] (csv/read-csv reader)
            column-index    (fn [column] (first (keep-indexed #(when (= column %2) %1) header)))
            id-idx          (column-index "id")
            data-idx        (column-index "data")
            explain         (mr/explainer ::message-data)]
        (reduce (fn [acc row]
                  (let [raw    (nth row data-idx)
                        parsed (try (json/decode+kw raw) (catch Exception e e))
                        parsed (cond->> parsed
                                 (sequential? parsed) (mapv normalize-entry))
                        error  (if (instance? Exception parsed)
                                 {:json-parse (ex-message parsed)}
                                 (some-> (explain parsed) me/humanize))]
                    (cond-> (update acc :row-count inc)
                      error (-> (update :failure-count inc)
                                (update :failures conj {:message-id (when id-idx (nth row id-idx))
                                                        :message    (if (instance? Exception parsed) raw parsed)
                                                        :error      error})))))
                {:row-count 0 :failure-count 0 :failures []}
                rows))))

  (validate-csv "/path/to/metabot_message.csv"))
