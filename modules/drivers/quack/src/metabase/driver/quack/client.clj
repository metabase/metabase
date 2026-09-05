(ns metabase.driver.quack.client
  "Quack client: HTTP transport + connect → prepare → fetch → disconnect state
  machine, with a pooled server-side connection_id per endpoint.

  Quack is plain HTTP server-side (TLS is meant for a reverse proxy), but the
  client speaks HTTPS when ``:ssl`` is set in the conn-spec. The HTTP transport
  is a shared ``java.net.http.HttpClient`` per (ssl-config) tuple so TCP/TLS
  connections are reused across requests (HTTP keep-alive) — the Quack overview
  and DuckDB *Tuning Workloads* guide both call out connection reuse as the
  main per-query latency win.

  On top of the HTTP layer, server-side ``connection_id``\\ s are pooled per
  endpoint (host/port/ssl/token) via ``quack.pool``. A steady Metabase workload
  reuses a handful of connections instead of paying a ``CONNECTION_REQUEST``
  round-trip per query. Pooled connections also persist any ``:session-sql``
  SET statements (``threads``, ``memory_limit``, ``temp_directory``, ...), which
  the connection-per-request model could not.

  The Quack ``client_query_id`` is set on every request from a monotonic atom,
  so a client request and its server-side handling can be joined in the Quack
  log on ``(quack_connection_id, client_query_id)`` (see the Quack Reference).

  Conn-spec keys understood here (in addition to ``:host :port :ssl :token``):

  * ``:timeout-seconds``       per-request HTTP timeout (default 60).
  * ``:session-sql``           string (semicolon-separated) or seq of SQL
                                statements run once on each NEW pooled connection.
  * ``:trust-store``           JKS path for HTTPS server-cert validation.
  * ``:trust-store-password``  password for that trust store.
  * ``:insecure-tls``          boolean — trust-all (dev/test only; logged loudly).
  * ``::no-pool?``             internal — when true, bypass the connection pool
                                (set on conn-specs resolved through an SSH tunnel,
                                where the local forward port is ephemeral)."
  (:require
   [clojure.string :as str]
   [metabase.driver.quack.pool :as pool]
   [metabase.driver.quack.types :as types]
   [metabase.driver.quack.wire :as wire]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [get-in mapv select-keys]])
  (:import [java.io FileInputStream]
           [java.net URI]
           [java.net.http HttpClient HttpClient$Version HttpRequest HttpRequest$BodyPublishers
            HttpResponse HttpResponse$BodyHandlers]
           [java.security KeyStore SecureRandom]
           [java.time Duration]
           [javax.net.ssl SSLContext TrustManager X509TrustManager TrustManagerFactory]))

(set! *warn-on-reflection* true)

;; Forward declarations — see "Public query API" + transaction sections below.
(declare reducible-rows prepare run-prepared!)

(def ^:private default-port 9494)
(def ^:private default-timeout-seconds 60)

;; Monotonic client_query_id (MessageHeader field 3). The Quack reference doc
;; says it "correlates client / server logs" — one id per request message.
(def ^:private query-id-counter (atom 0))
(defn- next-query-id [] (swap! query-id-counter inc))

;;; ---------------------------------------------------------------------------
;;; HTTP transport (java.net.http.HttpClient — keep-alive + pooled TLS sessions)
;;; ---------------------------------------------------------------------------
;; HttpClient is designed to be shared: it owns a connection pool and reuses
;; TCP/TLS sessions across requests to the same host:port. We cache one client
;; per (ssl-config) tuple so HTTPS endpoints with different trust stores don't
;; share an SSLContext.

(defn- url ^String [{:keys [host port ssl]}]
  (format "%s://%s:%d/quack" (if ssl "https" "http")
          host (int (or port default-port))))

(defn- ^"[Ljavax.net.ssl.TrustManager;" trust-all-managers
  "A TrustManager array that trusts every certificate. ONLY for :insecure-tls
  (dev/test). Always logged at WARN when installed."
  []
  (into-array TrustManager
              [(reify X509TrustManager
                 (getAcceptedIssuers [_] (make-array java.security.cert.X509Certificate 0))
                 (checkClientTrusted [_ _ _])
                 (checkServerTrusted [_ _ _]))]))

