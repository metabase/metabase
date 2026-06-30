(ns metabase.transforms-rest.api.util
  "Shared HTTP contract for transform test-run endpoints: multipart parsing,
  response shaping, the error→HTTP-status mapping, and the response schemas.

  Consumed by both the transform-target endpoints
  ([[metabase.transforms-rest.api.transform]]) and the generalized chained
  endpoints ([[metabase.transforms-rest.api.transform-test-run]])."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(def test-run-error-http-status
  "Maps `:error-type` keywords from the test-run pipeline to HTTP status codes.

  400 — caller error (bad input): the caller can fix by changing the request.
  422 — unprocessable: the transform or its environment prevents a test run;
        the caller may need to change the transform definition.
  500 — internal error: unexpected failure; the caller cannot fix this.

  Any unrecognised `:error-type` is re-thrown (→ 500 from the framework). A
  statement timeout throws an untyped exception (no `:error-type`), so it is not
  in this map and currently surfaces as a generic 500."
  {;; Fixture errors — 400: caller supplied wrong CSV content.
   :metabase.transforms.test-run.fixtures/header-mismatch        400
   :metabase.transforms.test-run.fixtures/unparseable-cell        400
   ;; Diff errors — 400: caller supplied bad options.
   :metabase.transforms.test-run.diff/unknown-ignore-columns      400
   :metabase.transforms.test-run.diff/unsupported-option          400
   ;; Input resolution errors — 400 or 422.
   :metabase.transforms.test-run.inputs/missing-fixtures          400
   :metabase.transforms.test-run.inputs/unknown-fixture-keys      400
   :metabase.transforms.test-run.inputs/unsupported-transform-type 422
   :metabase.transforms.test-run.inputs/cannot-determine-inputs   422
   :metabase.transforms.test-run.inputs/table-not-found           422
   :metabase.transforms.test-run.inputs/transform-dep-not-supported 422
   ;; Resolve errors — 422.
   :metabase.transforms.test-run.resolve/cannot-test-run          422
   :metabase.transforms.test-run.resolve/unsupported-transform-type 422
   ;; Execution errors — 500.
   :metabase.transforms.test-run.scratch/seed-failed              500
   :metabase.transforms.test-run.execute/pre-execution-guard-failed 500
   :metabase.transforms.test-run.execute/execution-failed         500
   ;; Chained (sub-graph) test-run errors.
   :metabase.transforms.test-run.subgraph/sources-not-ancestors   400
   :metabase.transforms.test-run.subgraph/cycle                   422
   :metabase.transforms.test-run.chain/cross-database-subgraph    422
   :metabase.transforms.test-run.chain/target-not-found           422
   :metabase.transforms.test-run.chain/missing-database-id        422
   ;; Assertion-specific errors.
   ;; ::assertion-rewrite-failed and ::assertion-execution-failed are per-assertion
   ;; internal states captured in the response body, not HTTP-level errors; they are
   ;; mapped here only for the case where one is thrown at the run level.
   :metabase.transforms.test-run.assertions/assertion-execution-failed  500
   :metabase.transforms.test-run.assertions/assertion-rewrite-failed    422
   ;; assertions-parse-error fires at request-parse time (malformed JSON / missing fields).
   :metabase.transforms-rest.api.util/assertions-parse-error             400})

