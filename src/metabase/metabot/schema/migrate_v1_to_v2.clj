(ns metabase.metabot.schema.migrate-v1-to-v2
  "Migration fns to migrate messages from the metabase.metabot.schema.v1 to the
  metabase.metabot.schema.v2 at-rest formats."
  (:require
   [malli.error :as me]
   [metabase.metabot.schema.v1 :as schema.v1]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- assistant-placeholder?
  "An empty `metabot_message.data` value: assistant placeholder rows and aborted turns."
  [data]
  (and (sequential? data) (empty? data)))

(defn error->text
  "Extract a v1 tool-output `:error` text."
  [error]
  (cond
    (string? error)                   error
    (and (map? error)
         (string? (:message error)))  (:message error)
    (map? error)                      (pr-str error)
    :else                             (str error)))

(defn- tool-call-entry->parts [{:keys [tool_calls]} outputs]
  (mapv (fn [{:keys [id name arguments]}]
          (let [output (get outputs id)
                input  (try (json/decode+kw arguments)
                            (catch Exception _ arguments))]
            (cond-> {:type       (str "tool-" name)
                     :toolCallId id
                     :state      (if output "output-available" "input-available")
                     :input      input}
              output (assoc :output {:output (:content output)}))))
        tool_calls))

(defn migrate-v1-external-ai-service->v2
  "Convert a v1 ai-service data array (`:_type`-keyed entries) to v2 parts.

  - `TEXT` becomes a text part
  - each call batched in a `TOOL_CALL` becomes its own `tool-<name>` part, merged with its
    matching `TOOL_RESULT` (orphan results are dropped)
  - `DATA` becomes a `data-<type>` part
  - `FINISH_MESSAGE` and `ERROR` are lifecycle signals with no history value and are dropped

  Throws on unrecognized entry types."
  [data]
  (let [outputs (into {}
                      (comp (filter #(= "TOOL_RESULT" (:_type %)))
                            (u/index-by :tool_call_id))
                      data)]
    (->> data
         (remove #(= "TOOL_RESULT" (:_type %)))
         (mapcat (fn [entry]
                   (case (:_type entry)
                     "TEXT"           [{:type "text" :text (:content entry)}]
                     "TOOL_CALL"      (tool-call-entry->parts entry outputs)
                     "DATA"           [{:type (str "data-" (:type entry))
                                        :data (:value entry)}]
                     "FINISH_MESSAGE" []
                     "ERROR"          []
                     (throw (ex-info "Unrecognized v1 ai-service entry type" {:entry entry})))))
         vec)))

(defn migrate-v1-native->v2
  "Convert a v1 native data array (`:type`-keyed message parts) to v2 parts.

  - each `tool-input` becomes a `tool-<function>` part, merged with its matching
    `tool-output` into an `output-available` or `output-error` state (orphan
    `tool-output`s with no matching `tool-input` are dropped)
  - `text` passes through without its `:id`
  - `data` becomes a `data-<data-type>` part
  - `error` entries signal turn failure, not conversation content, and are dropped

  Throws on unrecognized entry types."
  [data]
  (let [outputs (into {}
                      (comp (filter #(= "tool-output" (:type %)))
                            (u/index-by :id))
                      data)]
    (->> data
         (mapcat (fn [entry]
                   (case (:type entry)
                     "text"        [{:type "text" :text (:text entry)}]
                     "tool-input"  (let [output (get outputs (:id entry))
                                         error  (:error output)]
                                     [(cond-> {:type       (str "tool-" (:function entry))
                                               :toolCallId (:id entry)
                                               :state      (cond
                                                             (some? error)  "output-error"
                                                             (some? output) "output-available"
                                                             :else          "input-available")
                                               :input      (:arguments entry)}
                                        ;; errored tool-outputs do co-occur with `:result`, but only because
                                        ;; `persistence/strip-tool-output-bloat` rewrites the absent result of an
                                        ;; errored call to `{}` — there is never a real result to preserve
                                        (and (some? output) (nil? error))
                                        ;; the result map passes through verbatim: its keys (`:output`,
                                        ;; `:structured-output`/`:structured_output`) keep their v1 spelling
                                        ;; inside the opaque v2 `:output`, matching what consumers like
                                        ;; `metabot-analytics.queries` already read
                                        (assoc :output (:result output))

                                        (some? error)
                                        (assoc :errorText (error->text error)))])
                     "tool-output" []
                     "data"        [{:type (str "data-" (:data-type entry))
                                     :data (:data entry)}]
                     "error"       []
                     (throw (ex-info "Unrecognized v1 native entry type" {:entry entry})))))
         vec)))

(defn migrate-v1-user-message->v2
  "Convert a v1 user-message data array to v2 parts."
  [data]
  (mapv (fn [{:keys [content]}] {:type "text" :text content}) data))

(defn migrate-v1->v2
  "Convert a v1 `metabot_message.data` value to the v2 format.
  Empty arrays (assistant placeholders and aborted turns) pass through.
  Throws on values that do not satisfy any v1 schema."
  [data]
  (cond
    (assistant-placeholder? data)                    data
    (mr/validate ::schema.v1/ai-service-data data)   (migrate-v1-external-ai-service->v2 data)
    (mr/validate ::schema.v1/native-data data)       (migrate-v1-native->v2 data)
    (mr/validate ::schema.v1/user-message-data data) (migrate-v1-user-message->v2 data)
    :else
    ;; explain only against the format the row resembles (by its entries' dispatch tag),
    ;; rather than dumping a humanized mismatch for all three v1 schemas
    (let [entry  (when (sequential? data) (first data))
          schema (cond
                   (:_type entry)           ::schema.v1/ai-service-data
                   (:type entry)            ::schema.v1/native-data
                   (= "user" (:role entry)) ::schema.v1/user-message-data)]
      (throw (ex-info "Unrecognized v1 storage format"
                      (cond-> {:data data}
                        schema (assoc :explanation (me/humanize (mr/explain schema data)))))))))

(comment
  ;; validate the v1->v2 conversion against a CSV dump of metabot_message table
  (require '[clojure.data.csv :as csv]
           '[clojure.java.io :as io]
           '[metabase.metabot.schema.v2])

  (defn validate-conversion-csv [path]
    (with-open [reader (io/reader path)]
      (let [[header & rows] (csv/read-csv reader)
            column-index    (fn [column] (first (keep-indexed #(when (= column %2) %1) header)))
            id-idx          (column-index "id")
            data-idx        (column-index "data")
            explain         (mr/explainer :metabase.metabot.schema.v2/message-data)]
        (reduce (fn [acc row]
                  (let [raw      (nth row data-idx)
                        v1       (try (json/decode+kw raw) (catch Exception e e))
                        migrated (if (instance? Exception v1)
                                   v1
                                   (try (migrate-v1->v2 v1) (catch Exception e e)))
                        error    (cond
                                   (instance? Exception v1)       {:json-parse (ex-message v1)}
                                   (instance? Exception migrated) {:migrate (ex-message migrated)
                                                                   :data    (ex-data migrated)}
                                   :else                          (some-> (explain migrated) me/humanize))]
                    (cond-> (update acc :row-count inc)
                      error (-> (update :failure-count inc)
                                (update :failures conj {:message-id (when id-idx (nth row id-idx))
                                                        :message    (if (instance? Exception v1) raw v1)
                                                        :error      error})))))
                {:row-count 0 :failure-count 0 :failures []}
                rows))))

  (validate-conversion-csv "./metabot_message_dump.csv"))
