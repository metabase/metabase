(ns metabase-enterprise.transforms-verification.api.util
  "Shared HTTP contract for transform test-run endpoints: multipart parsing,
  response shaping, the error→HTTP-status mapping, and the response schemas."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def test-run-error-http-status
  "Maps `:error-type` keywords to HTTP status codes.

  400 — caller error (bad input): the caller can fix by changing the request.
  422 — unprocessable: the transform or its environment prevents a test run;
        the caller may need to change the transform definition.
  500 — internal error: unexpected failure; the caller cannot fix this.

  An `:error-type` missing from this map, and any untyped exception (a
  statement timeout, say), surfaces as a generic 500."
  {;; Fixture errors — 400: caller supplied wrong CSV content.
   ::errors/header-mismatch             400
   ::errors/unparseable-cell            400
   ::errors/ragged-row                  400
   ::errors/empty-target-schema         422
   ;; Diff errors — 400: caller supplied bad options.
   ::errors/unknown-ignore-columns      400
   ;; Canonicalization — 422: a fixture or output value we cannot compare.
   ::errors/cannot-canonicalize         422
   ;; Input resolution errors — 400 or 422.
   ::errors/missing-fixtures            400
   ::errors/unknown-fixture-keys        400
   ::errors/unsupported-transform-type  422
   ::errors/cannot-determine-inputs     422
   ::errors/table-not-found             422
   ::errors/transform-dep-not-supported 422
   ;; Resolve errors — 422.
   ::errors/cannot-test-run             422
   ;; Execution errors — 500.
   ::errors/seed-failed                 500
   ::errors/pre-execution-guard-failed  500
   ::errors/execution-failed            500
   ;; Chained (sub-graph) test-run errors.
   ::errors/sources-not-ancestors       400
   ::errors/cycle                       422
   ::errors/cross-database-subgraph     422
   ::errors/target-not-found            422
   ::errors/missing-database-id         422
   ;; Assertion errors. assertion-execution-failed is a per-assertion internal
   ;; state in the response body; mapped only for the run-level throw case.
   ::errors/assertion-execution-failed  500
   ;; assertions-parse-error fires at request-parse time (malformed JSON / missing fields).
   ::errors/assertions-parse-error      400})

(defn- throw-400!
  "Throw an untyped 400 `ex-info` carrying `message` and `ex-data`."
  [message ex-data]
  (throw (ex-info message (merge {:status-code 400} ex-data))))

(defn- check!
  "[[throw-400!]] with `message` and `ex-data` unless `ok?`."
  [ok? message ex-data]
  (when-not ok?
    (throw-400! message ex-data)))

(defn- part->json
  "Slurp a multipart part (a ring multipart map, a `java.io.File`, or a string)
  and decode it as JSON with `decode-fn`. On invalid JSON throws a 400 carrying
  `error-msg`, the raw text, and `extra-ex-data`."
  [part decode-fn error-msg extra-ex-data]
  (let [raw  (if (map? part) (:tempfile part) part)
        text (if (instance? java.io.File raw) (slurp raw) (str raw))]
    (try
      (decode-fn text)
      (catch Exception _
        (throw-400! error-msg (merge {:raw-text text} extra-ex-data))))))

(defn parse-source-ids
  "Parse the `sources` multipart part — a JSON array of selected source transform
  ids — into a set of positive integers. Missing part → `#{}` (a target-only
  selection — the degenerate case equivalent to a single-transform test run).
  Throws 400 on malformed JSON or a non-positive-int element."
  [sources-part]
  (let [validate-ids! (fn [ids]
                        (check! (and (sequential? ids) (every? pos-int? ids))
                                (tru "''sources'' must be a JSON array of positive transform ids.")
                                {:sources ids}))]
    (if (nil? sources-part)
      #{}
      (let [ids (part->json sources-part json/decode
                            (tru "Malformed ''sources'' part: not valid JSON.") nil)]
        (validate-ids! ids)
        (set ids)))))

