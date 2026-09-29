(ns metabase-enterprise.data-sensitivity.jev
  "The TypeSafe Jev engine of the data-sensitivity classifier. Jev is a decision model: it answers enumerated
  `choice` questions about a `state` with a probability distribution and generates no text. Each field gets a
  sensitivity question (`s<i>`) and a semantic-type question (`t<i>`), asked either per chunk of a table (`:table`
  shape) or one request per field (`:field` shape). The field rendering is the LLM engine's, so the two engines see
  the same inputs. [[classify-packet]] returns the same shape as [[llm/classify-packet]]."
  (:require
   [clj-http.client :as http]
   [clj-http.conn-mgr :as conn-mgr]
   [clojure.string :as str]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase-enterprise.data-sensitivity.settings :as ds.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (com.google.common.util.concurrent RateLimiter)
   (java.util.concurrent Callable ExecutionException Executors Future)
   (org.apache.http.conn ConnectTimeoutException)))

(set! *warn-on-reflection* true)

(def endpoint
  "The Jev decision endpoint. Fixed, not admin-configurable."
  "https://api.typesafe.ai/v1/systemone")

(def default-model
  "Pinned rather than `jev-latest` so runs are reproducible."
  "jev-1.13.0")

(def default-options
  "Defaults for [[classify-packet]] options. `:chunk-size` fields per `:table` request keeps a request with long
  value lines under the 64k-token limit; an oversize request is split in half and retried."
  {:model              default-model
   :chunk-size         40
   :request-shape      :table
   :criteria           :shared
   :abstain-below      0.5
   :semantic-min       0.7
   :field-parallelism  4
   :max-rps            15
   :connect-timeout-ms 5000
   :socket-timeout-ms  30000
   :max-retries        3})

(mr/def ::options
  [:map {:closed true}
   [:model              {:optional true} [:maybe :string]]
   [:chunk-size         {:optional true} [:maybe pos-int?]]
   [:request-shape      {:optional true} [:maybe [:enum :table :field]]]
   [:criteria           {:optional true} [:maybe [:enum :shared :tuned]]]
   [:abstain-below      {:optional true} [:maybe number?]]
   [:semantic-min       {:optional true} [:maybe number?]]
   [:field-parallelism  {:optional true} [:maybe pos-int?]]
   [:max-rps            {:optional true} [:maybe pos?]]
   [:connect-timeout-ms {:optional true} [:maybe pos-int?]]
   [:socket-timeout-ms  {:optional true} [:maybe pos-int?]]
   [:max-retries        {:optional true} [:maybe nat-int?]]])

(defn configured?
  "Whether a Jev API key is set."
  []
  (not (str/blank? (ds.settings/data-sensitivity-jev-api-key))))

;;; Questions

(def ^:private tuned-definitions
  "Short, affirmatively stated definitions: Jev reads negation and indirect phrasing poorly, and every question
  repeats its criteria, so each word is billed once per field."
  {"SEC_KEY"       "Secrets that grant access: passwords, password hashes, API keys, access tokens, private keys, connection strings."
   "SYS_TELEMETRY" "Machine and network identifiers: IP addresses, MAC addresses, hostnames, user agents, device ids, session ids."
   "PHI"           "Health information about a person: patient ids, medical record numbers, diagnoses, medications, prescriptions, lab results, insurance ids, vital signs."
   "BIO_GEN"       "Biometric or genetic data: fingerprints, face scans, voice prints, iris scans, DNA, genotypes."
   "PCI_FIN"       "Payment card and bank account data: card numbers, CVV codes, card expiry dates, IBANs, routing numbers, account numbers."
   "SENS_PERS"     "Special-category personal traits: race, ethnicity, religion, political views, sexual orientation, gender, disability, criminal record."
   "PII"           "Data that identifies, contacts or locates a person: names, usernames, email addresses and email recipients, phone numbers, birth dates, ages, government ids, and a person's street, city, state, postal code, country or coordinates."
   "CORP_IP"       "Intellectual property: source code, designs, patents, proprietary algorithms, model weights."
   "BIZ_CONF"      "Confidential business figures: salaries, payroll, revenue, profit, margins, budgets, forecasts, contract values."
   "PUBLIC"        "Ordinary business or product data: surrogate keys, foreign-key ids such as city_id or state_id, timestamps, categories, product attributes, quantities, prices, ratings."})

(defn- ordered-criteria
  "`definitions` as a map in precedence order, so the serialized request lists the most severe category first."
  [definitions]
  (apply array-map (mapcat (fn [c] [c (get definitions c)]) llm/categories)))

(def ^:private precedence
  (str/join ", " llm/categories))

