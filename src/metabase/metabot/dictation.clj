(ns metabase.metabot.dictation
  "Transcription using an existing OpenAI connection."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def max-recording-bytes
  "Maximum accepted recording size, below OpenAI's 25 MB limit."
  24000000)

(defn connection
  "The active OpenAI connection, or the first usable OpenAI connection."
  []
  (let [connections (filter #(and (= "openai" (:type %))
                                  (not (str/blank? (get-in % [:config :api-key]))))
                            (llm.provider/connections))
        active-key  (llm.provider/model-ref->connection-key (metabot.settings/llm-metabot-provider))]
    (or (u/seek #(= active-key (:key %)) connections)
        (first connections))))

(defn- recording-type
  [{:keys [content-type ^File tempfile]}]
  (let [mime-type (some-> content-type (str/split #";" 2) first str/trim u/lower-case-en)
        extension ({"audio/webm" "webm" "audio/mp4" "mp4"} mime-type)]
    (api/check (pos? (.length tempfile)) [400 (tru "The recording is empty.")])
    (api/check (<= (.length tempfile) max-recording-bytes) [413 (tru "The recording is too large.")])
    (api/check extension [415 (tru "Unsupported recording format.")])
    {:mime-type mime-type :extension extension}))

(defn- request-transcript!
  [credentials file mime-type extension]
  (try
    (let [response (self.core/request
                    {:url (:base-url credentials)
                     :headers {"Authorization" (str "Bearer " (:api-key credentials))}}
                    {:method :post
                     :url "/v1/audio/transcriptions"
                     :as :json
                     :multipart [{:name "model" :content "gpt-transcribe"}
                                 {:name "file" :content file :mime-type mime-type
                                  :filename (str "dictation." extension)}]})
          text     (get-in response [:body :text])]
      (api/check (string? text) [502 (tru "Could not transcribe the recording. Please try again.")])
      {:text text})
    (catch Exception e
      (throw (ex-info (if (= 429 (:status (ex-data e)))
                        (tru "Dictation is busy. Please try again.")
                        (tru "Could not transcribe the recording. Please try again."))
                      {:status-code (if (= 429 (:status (ex-data e))) 429 502)})))))

(defn transcribe!
  "Validate a recording and transcribe it without persisting audio or text."
  [file]
  (let [{:keys [mime-type extension]} (recording-type file)
        conn (connection)]
    (api/check conn [503 (tru "Dictation requires an OpenAI connection.")])
    (request-transcript! (llm.provider/with-field-defaults "openai" (:config conn))
                         (:tempfile file) mime-type extension)))