(defn- build-ssl-context
  "Build an SSLContext per the conn-spec's TLS settings.
  * ``:insecure-tls``        → trust-all (logged).
  * ``:trust-store`` (JKS)   → load + use the default TrustManagerFactory over it.
  * otherwise                → the JVM default SSLContext (uses JDK cacerts)."
  ^SSLContext [conn-spec]
  (cond
    (:insecure-tls conn-spec)
    (do (log/warn "Quack :insecure-tls is enabled — TLS certificate validation "
                  "is SKIPPED for" (url conn-spec) ". Use ONLY for local testing.")
        (doto (SSLContext/getInstance "TLS")
          (.init nil (trust-all-managers) (SecureRandom.))))

    (:trust-store conn-spec)
    (let [ks (KeyStore/getInstance (KeyStore/getDefaultType))
          ^String pwd-str (:trust-store-password conn-spec)
          pwd (when pwd-str (.toCharArray pwd-str))]
      (with-open [fis (FileInputStream. ^String (:trust-store conn-spec))]
        (.load ks fis pwd))
      (let [tmf (TrustManagerFactory/getInstance (TrustManagerFactory/getDefaultAlgorithm))]
        (.init tmf ks)
        (doto (SSLContext/getInstance "TLS")
          (.init nil (.getTrustManagers tmf) (SecureRandom.)))))

    :else (SSLContext/getDefault)))

(defn- http-client-key
  "Cache key for HttpClient. Endpoints with the same TLS config + proxy share
  one client (and thus one connection pool)."
  [conn-spec]
  (select-keys conn-spec [:ssl :trust-store :trust-store-password :insecure-tls]))

(def ^:private http-clients (atom {}))

(defn- http-client
  "Get-or-create a shared HttpClient for the conn-spec's TLS config."
  ^HttpClient [conn-spec]
  (let [k (http-client-key conn-spec)]
    (or (get @http-clients k)
        (let [builder (.. (HttpClient/newBuilder)
                          (version HttpClient$Version/HTTP_1_1)
                          ;; No connect-timeout: the per-request timeout on
                          ;; HttpRequest covers the whole call; HttpClient's
                          ;; own keep-alive pool manages idle sockets.
                          )]
          (when (:ssl conn-spec)
            (.sslContext builder (build-ssl-context conn-spec)))
          (let [client (.build builder)]
            (swap! http-clients assoc k client)   ; race-tolerant; last wins
            client)))))

(defn- http-post
  "POST `body` to /quack on the shared HttpClient; return response bytes.
  Throws an ex-info on non-200. Idempotent wrt connection reuse: HttpClient
  pools the underlying TCP/TLS connection automatically."
  ^bytes [^bytes body conn-spec]
  (let [timeout-seconds (long (or (:timeout-seconds conn-spec) default-timeout-seconds))
        ^HttpClient client (http-client conn-spec)
        ^java.net.URI uri (URI/create (url conn-spec))
        ^Duration timeout (Duration/ofSeconds timeout-seconds)
        ^HttpRequest$BodyPublishers publisher (HttpRequest$BodyPublishers/ofByteArray body)
        request (-> (HttpRequest/newBuilder uri)
                    (.timeout timeout)
                    (.header "Content-Type" "application/duckdb")
                    (.POST publisher)
                    (.build))
        ^HttpResponse response (.send client request (HttpResponse$BodyHandlers/ofByteArray))
        status (.statusCode response)]
    (if (= 200 status)
      (.body response)
      ;; httplib puts the exception text in the EXCEPTION_WHAT header
      (let [what (-> (.headers response)
                     (.firstValue "EXCEPTION_WHAT")
                     (.orElse nil))]
        (throw (ex-info (str "Quack HTTP " status ": " what)
                        {:type ::http-error :status status :what what}))))))

;;; ---------------------------------------------------------------------------
;;; Connect / prepare / fetch / disconnect — the protocol primitives
;;; ---------------------------------------------------------------------------

(defn connect!
  "CONNECT_REQUEST → connection id (throws on auth/connection failure).
  Does NOT run ``:session-sql`` (that runs once per pooled connection via
  [[connect-and-setup!]]); use this for one-off probes like ``can-connect?``."
  [details]
  (let [resp (-> (wire/connection-request
                  {:token (:token details)
                   :client-version "metabase-quack-driver"
                   :platform "metabase"}
                  (next-query-id))
                 (http-post details)
                 wire/decode-response)]
    (cond
      (wire/error? resp)            (throw (ex-info (str "Quack connection failed: "
                                                         (get-in resp [:body :message]))
                                                    {:type ::connect-failed}))
      (-> resp :header :type (= :connection-response))
      (get-in resp [:header :connection-id])
      :else (throw (ex-info "Unexpected connect response" {:resp resp})))))

