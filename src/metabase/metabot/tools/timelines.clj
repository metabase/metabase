(ns metabase.metabot.tools.timelines
  "`list_timelines` and `get_timeline_details`.

  `get_timeline_details` is converted: it is a record implementing
  `metabase.metabot.tools.core/Tool`. `list_timelines` is not yet, so it is still an `mu/defn` var.
  Both appear in the same profile; see `metabase.metabot.tools/->entries`."
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.timeline.core :as timeline]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn get-timelines
  "Lists timelines visible to the current user."
  [_args]
  (try
    {:structured_output
     (->> (timeline/list-timelines)
          (map #(select-keys % [:id :name :description])))}
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))

(defn get-timeline-details
  "A timeline by id, including its events, or nil when there is no such timeline.

  Returns nil rather than throwing: `timeline/get-timeline` is `[:maybe ...]`, and the caller decides
  what a miss means. `get_timeline_details` reports it as a declared not-found error."
  [timeline-id]
  (when-let [tl (timeline/include-events-singular (timeline/get-timeline timeline-id))]
    (-> (select-keys tl [:id :name :description])
        (assoc :events
               (mapv #(select-keys % [:id :name :description :timestamp :time_matters :timezone])
                     (:events tl))))))

(defn- format-timeline-list-output
  [timelines]
  (if (seq timelines)
    (str "<timelines>\n"
         (str/join "\n" (map (fn [{:keys [id name description]}]
                               (str "<timeline id=\"" id "\" name=\"" (llm-shape/escape-xml name) "\">"
                                    (when description (llm-shape/escape-xml description))
                                    "</timeline>"))
                             timelines))
         "\n</timelines>")
    "No timelines available."))

(defn- format-timeline-details-output
  [{:keys [id name description events]}]
  (str "<timeline id=\"" id "\" name=\"" (llm-shape/escape-xml name) "\">\n"
       (when description (str "<description>" (llm-shape/escape-xml description) "</description>\n"))
       (if (seq events)
         (str "<events>\n"
              (str/join "\n" (map (fn [{:keys [id name description timestamp]}]
                                    (str "<event id=\"" id
                                         "\" name=\"" (llm-shape/escape-xml name)
                                         "\" timestamp=\"" timestamp "\">"
                                         (when description (llm-shape/escape-xml description))
                                         "</event>"))
                                  events))
              "\n</events>\n")
         "<events />\n")
       "</timeline>"))

(defn- add-output
  "Add :output to a tool result."
  [result format-fn]
  (if-let [structured (or (:structured_output result) (:structured-output result))]
    (assoc result :output (format-fn structured))
    result))

(mu/defn ^{:tool-name "list_timelines"
           :scope     scope/agent-timelines-read}
  list-timelines-tool
  "List all timelines available in the Metabase instance.

  If a timeline looks relevant to the user's request, fetch its events using the
  get_timeline_details tool."
  [_args :- [:map {:closed true}]]
  (add-output (get-timelines {}) format-timeline-list-output))

(defrecord GetTimelineDetailsTool []
  tools/Tool
  (declaration [_]
    {:name        "get_timeline_details"
     :description (str "Get the full details of a timeline including its events.\n\n"
                       "Use this tool to retrieve the events on a timeline after identifying it "
                       "with list_timelines. Events include timestamps, names, and descriptions.")
     :scope       scope/agent-timelines-read
     :args        [:map {:closed true} [:timeline_id :int]]})
  (handle [_ {:keys [timeline_id]} _ctx]
    ;; `with-entity` covers the 403 a read check raises. A nil is the other way this misses, and it
    ;; reports the same thing: before, a miss returned `{:structured_output nil}` with no `:output`,
    ;; so the model was shown the printed map.
    (let [timeline (tools/with-entity {:kind :timeline :id timeline_id}
                     (or (get-timeline-details timeline_id)
                         (recoverable.common/not-found! {:kind :timeline :id timeline_id})))]
      ;; No `:structured-output`: nothing reads it for a timeline. It is not one of
      ;; `persistence/persisted-structured-output-keys`, the agent loop keeps no timeline memory, and
      ;; `used-tables` does not look at it.
      {:output (format-timeline-details-output timeline)})))

(def get-timeline-details-tool
  "The `get_timeline_details` tool."
  (->GetTimelineDetailsTool))