(defn- ->parse-kv*
  [reserved]
  (fn parse-kv [acc k v]
    (let [validate-table-id!
          (fn [table-id]
            (check! (and table-id (pos? table-id))
                    (tru "Malformed multipart part name: ''{0}''. Table id must be a positive integer." k)
                    {:part-name k}))
          validate-tempfile!
          (fn [tempfile]
            ;; A plain form field has no :tempfile; letting nil through NPEs at CSV-read time.
            (check! (some? tempfile)
                    (tru "Multipart part ''{0}'' must be a file upload." k)
                    {:part-name k}))]
      (cond
        ;; Reserved keys handled separately — skip.
        (contains? reserved k)
        acc

        :else
        (if-let [[_ id-str] (re-matches #"input-(\d+)" k)]
          (let [table-id (parse-long id-str)
                tempfile (when (map? v) (:tempfile v))]
            (validate-table-id! table-id)
            (validate-tempfile! tempfile)
            (assoc acc table-id tempfile))
          ;; Anything else is unknown.
          (throw-400! (tru "Unknown multipart part: ''{0}''. Expected: ''expected'', ''options'', ''sources'', ''assertions'', or ''input-<table-id>''." k)
                      {:part-name k}))))))

(defn parse-input-table-ids
  "Extract input fixture files from the multipart params.

  Returns `{table-id File}` for every `input-<table-id>` part. Reserved parts
  (`expected`, `options`, plus any `extra-reserved`) are skipped; anything else
  throws a 400 naming the offending part."
  [multipart-params extra-reserved]
  (let [reserved (into #{"expected" "options"} extra-reserved)
        parse-kv (->parse-kv* reserved)]
    (reduce-kv parse-kv {} multipart-params)))

(defn parse-test-run-options
  "Parse the optional `options` JSON multipart part.

  Returns a map with:
  - `:ignore-columns` — set of column name strings (default `#{}`).
  - `:isolation-id`   — database-isolation handle the run executes inside (optional).

  Throws 400 on malformed JSON, unknown keys, or a non-positive-int isolation_id."
  [options-part]
  (let [validate-keys! (fn [opts]
                         (when-let [unknown (seq (remove #{:ignore_columns :isolation_id} (keys opts)))]
                           (throw-400! (tru "Unknown option keys: {0}. Supported: ignore_columns, isolation_id." (pr-str unknown))
                                       {:unknown-keys unknown})))
        validate-isolation-id! (fn [v]
                                 (when-not (pos-int? v)
                                   (throw-400! (tru "Option ''isolation_id'' must be a positive integer.")
                                               {:isolation-id v})))]
    (if (nil? options-part)
      {}
      (let [opts (part->json options-part json/decode+kw
                             (tru "Malformed ''options'' part: not valid JSON.") nil)]
        (validate-keys! opts)
        (cond-> {}
          (:ignore_columns opts)
          (assoc :ignore-columns (set (:ignore_columns opts)))

          (contains? opts :isolation_id)
          (assoc :isolation-id (doto (:isolation_id opts) validate-isolation-id!)))))))

(defn- parse-assertion-entry
  [entry]
  (let [nonblank-string? (fn [x]
                           (and (string? x) (not (str/blank? x))))
        validate-name!
        (fn [n]
          (when-not (nonblank-string? n)
            (throw (errors/ex ::errors/assertions-parse-error
                              (tru "Each assertion must have a non-empty ''name'' string.")
                              {:status-code 400
                               :entry       entry}))))
        validate-sql!
        (fn [s]
          (when-not (nonblank-string? s)
            (throw (errors/ex ::errors/assertions-parse-error
                              (tru "Each assertion must have a non-empty ''sql'' string.")
                              {:status-code 400
                               :entry       entry}))))
        validate-severity!
        (fn [sev]
          (when-not (#{"error" "warn"} sev)
            (throw (errors/ex ::errors/assertions-parse-error
                              (tru "Assertion severity must be ''error'' or ''warn''; got: {0}" (pr-str sev))
                              {:status-code 400
                               :severity    sev}))))
        n   (get entry "name")
        s   (get entry "sql")
        sev (get entry "severity" "error")]
    (validate-name! n)
    (validate-sql! s)
    (validate-severity! sev)
    {:name     n
     :sql      s
     :severity (keyword sev)}))

(defn parse-assertions
  "Parse the `assertions` JSON multipart part.

  Returns a vector of assertion maps:
  `[{:name <string> :sql <string> :severity :error|:warn} ...]`

  Missing part → `[]`. Throws 400 on malformed JSON, missing required fields
  (name, sql), unknown severity, or duplicate names (counts and results are
  keyed by name downstream)."
  [assertions-part]
  (let [validate-array!
        (fn [data]
          (when-not (sequential? data)
            (throw (errors/ex ::errors/assertions-parse-error
                              (tru "''assertions'' must be a JSON array.")
                              {:status-code 400}))))
        validate-unique-names!
        (fn [parsed]
          (let [dupes (->> (map :name parsed)
                           frequencies
                           (keep (fn [[n cnt]] (when (> cnt 1) n)))
                           sort)]
            (when (seq dupes)
              (throw (errors/ex ::errors/assertions-parse-error
                                (tru "Duplicate assertion name(s): {0}. Assertion names must be unique."
                                     (str/join ", " dupes))
                                {:status-code     400
                                 :duplicate-names (vec dupes)})))))]
    (if (nil? assertions-part)
      []
      (let [data (part->json assertions-part json/decode
                             (tru "Malformed ''assertions'' part: not valid JSON.")
                             {:error-type ::errors/assertions-parse-error})]
        (validate-array! data)
        (let [parsed (mapv parse-assertion-entry data)]
          (validate-unique-names! parsed)
          parsed)))))

(defn run-record->response
  "Convert a successful run-record (from `run-chain-test!` / `run-card-chain-test!`)
  to the HTTP response body.

  Status keywords are converted to strings (`\"passed\"` / `\"failed\"`) for JSON
  serialisation. `:assertions` is included when assertions were run; nil otherwise."
  [record]
  {:status     (name (:status record))
   :diff       (:diff record)
   :assertions (when-let [results (:assertions record)]
                 ;; Convert per-assertion :status keywords to strings for JSON.
                 (mapv (fn [r] (update r :status name)) results))})

(defn error->response
  "Convert a typed ex-info from the test-run pipeline to a run-record shaped
  error response body.

  Carries the human-readable text at the top level as `:message` (in addition to
  the structured `:error` map) so generic API clients — which look for a top-level
  message and don't know our envelope shape — surface the real reason instead of a
  bare status code."
  [e]
  (let [data (ex-data e)]
    {:status  "error"
     :message (ex-message e)
     :error   {:type    (pr-str (:error-type data))
               :message (ex-message e)}}))

(def TestRunResponse
  "Malli schema for the test-run HTTP response body.

  Covers two shapes, left open since each carries keys absent from the other:
  - passed/failed: {:status \"passed\"|\"failed\", :diff <report>|nil, :assertions [...]|nil}
  - error:         {:status \"error\", :message <string>, :error {:type <string>, :message <string>}}"
  [:map {:closed false}
   [:status     [:enum "passed" "failed" "error"]]
   [:diff       {:optional true} [:maybe :map]]
   [:assertions {:optional true} [:maybe [:sequential :any]]]
   [:message    {:optional true} :string]
   [:error      {:optional true} [:map
                                  [:type :string]
                                  [:message :string]]]])

(def InputTableResponse
  "Malli schema for a single entry in the inputs response.

  `:table_id` — app-DB Table id (integer); the key to use in `input-<table-id>` multipart parts.
  `:schema`   — DB schema string (e.g. \"public\"), or nil on engines without schemas.
  `:name`     — physical table name string (e.g. \"orders\").
  `:columns`  — ordered list of column name strings the fixture CSV header must contain."
  [:map {:closed true}
   [:table_id pos-int?]
   [:schema   [:maybe :string]]
   [:name     :string]
   [:columns  [:sequential :string]]])

(defn input-table->response
  "Shape a resolved input table-info `{:id :schema :name :columns}` into an
  `InputTableResponse` map."
  [t]
  {:table_id (:id t)
   :schema   (:schema t)
   :name     (:name t)
   :columns  (mapv :name (:columns t))})
