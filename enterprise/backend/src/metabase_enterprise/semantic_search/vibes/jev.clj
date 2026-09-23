(ns metabase-enterprise.semantic-search.vibes.jev
  "HTTP client for TypeSafe's System One endpoint (`POST /v1/systemone`), used by `vibes()` to score a roster of
  candidates against a prompt in one request. Failures never throw out of [[score-candidates!]]: they log once and
  return nil, so the SQL function can fall back to NULL."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.vibes.prompt :as prompt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private chunk-size
  "Candidates per request. Jev takes many questions per request; keep well under its token limit."
  100)

(defn request-body
  "The System One request asking the `question` kind (see `prompt`) of `roster` (`{id candidate}`) against `prompt`
  with `model`."
  [model question prompt roster]
  {:model     model
   :state     (prompt/state question prompt)
   :questions (prompt/questions question roster)})

(defn post!
  "POST `body` (a map) to `url` with the bearer `api-key`. Returns `{:status :headers :body}` with the body as a
  string; throws on connection errors and timeouts. Tests stub this."
  [url body {:keys [api-key timeout-ms]}]
  (http/post url {:headers            {"Authorization" (str "Bearer " api-key)}
                  :content-type       :json
                  :accept             :json
                  :body               (json/encode body)
                  :socket-timeout     timeout-ms
                  :connection-timeout timeout-ms
                  :throw-exceptions   false
                  :as                 :string}))

(defn parse-answers
  "`{id noul}` from a decoded response body; ids missing or malformed are absent."
  [body]
  (into {}
        (keep (fn [[id answer]]
                (let [noul (get answer "noul")]
                  (when (number? noul)
                    [(name id) (double noul)]))))
        (get body "answers")))

(defn- retry-after-ms [headers]
  (some-> (get headers "retry-after") str/trim parse-long (* 1000)))

(defn- retryable? [status]
  (contains? #{429 529} status))

(defn- post-with-retry!
  "One request, retried once on 429/529 when the `retry-after` (default 500 ms) fits in what is left of the
  budget. Returns the response, or nil after a transport error."
  [url body {:keys [timeout-ms] :as opts} deadline]
  (loop [attempt 1]
    (let [response (try
                     (post! url body opts)
                     (catch Exception e
                       (log/warnf "vibes: request failed (%s)" (ex-message e))
                       nil))
          status   (:status response)
          wait-ms  (or (retry-after-ms (:headers response)) 500)
          left-ms  (- deadline (System/currentTimeMillis))]
      (if (and response (retryable? status) (= attempt 1) (< wait-ms left-ms) (pos? timeout-ms))
        (do (log/debugf "vibes: %d, retrying after %d ms" status wait-ms)
            (Thread/sleep (long wait-ms))
            (recur 2))
        response))))

(defn- score-chunk!
  "`{id noul}` for one roster chunk, or nil on any failure."
  [prompt roster {:keys [url model question] :as opts} deadline]
  (let [timer    (u/start-timer)
        response (post-with-retry! url (request-body model question prompt roster) opts deadline)
        status   (:status response)]
    (cond
      (nil? response)
      nil

      (not= 200 status)
      (do (log/warnf "vibes: TypeSafe returned %d: %s" status (some-> (:body response) (subs 0 (min 300 (count (:body response))))))
          nil)

      :else
      (let [body (try
                   (json/decode (:body response))
                   (catch Exception e
                     (log/warnf "vibes: unreadable response (%s)" (ex-message e))
                     nil))]
        (when body
          (log/debugf "vibes: %d candidates scored in %.0f ms, usage %s, model %s"
                      (count roster) (u/since-ms timer) (pr-str (get body "usage")) (get body "model"))
          (parse-answers body))))))

(defn incomplete?
  "Is `scores` (from [[score-candidates!]]) missing chunks that failed or ran out of time?"
  [scores]
  (boolean (::incomplete (meta scores))))

(defn score-candidates!
  "Score every candidate of `roster` (`{id candidate-map}`) against `prompt` with one Jev request per
  [[chunk-size]] candidates. Returns `{id noul}` (ids that Jev didn't answer are absent), or nil when nothing could
  be scored; see [[incomplete?]] when only some chunks were. `opts`: `:url`, `:api-key`, `:model`, `:timeout-ms`
  (the budget for the whole call), `:question` (the `prompt` question kind, default `:search`)."
  [prompt roster {:keys [api-key timeout-ms question] :or {question :search} :as opts}]
  (cond
    (str/blank? api-key)
    (do (log/warn "vibes: no API key configured (vibes-api-key / MB_VIBES_API_KEY)")
        nil)

    (empty? roster)
    {}

    :else
    (let [opts     (assoc opts :question question)
          deadline (+ (System/currentTimeMillis) (long timeout-ms))
          chunks   (partition-all chunk-size roster)
          results  (reduce (fn [acc chunk]
                             (if (<= (- deadline (System/currentTimeMillis)) 0)
                               (reduced acc)
                               (conj acc (score-chunk! prompt (into {} chunk) opts deadline))))
                           []
                           chunks)
          scored   (apply merge results)]
      (cond-> scored
        (and scored (or (< (count results) (count chunks)) (some nil? results)))
        (vary-meta assoc ::incomplete true)))))