(def ^:private sensitivity-questions
  {:shared (str "Which category describes the data held in the column named by `column`? Decide from the column's "
                "name, database and semantic types, description, foreign-key target, fingerprint statistics and values "
                "together: values that look like emails, card numbers or national ids make a column sensitive whatever "
                "its name, and plainly innocuous values make it non-sensitive whatever its name. A semantic type, "
                "description or display name marked [human-set] was chosen by a person and is ground truth about what "
                "the column means. Foreign keys and surrogate ids are PUBLIC unless the id itself is a government, "
                "payment or device identifier. When several categories fit, choose the most severe, in this order: "
                precedence ".")
   :tuned  (str "Which category describes the data held in the column named by `column`? Use its name, types, "
                "description, foreign-key target, statistics and values together. Details marked [human-set] are ground "
                "truth. Foreign keys and surrogate ids are PUBLIC. When several categories fit, choose the earliest in "
                "this order: " precedence ".")})

(def ^:private semantic-question
  (str "Which semantic type describes the column named by `column` exactly? Choose " llm/no-semantic-type
       " when its current semantic type is right or no type fits exactly."))

(def ^:private semantic-criteria
  (apply array-map
         llm/no-semantic-type "The current semantic type is right, or no type fits exactly."
         (mapcat (fn [t] [t nil]) llm/semantic-types)))

(defn- questions
  "The sensitivity and semantic questions for `fields`, ids `s<i>` and `t<i>` by index within the request."
  [criteria fields]
  (let [category-criteria (ordered-criteria (case criteria
                                              :shared llm/category-definitions
                                              :tuned  tuned-definitions))]
    (into {}
          (mapcat (fn [i {:keys [name]}]
                    [[(str "s" i) {:type         "choice"
                                   :instructions {:column name :question (get sensitivity-questions criteria)}
                                   :criteria     category-criteria}]
                     [(str "t" i) {:type         "choice"
                                   :instructions {:column name :question semantic-question}
                                   :criteria     semantic-criteria}]])
                  (range)
                  fields))))

(defn- table-state [{:keys [name schema engine entity_type description]}]
  (cond-> {:name name}
    schema                      (assoc :schema schema)
    engine                      (assoc :engine (clojure.core/name engine))
    entity_type                 (assoc :entity_type (subs (str entity_type) 1))
    (not (str/blank? description)) (assoc :description description)))

(defn table-request
  "One `:table`-shape request: the table and the rendered lines of `fields` as state, two questions per field."
  [{:keys [table]} fields {:keys [model criteria]}]
  {:model     model
   :state     {:table   (table-state table)
               :columns (mapv llm/render-field-line fields)}
   :questions (questions criteria fields)})