(defn parse-input-table-ids
  "Extract input fixture files from the multipart params.

  Returns `{table-id File}` for every `input-<table-id>` part. Reserved parts
  (`expected`, `options`, plus any `extra-reserved`) are skipped; anything else
  throws a 400 naming the offending part."
  [multipart-params extra-reserved]
  (let [reserved (into #{"expected" "options"} extra-reserved)]
    (reduce-kv
     (fn [acc k v]
       (cond
         ;; Reserved keys handled separately — skip.
         (contains? reserved k)
         acc

         ;; input-<positive-int> pattern.
         (re-matches #"input-(\d+)" k)
         (let [[_ id-str] (re-matches #"input-(\d+)" k)
               table-id   (parse-long id-str)]
           (if (and table-id (pos? table-id))
             (assoc acc table-id (:tempfile v))
             (throw (ex-info (tru "Malformed multipart part name: ''{0}''. Table id must be a positive integer." k)
                             {:status-code 400
                              :part-name   k}))))

         ;; Anything else is unknown.
         :else
         (throw (ex-info (tru "Unknown multipart part: ''{0}''. Expected: ''expected'', ''options'', ''sources'', or ''input-<table-id>''." k)
                         {:status-code 400
                          :part-name   k}))))
     {}
     multipart-params)))

(defn parse-test-run-options
  "Parse the optional `options` JSON multipart part.

  Returns a map with:
  - `:ignore-columns` — set of column name strings (default `#{}`).

  Throws 400 on malformed JSON or unknown keys."
  [options-part]
  (if (nil? options-part)
    {}
    (let [raw  (if (map? options-part) (:tempfile options-part) options-part)
          text (if (instance? java.io.File raw) (slurp raw) (str raw))
          opts (try
                 (json/decode text true)
                 (catch Exception _
                   (throw (ex-info (tru "Malformed ''options'' part: not valid JSON.")
                                   {:status-code 400
                                    :raw-text    text}))))]
      (when-let [unknown (seq (remove #{:ignore_columns} (keys opts)))]
        (throw (ex-info (tru "Unknown option keys: {0}. Supported: ignore_columns." (pr-str unknown))
                        {:status-code 400
                         :unknown-keys unknown})))
      (cond-> {}
        (:ignore_columns opts)
        (assoc :ignore-columns (set (:ignore_columns opts)))))))

(defn parse-assertions
  "Parse the `assertions` JSON multipart part.

  Returns a vector of assertion maps:
  `[{:name <string> :sql <string> :severity :error|:warn} ...]`

  Missing part → `[]`. Throws 400 on malformed JSON, missing required fields
  (name, sql), or unknown severity."
  [assertions-part]
  (if (nil? assertions-part)
    []
    (let [raw  (if (map? assertions-part) (:tempfile assertions-part) assertions-part)
          text (if (instance? java.io.File raw) (slurp raw) (str raw))
          data (try
                 (json/decode text)
                 (catch Exception _
                   (throw (ex-info (tru "Malformed ''assertions'' part: not valid JSON.")
                                   {:status-code 400
                                    :error-type  ::assertions-parse-error
                                    :raw-text    text}))))]
      (when-not (sequential? data)
        (throw (ex-info (tru "''assertions'' must be a JSON array.")
                        {:status-code 400
                         :error-type  ::assertions-parse-error})))
      (mapv (fn [entry]
              (let [n   (get entry "name")
                    s   (get entry "sql")
                    sev (get entry "severity" "error")]
                (when (or (nil? n) (not (string? n)) (str/blank? n))
                  (throw (ex-info (tru "Each assertion must have a non-empty ''name'' string.")
                                  {:status-code 400
                                   :error-type  ::assertions-parse-error
                                   :entry       entry})))
                (when (or (nil? s) (not (string? s)) (str/blank? s))
                  (throw (ex-info (tru "Each assertion must have a non-empty ''sql'' string.")
                                  {:status-code 400
                                   :error-type  ::assertions-parse-error
                                   :entry       entry})))
                (when-not (#{"error" "warn"} sev)
                  (throw (ex-info (tru "Assertion severity must be ''error'' or ''warn''; got: {0}" (pr-str sev))
                                  {:status-code 400
                                   :error-type  ::assertions-parse-error
                                   :severity    sev})))
                {:name     n
                 :sql      s
                 :severity (keyword sev)}))
            data))))

(defn run-record->response
  "Convert a successful run-record (from `run-chain-test!` / `run-card-chain-test!`)
  to the HTTP response body.

  Status keywords are converted to strings (`\"passed\"` / `\"failed\"`) for JSON
  serialisation. `:test_run_id` is nil (reserved for a future async polling variant).
  `:assertions` is included when assertions were run; nil otherwise."
  [record]
  {:status       (name (:status record))
   :diff         (:diff record)
   :assertions   (when-let [results (:assertions record)]
                   ;; Convert per-assertion :status keywords to strings for JSON.
                   (mapv (fn [r] (update r :status name)) results))
   :test_run_id  nil})

(defn error->response
  "Convert a typed ex-info from the test-run pipeline to a run-record shaped
  error response body.

  Carries the human-readable text at the top level as `:message` (in addition to
  the structured `:error` map) so generic API clients — which look for a top-level
  message and don't know our envelope shape — surface the real reason instead of a
  bare status code."
  [e]
  (let [data (ex-data e)]
    {:status      "error"
     :message     (ex-message e)
     :error       {:type    (pr-str (:error-type data))
                   :message (ex-message e)}
     :test_run_id nil}))

(def TestRunResponse
  "Malli schema for the test-run HTTP response body.

  Covers three shapes:
  - passed/failed: {:status \"passed\"|\"failed\", :diff <report>, :assertions [...], :test_run_id nil}
  - error:         {:status \"error\",             :error <map>,   :test_run_id nil}"
  [:map {:closed false}
   [:status      [:enum "passed" "failed" "error"]]
   [:test_run_id [:maybe pos-int?]]
   [:assertions  {:optional true} [:maybe [:sequential :any]]]])

(def InputTableResponse
  "Malli schema for a single entry in the inputs response.

  `:table_id` — app-DB Table id (integer); the key to use in `input-<table-id>` multipart parts.
  `:schema`   — DB schema string (e.g. \"public\").
  `:name`     — physical table name string (e.g. \"orders\").
  `:columns`  — ordered list of column name strings the fixture CSV header must contain."
  [:map {:closed true}
   [:table_id pos-int?]
   [:schema   :string]
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
