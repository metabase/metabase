(ns metabase-enterprise.metabot-v3.context
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.metabot-v3.tools.query :as metabot-v3.tools.query]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.time OffsetDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;; todo: remove this before shipping. This is quick and dirty
(defn log
  "Log a payload. Direction should be `:llm.log/fe->be` or similar. This should not be shipping in this form. This is
  not a rolling log, or logging to the console. This pretty prints to the file `llm-payloads`. It is explicitly useful
  for dev work and not production.

  Examples calls are ;; using doto
    (doto (request message context history)
      (metabot-v3.context/log :llm.log/be->fe))
    ;; or just regularly
    (metabot-v3.context/log _body :llm.log/fe->be)"
  [payload direction]
  (when config/is-dev?
    (let [directions {:llm.log/fe->be "\"FE -----------------> BE\""
                      :llm.log/be->llm "\"BE -----------------> LLM\""
                      :llm.log/llm->be "\"LLM -----------------> BE\""
                      :llm.log/be->fe "\"BE -----------------> FE\""}]
      (with-open [^java.io.BufferedWriter w (io/writer "llm-payloads" :append true)]
        (io/copy (directions direction (name direction)) w)
        (.newLine w)
        (let [payload' (json/encode payload {:pretty true})]
          (io/copy payload' w))
        (.newLine w)
        (.newLine w)))))

(mr/def ::context
  [:map-of
   ;; TODO -- should this be recursive?
   {:encode/api-request #(update-keys % u/->snake_case_en)}
   :keyword
   :any])

(def ^:private current-user-time-format
  (DateTimeFormatter/ofPattern "'Today is' EEEE, 'Year' yyyy, 'Date' yyyy-MM-dd, HH:mm:ss"))

(defn- set-user-time
  [context {:keys [date-format] :or {date-format current-user-time-format}}]
  (let [offset-time (or (some-> context :current_time_with_timezone OffsetDateTime/parse)
                        (OffsetDateTime/now))]
    (-> context
        (dissoc :current_time_with_timezone)
        (assoc :current_user_time (.format ^DateTimeFormatter date-format offset-time)))))

(mu/defn create-context
  "Create a tool context."
  ([context]
   (create-context context nil))
  ([context opts]
   (set-user-time context opts)))

(mu/defn create-reactions
  "Extracts reactions based on the current context."
  [context]
  (vec (metabot-v3.tools.query/create-reactions context)))