(defn disconnect!
  "DISCONNECT the given connection. Best-effort; swallows errors (e.g. server gone)."
  [details connection-id]
  (try (-> (wire/disconnect-request connection-id (next-query-id))
           (http-post details))
       (catch Throwable _ nil)))

(defn- ->session-statements
  "Coerce :session-sql (string | seq | nil) → a list of non-blank SQL strings.
  Statements are split on `;` and trimmed; blanks are dropped, so trailing
  semicolons / whitespace are harmless."
  ^java.util.List [session-sql]
  (cond
    (nil? session-sql)       ()
    (string? session-sql)    (remove str/blank? (map str/trim (str/split session-sql #";")))
    (seqable? session-sql)   (remove str/blank? (map str/trim session-sql))
    :else                    (throw (ex-info ":session-sql must be a string or seq of SQL"
                                             {:session-sql session-sql}))))

(defn- setup-session!
  "Run each statement in ``:session-sql`` on `connection-id`. Used when a fresh
  pooled connection is created, so workload-tuning SETs (threads, memory_limit,
  temp_directory, preserve_insertion_order, ...) stick for the connection's
  lifetime — the documented way to apply DuckDB session settings over Quack,
  since each pooled conn is a real DuckDB session."
  [details connection-id]
  (doseq [stmt (->session-statements (:session-sql details))]
    (run-prepared! details connection-id stmt)))

(defn connect-and-setup!
  "Connect + apply :session-sql. The pool's :connect! fn; also used directly on
  the non-pooled (SSH-tunnel) path."
  [details]
  (doto (connect! details)
    (->> (setup-session! details))))

(defn- run-prepared!
  "Send one SQL string on `connection-id` and fully consume the (usually empty)
  result. Used for session SET statements and the BEGIN/COMMIT/ROLLBACK control
  statements inside [[with-transaction]]. Returns `{:cols […] :rows […]}`."
  [details connection-id sql]
  (let [first-batch (prepare details connection-id sql)
        rows        (into [] (reducible-rows details connection-id first-batch nil nil))]
    {:cols (:cols first-batch) :rows rows}))

(defn- prepare
  "PREPARE_REQUEST → first batch of rows. Returns
  {:cols [...] :rows [...] :needs-more-fetch bool :result-uuid [u l]}."
  ([details connection-id sql] (prepare details connection-id sql (next-query-id)))
  ([details connection-id sql query-id]
   (let [resp (-> (wire/prepare-request connection-id sql query-id)
                  (http-post details)
                  wire/decode-response)]
     (if (wire/error? resp)
       (throw (ex-info (str "Quack prepare failed: " (get-in resp [:body :message]))
                       {:type ::query-error :sql sql}))
       (let [body (:body resp)]
         {:cols             (mapv (fn [col-name lt]
                                    {:name col-name
                                     :database-type (name (:name lt))
                                     :base-type (types/->base-type lt)})
                                  (:result-names body) (:result-types body))
          :rows             (types/chunks->rows body)
          :needs-more-fetch (:needs-more-fetch body)
          :result-uuid      (:result-uuid body)})))))

(defn- fetch
  "FETCH_REQUEST → rows. Returns {:rows [...] :more? bool} (more? = had rows).
  Shares the PREPARE's query-id so the whole result stream is log-correlatable."
  [details connection-id result-uuid query-id]
  (let [resp (-> (wire/fetch-request connection-id result-uuid query-id)
                 (http-post details)
                 wire/decode-response)]
    (if (wire/error? resp)
      (let [server-message (get-in resp [:body :message])]
        (throw (ex-info (str "Quack fetch failed: " server-message)
                        {:type           ::query-error
                         :server-message server-message
                         :connection-id  connection-id
                         :result-uuid    result-uuid
                         :query-id       query-id})))
      {:rows  (types/chunks->rows (:body resp))
       :more? (pos? (reduce + 0 (map :rows (get-in resp [:body :chunks]))))})))

;;; ---------------------------------------------------------------------------
;;; Connection pool (per-endpoint connection_id reuse)
;;; ---------------------------------------------------------------------------
;; A global pool wired with our connect/disconnect. Conn-specs flagged
;; ``::no-pool?`` (SSH-tunnel-resolved specs) bypass it: the tunnel's local
;; forward port is ephemeral, so an idle pooled conn_id would point at a port
;; that's gone next time.

(def ^:private pool (atom nil))

(defn- pool-instance []
  (or (deref pool)
      (swap! pool (fn [p] (or p (pool/make-pool {:connect!    connect-and-setup!
                                                 :disconnect! disconnect!}))))))

(defn reset-pool!
  "Drop every pooled connection_id and clear the pool. Used by tests; safe to
  call when the pool was never created."
  []
  (swap-vals! pool (fn [p] (when p (try (pool/close-all! p) (catch Throwable _))) nil))
  nil)

(defn pool-stats
  "Debug map ``{endpoint {:idle n}}`` of the current connection pool, or nil if
  the pool was never created. Exposed so tests can assert that a borrowed
  connection was returned (and not leaked) after a call."
  []
  (some-> (deref pool) pool/stats))

(defn borrow-conn!
  "Get a connection_id for `conn-spec`, from the pool when allowed, else fresh.

  Public because the ``with-connection`` / ``with-transaction`` macros emit
  calls to it — those macros expand in *caller* namespaces, so the AOT
  compiler needs the var to be accessible across namespaces. Logically internal."
  [conn-spec]
  (if (::no-pool? conn-spec)
    (connect-and-setup! conn-spec)
    (pool/borrow! (pool-instance) conn-spec)))

(defn return-conn!
  "Return a healthy connection_id to the pool (or disconnect if non-pooled).
  Public for the same macro-expansion reason as [[borrow-conn!]]."
  [conn-spec conn-id]
  (if (::no-pool? conn-spec)
    (disconnect! conn-spec conn-id)
    (pool/return! (pool-instance) conn-spec conn-id)))

(defn discard-conn!
  "Tear down a possibly-broken connection_id (after an error), never to the pool.
  Public for the same macro-expansion reason as [[borrow-conn!]]."
  [conn-spec conn-id]
  (if (::no-pool? conn-spec)
    (disconnect! conn-spec conn-id)
    (pool/discard! (pool-instance) conn-spec conn-id)))

;;; ---------------------------------------------------------------------------
;;; Public query API
;;; ---------------------------------------------------------------------------

(defn execute-query
  "Run `sql` against the server. `conn-spec` is the flat details map
  ({:host :port :ssl :token ...}). Returns
  {:cols [...] :rows reducible-of-vectors}. Lazily FETCHes beyond the first
  batch via a reducible that pulls more batches on demand.

  Connection lifecycle: borrows a ``connection_id`` from the pool (or connects
  fresh for SSH-tunneled specs) and returns/discards it when the reducible is
  fully reduced (or hits an error). Callers MUST reduce the rows — a conn left
  unconsumed leaks a server-side connection."
  [conn-spec sql]
  (let [conn-id  (borrow-conn! conn-spec)
        query-id (next-query-id)]
    (try
      (let [first-batch (prepare conn-spec conn-id sql query-id)]
        {:cols (:cols first-batch)
         :rows (reducible-rows conn-spec conn-id first-batch query-id
                               (fn release [err?]
                                 (if err?
                                   (discard-conn! conn-spec conn-id)
                                   (return-conn! conn-spec conn-id))))})
      (catch Throwable e
        (discard-conn! conn-spec conn-id)
        (throw e)))))

(defn execute-sql!
  "Run `sql` and fully realize the result (`{:cols […] :rows vector}`),
  synchronously.

  Unlike [[execute-query]], whose `:rows` is a lazy reducible that only
  releases the pooled connection once it is reduced, this ALWAYS drains — so
  the borrowed ``connection_id`` is returned to the pool (or discarded on
  error) even when the caller ignores the rows. Use it for every non-streaming
  call (DDL, DML, sync metadata, transforms, uploads, persistence); reserve
  [[execute-query]] for the streaming query-execution path where the Metabase
  query processor reduces the rows itself."
  [conn-spec sql]
  (let [{:keys [cols] :as result} (execute-query conn-spec sql)]
    {:cols cols :rows (into [] (:rows result))}))

(defn reducible-rows
  "A reducible over all rows: yields the first batch's rows, then FETCHes more
  batches while the server has them, until rf returns reduced or results end.

  `query-id` is threaded into every FETCH so the whole stream shares one Quack
  client_query_id. `on-done!`, if provided, is invoked exactly once when
  reduction finishes — `(on-done! true)` on error / `(on-done! false)` on
  success — so a pooled conn is returned or discarded deterministically."
  ([details connection-id first-batch]
   (reducible-rows details connection-id first-batch nil nil))
  ([details connection-id first-batch query-id on-done!]
   (let [done   (atom false)
         finish! (fn [err?]
                   (when (compare-and-set! done false true)
                     (when on-done! (on-done! err?))))]
     (reify
       clojure.lang.IReduceInit
       (reduce [_ rf init]
         (try
           (loop [batch first-batch acc init]
             (let [acc' (reduce rf acc (:rows batch))]
               (cond
                 (reduced? acc')                 (unreduced acc')
                 (not (:needs-more-fetch batch)) acc'
                 :else (let [next (fetch details connection-id (:result-uuid batch) query-id)]
                         (if (:more? next)
                           (recur (assoc next :needs-more-fetch true :result-uuid (:result-uuid batch)) acc')
                           (reduce rf acc' (:rows next)))))))
           (catch Throwable e (finish! true) (throw e))
           (finally           (finish! false))))))))

;;; ---------------------------------------------------------------------------
;;; Held-connection execution + transactions
;;; ---------------------------------------------------------------------------
;; These borrow a pooled conn for the duration of the body (NOT one-shot) so a
;; DuckDB transaction (BEGIN…COMMIT) can span multiple statements on the same
;; connection_id. The conn is returned to the pool when the body completes.

(defn exec-on-connection
  "Run `sql` on an existing Quack `connection-id` and realize ALL rows (sync).
  Returns `{:cols […] :rows […]}`. Counterpart to [[execute-query]] for code
  that needs to run several statements on the SAME connection (e.g. inside a
  [[with-transaction]])."
  ([conn-spec connection-id sql]
   (let [first-batch (prepare conn-spec connection-id sql)]
     {:cols (:cols first-batch)
      :rows (into [] (reducible-rows conn-spec connection-id first-batch))})))

(defn- do-with-connection
  "Call `f` with a borrowed connection id, returning it on success and discarding it on error."
  [conn-spec f]
  (let [conn-id (borrow-conn! conn-spec)
        ok?     (volatile! false)]
    (try
      (let [result (f conn-id)]
        (vreset! ok? true)
        result)
      (finally
        (if @ok?
          (return-conn! conn-spec conn-id)
          (discard-conn! conn-spec conn-id))))))

(defn do-with-transaction
  "Call `f` with a held connection id inside `BEGIN`/`COMMIT`, rolling back on error."
  [conn-spec f]
  (do-with-connection
   conn-spec
   (fn [conn-id]
     (exec-on-connection conn-spec conn-id "BEGIN")
     (try
       (let [result (f conn-id)]
         (exec-on-connection conn-spec conn-id "COMMIT")
         result)
       (catch Throwable e
         (try (exec-on-connection conn-spec conn-id "ROLLBACK")
              (catch Throwable _))
         (throw e))))))

(defmacro with-transaction
  "Run `body` on a held Quack connection inside `BEGIN`/`COMMIT`, rolling back
  on any exception. Binds `conn-id-sym` to the connection-id; each statement
  in `body` runs via [[exec-on-connection]] on that same id (so the DuckDB
  transaction persists across them). `conn-spec` must be tunnel-resolved."
  {:style/indent 1}
  [[conn-id-sym conn-spec] & body]
  `(do-with-transaction ~conn-spec (fn [~conn-id-sym] ~@body)))

(defn can-connect?
  "Return true iff we can CONNECT and run a trivial query.
  Deliberately bypasses the pool (one-off probe; should not hold pool
  resources, and should not run :session-sql)."
  [details]
  (try (let [conn-id (connect! details)]
         (try (-> (wire/prepare-request conn-id "SELECT 1" (next-query-id))
                  (http-post details)
                  wire/decode-response
                  wire/error?
                  not)
              (finally (disconnect! details conn-id))))
       (catch Throwable t
         (log/debug t "Quack can-connect? failed")
         false)))
