(ns metabase.metabot.tools.timelines
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
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
  "Retrieve a specific timeline by ID, including its events."
  [{:keys [timeline-id]}]
  (try
    {:structured_output
     (when timeline-id
       (when-let [tl (timeline/include-events-singular
                      (timeline/get-timeline timeline-id))]
         (-> (select-keys tl [:id :name :description])
             (assoc :events
                    (mapv #(select-keys % [:id :name :description :timestamp :time_matters :timezone])
                          (:events tl))))))}
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))

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

(mu/defn ^{:tool-name "get_timeline_details"
           :scope     scope/agent-timelines-read}
  get-timeline-details-tool
  "Get the full details of a timeline including its events.

  Use this tool to retrieve the events on a timeline after identifying it with
  list_timelines. Events include timestamps, names, and descriptions."
  [{:keys [timeline_id]} :- [:map {:closed true} [:timeline_id :int]]]
  (add-output (get-timeline-details {:timeline-id timeline_id}) format-timeline-details-output))