(defn field-request
  "One `:field`-shape request: the table, the rendered line of `field` and the names of its siblings as state."
  [{:keys [table] :as packet} field {:keys [model criteria]}]
  {:model     model
   :state     {:table         (table-state table)
               :column        (llm/render-field-line field)
               :other_columns (into [] (comp (map :name) (remove #{(:name field)})) (:fields packet))}
   :questions (questions criteria [field])})

;;; HTTP

(defonce ^:private connection-manager
  (delay (conn-mgr/make-reusable-conn-manager {:threads 16 :default-per-route 16})))

(defonce ^:private ^RateLimiter rate-limiter
  (RateLimiter/create (double (:max-rps default-options))))

(defn- post!
  [api-key body {:keys [connect-timeout-ms socket-timeout-ms]}]
  (http/post endpoint {:headers            {"Authorization" (str "Bearer " api-key)}
                       :body               (json/encode body)
                       :content-type       :json
                       :accept             :json
                       :throw-exceptions   false
                       :cookie-policy      :none
                       :connection-timeout connect-timeout-ms
                       :socket-timeout     socket-timeout-ms
                       :connection-manager @connection-manager}))

(def ^:private retryable-statuses
  #{429 500 502 503 504 529})

(defn- backoff-ms
  "Exponential backoff with full jitter, or the server's `Retry-After` when it sent one."
  [attempt response]
  (if-let [retry-after (some-> (get-in response [:headers "retry-after"]) parse-long)]
    (* 1000 (min retry-after 30))
    (long (* (rand) 500 (Math/pow 2 attempt)))))

(defn- error-detail [{:keys [body]}]
  (let [detail (get (try (json/decode body) (catch Exception _ nil)) "detail")]
    (cond
      (map? detail)        {:error-type (get detail "error_type") :message (get detail "message")}
      (sequential? detail) {:message (str/join "; " (map (fn [{:strs [loc msg]}] (str (str/join "." loc) ": " msg))
                                                         detail))}
      :else                {:message (some-> body str (subs 0 (min 200 (count body))))})))

(defn- response-ex
  "An `oversize` 400 and a 422 are per-request problems, so they carry no `:api-error` and never reach
  `core/fatal-error?` as a provider rejection. Every other status is a provider error."
  [{:keys [status] :as response}]
  (let [{:keys [error-type message]} (error-detail response)
        message                      (if (str/blank? message) (str "TypeSafe returned HTTP " status) message)]
    (cond
      (= "max_tokens_exceeded" error-type)
      (ex-info (tru "The Jev request exceeds the model''s token limit.") {:error-code :max-tokens-exceeded :status status})

      (= 422 status)
      (ex-info message {:error-code :jev-request-invalid :status status})

      :else
      (ex-info message {:api-error true :provider "typesafe" :status status}))))

(defn- elapsed-ms [start]
  (quot (- (System/nanoTime) start) 1000000))

(defn- request!
  "POST `body`, retrying retryable statuses and connection failures. Returns `{:body :request-ms :retries}`, where
  `:request-ms` holds the latency of every attempt."
  [api-key body {:keys [max-retries] :as opts}]
  (loop [attempt 0 latencies []]
    (.acquire rate-limiter)
    (let [start                  (System/nanoTime)
          [response ex]          (try
                                   [(post! api-key body opts) nil]
                                   (catch ConnectTimeoutException e [nil e])
                                   (catch java.net.ConnectException e [nil e]))
          latencies              (conj latencies (elapsed-ms start))
          {:keys [status]}       response]
      (cond
        (and response (<= 200 status 299))
        {:body (json/decode (:body response)) :request-ms latencies :retries attempt}

        (and (< attempt max-retries) (or ex (contains? retryable-statuses status)))
        (do (log/debugf "Jev request failed (%s), retrying" (or status (ex-message ex)))
            (Thread/sleep (long (backoff-ms attempt response)))
            (recur (inc attempt) latencies))

        ex    (throw ex)
        :else (throw (response-ex response))))))

;;; Parse

(def ^:private category-set (set llm/categories))
(def ^:private semantic-type-set (set llm/semantic-types))

(defn- confidence-bucket
  "The vendor's suggested gates, as the LLM engine's confidence strings."
  [confidence]
  (when confidence
    (cond
      (>= confidence 0.9) "high"
      (>= confidence 0.5) "medium"
      :else               "low")))

(defn- round4 [x]
  (/ (Math/round (* 10000.0 (double x))) 10000.0))

(defn- reasoning [probabilities choice]
  (let [[runner-up p] (->> (dissoc probabilities choice) (sort-by (comp - val)) first)]
    (str "p=" (format "%.2f" (double (get probabilities choice 0)))
         (when runner-up (format "; runner-up %s %.2f" runner-up (double p))))))

(defn- semantic-answer [{:strs [choice confidence]} semantic-min count!]
  (cond
    (or (nil? choice) (= llm/no-semantic-type choice))  nil
    (not (contains? semantic-type-set choice))          (do (count! :semantic-dropped) nil)
    (< (double (or confidence 0)) semantic-min)         nil
    :else                                               (keyword choice)))

(def ^:private dropped
  {:data-sensitivity nil :confidence nil :semantic-type nil :reasoning nil :status :dropped})

(defn- zero-counts []
  {:dropped-unknown 0 :dropped-invalid 0 :dropped-missing 0 :semantic-dropped 0 :dropped-oversize 0})

(mu/defn parse-answers :- ::llm/parsed
  "One entry per field of a request from its answers `s<i>` and `t<i>`. The argmax category is the label unless
  Jev's confidence is below `abstain-below`, when the field abstains but keeps `:raw-label`, `:score` and
  `:probabilities`. A missing answer or an unknown category drops the field."
  [fields  :- [:sequential ::context/field]
   answers :- [:maybe [:map-of :string [:map {::mr/deliberately-open true}]]]
   {:keys [abstain-below semantic-min]} :- [:map {:closed true}
                                            [:abstain-below number?]
                                            [:semantic-min  number?]]]
  (let [counts  (volatile! (zero-counts))
        count!  (fn [k] (vswap! counts update k inc))
        entries (into {}
                      (map-indexed
                       (fn [i {:keys [name]}]
                         (let [{:strs [choice confidence probabilities] :as s} (get answers (str "s" i))]
                           [name
                            (cond
                              (nil? s)                          (do (count! :dropped-missing) dropped)
                              (not (contains? category-set choice)) (do (count! :dropped-invalid) dropped)
                              :else
                              (let [abstain?      (< (double (or confidence 0)) abstain-below)
                                    probabilities (update-vals (or probabilities {}) round4)]
                                {:data-sensitivity (when-not abstain? (keyword choice))
                                 :confidence       (confidence-bucket confidence)
                                 :semantic-type    (semantic-answer (get answers (str "t" i)) semantic-min count!)
                                 :reasoning        (reasoning probabilities choice)
                                 :status           (if abstain? :abstain :labeled)
                                 :probabilities    probabilities
                                 :raw-label        (keyword choice)
                                 :score            (some-> confidence round4)}))])))
                      fields)]
    {:fields entries
     :counts @counts}))

;;; Classify

(defn- max-tokens-exceeded? [e]
  (= :max-tokens-exceeded (:error-code (ex-data e))))

(defn- call
  "One request over `fields`, parsed. `build` turns the fields into the request body."
  [api-key build fields opts]
  (let [{:keys [body request-ms retries]} (request! api-key (build fields) opts)]
    (assoc (parse-answers fields (get body "answers") (select-keys opts [:abstain-below :semantic-min]))
           :model      (get body "model")
           :requests   1
           :usage      {:input_tokens  (get-in body ["usage" "input_tokens"] 0)
                        :output_tokens (get-in body ["usage" "output_tokens"] 0)}
           :request-ms request-ms
           :retries    retries)))

(defn- oversize-drop [fields]
  {:fields   (into {} (map (fn [{:keys [name]}] [name dropped])) fields)
   :counts   (assoc (zero-counts) :dropped-oversize (count fields))
   :requests 0
   :usage    {:input_tokens 0 :output_tokens 0}})

(defn- call-splitting
  "[[call]] over `fields`, halving the request and retrying each half while Jev reports it over the token limit. A
  single field that is still too large is dropped."
  [api-key build fields opts]
  (try
    [(call api-key build fields opts)]
    (catch clojure.lang.ExceptionInfo e
      (cond
        (not (max-tokens-exceeded? e)) (throw e)
        (= 1 (count fields))           [(oversize-drop fields)]
        :else                          (let [[a b] (split-at (quot (count fields) 2) fields)]
                                         (log/debugf "Jev request over the token limit, splitting %d fields" (count fields))
                                         (into (call-splitting api-key build a opts)
                                               (call-splitting api-key build b opts)))))))

(defn- table-calls [api-key packet {:keys [chunk-size] :as opts}]
  (into []
        (mapcat #(call-splitting api-key (fn [fields] (table-request packet fields opts)) % opts))
        (partition-all chunk-size (:fields packet))))

(defn- field-calls
  "One request per field, at most `field-parallelism` in flight. The first failure is rethrown."
  [api-key packet {:keys [field-parallelism] :as opts}]
  (let [executor (Executors/newFixedThreadPool field-parallelism)]
    (try
      (let [futures (mapv (fn [field]
                            (.submit executor
                                     ^Callable (bound-fn*
                                                #(call-splitting api-key
                                                                 (fn [[f]] (field-request packet f opts))
                                                                 [field]
                                                                 opts))))
                          (:fields packet))]
        (into [] (mapcat (fn [^Future fut]
                           (try
                             (.get fut)
                             (catch ExecutionException e
                               (throw (or (.getCause e) e))))))
              futures))
      (finally
        (.shutdownNow executor)))))

(defn- sum [k calls]
  (reduce (partial merge-with +) {} (map k calls)))

(mu/defn classify-packet :- ::llm/classification
  "Classify every field of `packet` with Jev. Options are [[::options]] over [[default-options]]. Besides the
  [[llm/classify-packet]] keys, the result carries `:retries` and `:request-ms` (every attempt's latency). A packet
  with no fields makes no request. Throws `:api-key-missing` when no key is set."
  [packet :- ::context/packet
   & {:as opts} :- [:maybe ::options]]
  (let [opts    (merge default-options (into {} (remove (comp nil? val)) opts))
        api-key (ds.settings/data-sensitivity-jev-api-key)]
    (when (str/blank? api-key)
      (throw (ex-info (tru "No TypeSafe Jev API key is configured.") {:error-code :api-key-missing})))
    (.setRate rate-limiter (double (:max-rps opts)))
    (let [calls  (if (empty? (:fields packet))
                   []
                   (case (:request-shape opts)
                     :table (table-calls api-key packet opts)
                     :field (field-calls api-key packet opts)))
          usage  (merge {:input_tokens 0 :output_tokens 0} (sum :usage calls))]
      {:model      (str "typesafe/" (or (some :model calls) (:model opts)))
       :requests   (transduce (map :requests) + 0 calls)
       :usage      (assoc usage
                          :cache_read_tokens     0
                          :cache_creation_tokens 0
                          :total_tokens          (+ (:input_tokens usage) (:output_tokens usage)))
       :fields     (into {} (map :fields) calls)
       :counts     (merge (zero-counts) (sum :counts calls))
       :retries    (transduce (map #(:retries % 0)) + 0 calls)
       :request-ms (into [] (mapcat :request-ms) calls)})))
