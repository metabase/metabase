(ns metabase.metabot.schema.v4
  "Schemas for the legacy v4 at-rest `metabot_message.data` formats. These are bespoke Metabase
  formats with no upstream source — hand-encoded from the historical writers. Validates
  post-select values: JSON keys are keywordized, all values are strings."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::external-ai-service-entry
  "An entry written by the external-ai-service path — the at-rest form of
  [[metabase.metabot.util/aisdk->messages]] output."
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

(mr/def ::native-entry
  "An entry written by the native agent loop — the at-rest form of the parts built by
  `aisdk-chunks->part` after `finalize-assistant-turn!` filtering and `strip-tool-output-bloat`."
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
  [:map {:closed true}
   [:role [:= "user"]]
   [:content :string]])

(mr/def ::message-data
  "A whole `metabot_message.data` value in the legacy v4 format. Rows are written wholesale by a
  single writer, so entries within a row are homogeneous; assistant placeholder rows are `[]`."
  [:or
   [:sequential {:max 0} :any]
   [:sequential {:min 1} ::user-message-entry]
   [:sequential {:min 1} ::external-ai-service-entry]
   [:sequential {:min 1} ::native-entry]])

(defn normalize-entry
  "Maps historically-persisted entry shapes that predate the v4 spec onto their spec-compliant
  equivalents; entries already compliant pass through unchanged. Two deviations exist in
  production data (verified against a full dump of `metabot_message`, all rows validate against
  [[::message-data]] after this mapping):

  - native `tool-output` entries written before `strip-tool-output-bloat` carry the full tool
    result (`:instructions`, `:resources`, `:data-parts`, …) — trimmed to the persisted subset
  - a short-lived writer persisted errors as `{:type \"error\" :errorText ...}` — rewritten to
    the spec'd `{:type \"error\" :error ...}`"
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
