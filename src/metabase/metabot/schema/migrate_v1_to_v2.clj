(ns metabase.metabot.schema.migrate-v1-to-v2
  "Pure conversions from the v1 at-rest `metabot_message.data` formats
  (`metabase.metabot.schema.v1`) to the v2 format (`metabase.metabot.schema.v2`'s
  `::message-data`). Not wired into any read or write path yet."
  (:require
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- v1-external-ai-service? [data]
  (and (sequential? data)
       (boolean (some :_type data))))

(defn- v1-native? [data]
  (and (sequential? data)
       (seq data)
       (every? #(#{"tool-input" "tool-output" "text" "error" "data"} (:type %)) data)))

(defn- v1-user-message? [data]
  (and (sequential? data)
       (seq data)
       (every? #(and (= "user" (:role %))
                     (string? (:content %))
                     (nil? (:_type %)))
               data)))

(defn- error->text [error]
  (cond
    (string? error) error
    (map? error)    (or (:message error) (pr-str error))
    :else           (str error)))

(defn- tool-call-entry->parts [{:keys [tool_calls]} outputs]
  (mapv (fn [{:keys [id name arguments]}]
          (let [output (get outputs id)
                input  (try (json/decode+kw arguments)
                            (catch Throwable _ arguments))]
            (cond-> {:type         (str "tool-" name)
                     :tool_call_id id
                     :state        (if output "output-available" "input-available")
                     :input        input}
              output (assoc :output (:content output)))))
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
                            (map (juxt :tool_call_id identity)))
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
    `tool-output` into an `output-available` or `output-error` state
  - `text` passes through without its `:id`
  - `data` becomes a `data-<data-type>` part
  - `error` entries signal turn failure, not conversation content, and are dropped"
  [data]
  (let [outputs (into {}
                      (comp (filter #(= "tool-output" (:type %)))
                            (map (juxt :id identity)))
                      data)]
    (->> data
         (mapcat (fn [entry]
                   (case (:type entry)
                     "text"        [{:type "text" :text (:text entry)}]
                     "tool-input"  (let [output (get outputs (:id entry))
                                         error  (:error output)]
                                     [(cond-> {:type         (str "tool-" (:function entry))
                                               :tool_call_id (:id entry)
                                               :state        (cond
                                                               (some? error)  "output-error"
                                                               (some? output) "output-available"
                                                               :else          "input-available")
                                               :input        (:arguments entry)}
                                        (and (some? output) (nil? error))
                                        (assoc :output (:output (:result output)))

                                        (some? error)
                                        (assoc :error_text (error->text error)))])
                     "tool-output" []
                     "data"        [{:type (str "data-" (:data-type entry))
                                     :data (:data entry)}]
                     "error"       [])))
         vec)))

(defn migrate-v1-user-message->v2
  "Convert a v1 user-message data array to v2 parts."
  [data]
  (mapv (fn [{:keys [content]}] {:type "text" :text content}) data))

(defn migrate-v1->v2
  "Convert a v1 `metabot_message.data` value to the v2 format, dispatching on the detected
  shape. Empty arrays (assistant placeholders and aborted turns) pass through. Throws on
  unrecognized shapes."
  [data]
  (cond
    (empty? data)                  data
    (v1-external-ai-service? data) (migrate-v1-external-ai-service->v2 data)
    (v1-native? data)              (migrate-v1-native->v2 data)
    (v1-user-message? data)        (migrate-v1-user-message->v2 data)
    :else                          (throw (ex-info "Unrecognized v1 storage format" {:data data}))))

(comment
  ;; validate the v1->v2 conversion against a CSV dump of metabot_message (`id` and `data`
  ;; columns, header row), e.g. from psql:
  ;;   \copy (select id, data from metabot_message) to 'dump.csv' with csv header
  (require '[clojure.data.csv :as csv]
           '[clojure.java.io :as io]
           '[malli.error :as me]
           '[metabase.metabot.schema.v2]
           '[metabase.util.malli.registry :as mr])

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
