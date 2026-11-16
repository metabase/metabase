(ns metabase.exec-log.record
  "Turns a QueryExecution map into a wire record for the execution-log stream.

  The input is the enriched `execution-info` map that
  `metabase.query-processor.middleware.process-userland-query/save-execution-metadata!` builds: the
  `query-execution-info` row plus whatever `metabase.analytics.sdk/include-sdk-info` attached. Its keys are
  snake_case, because it is shaped for a JDBC insert. The output is the kebab-case wire record described
  by [[metabase.exec-log.schema/record]].

  This namespace is pure. It reads no settings and performs no IO, so the emission path can be tested by handing it a
  map. The one thing it cannot derive for itself is whether PII retention was on, because that is a setting; the caller
  passes it as `pii?` and is responsible for having read it on the query thread.

  Three shape translations are worth knowing about, because the flat row can express states the wire format cannot:

  - The row carries `card_id`, `dashboard_id`, `pulse_id`, `transform_id`, `action_id`, and `lens_id` as independent
    nullable columns, so more than one can be set at once. [[target]] picks exactly one.
  - The row carries `error` beside a status, so a completed execution can hold an error message. [[outcome]] makes
    that unrepresentable.
  - The row carries `cache_hash` beside `cache_hit`, so a miss can hold a cache key. [[cache]] makes that
    unrepresentable."
  (:require
   [buddy.core.codecs :as codecs]
   [java-time.api :as t]
   [metabase.exec-log.schema :as exec-log.schema]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- hex
  "Hex-encode a query hash. The row holds it as bytes; the wire format holds it as a string so a consumer can group by
  it without decoding. Tolerates a string in case a caller has already encoded it."
  [h]
  (cond
    (nil? h)      nil
    (string? h)   h
    (bytes? h)    (codecs/bytes->hex h)
    :else         (str h)))

(defn- target
  "Pick the one thing that ran. The row's ID columns are independent, so this is where a contradiction gets resolved
  rather than carried onto the stream.

  Order matters: `lens_id` is checked before `card_id` because a lens execution also carries the card it renders, and
  the lens is the more specific answer. `action_id` likewise outranks `card_id`."
  [{:keys [lens_id lens_params action_id transform_id pulse_id dashboard_id card_id]}]
  (cond
    lens_id      {:kind :lens, :id (str lens_id), :params {:join-step (:join_step lens_params)}}
    action_id    {:kind :action, :id action_id}
    transform_id {:kind :transform, :id transform_id}
    pulse_id     {:kind :pulse, :id pulse_id}
    dashboard_id {:kind :dashboard, :id dashboard_id}
    card_id      {:kind :card, :id card_id}
    :else        {:kind :ad-hoc}))

(defn- outcome
  "A failed execution carries its message; a completed one carries nothing. The row's `:error` is authoritative for
  which happened, since a row is only given an error when the query threw."
  [{:keys [error]}]
  (if error
    {:status :failed, :error (str error)}
    {:status :completed}))

(defn- cache
  "A cache hit carries its key. `cache_hash` may be bytes, like the query hash."
  [{:keys [cache_hit cache_hash]}]
  (if cache_hit
    {:hit? true, :hash (hex cache_hash)}
    {:hit? false}))

(defn- access
  "Which enforcement mechanisms applied, and how the caller authenticated. `auth_method` is normalized to a string:
  upstream it is a keyword or a string depending on which code path bound the dynamic var, and two spellings of one
  value would silently split a rule that matches on it."
  [{:keys [is_sandboxed is_impersonated is_db_routed auth_method]}]
  {:sandboxed?    (boolean is_sandboxed)
   :impersonated? (boolean is_impersonated)
   :db-routed?    (boolean is_db_routed)
   :auth-method   (some-> auth_method u/qualified-name)})

(defn- client
  [{:keys [embedding_client embedding_sdk_version embedding_hostname embedding_route
           embedding_client_identifier]}]
  {:embedding-client (some-> embedding_client str)
   :sdk-version      (some-> embedding_sdk_version str)
   :hostname         (some-> embedding_hostname str)
   :route            (some-> embedding_route str)
   :identifier       (some-> embedding_client_identifier str)})

(defn- request
  "Request context, or nil when PII retention is off.

  Nil-as-a-whole rather than a map of nils: a consumer branches once on whether request context exists, and a rule
  predicating on IP cannot match when retention is off. Returns nil when `pii?` is false even if the row happens to
  carry values, so the setting is authoritative rather than advisory."
  [pii? {:keys [ip_address user_agent sanitized_user_agent embedding_path]}]
  (when pii?
    {:ip-address           (some-> ip_address str)
     :user-agent           (some-> user_agent str)
     :sanitized-user-agent (some-> sanitized_user_agent str)
     :embedding-path       (some-> embedding_path str)}))

(defn- iso
  "The row's `:started_at` is a ZonedDateTime. Emit ISO-8601 with offset, so the JSON and the in-memory record are the
  same shape and a consumer never has to guess a zone."
  [started-at]
  (str (t/instant (or started-at (t/zoned-date-time)))))

(defn ->record
  "Build a wire record from an enriched QueryExecution map.

  `pii?` is whether PII retention was on, read by the caller on the query thread. `instance-id` identifies which
  Metabase emitted the record, so one consumer can serve several.

  Returns a map matching [[metabase.exec-log.schema/record]]. Does not validate: the sink validates on the way out,
  so there is one place a malformed record can be stopped."
  [execution-info {:keys [pii? instance-id]}]
  {:topic       :query-executed
   :v           exec-log.schema/wire-version
   :ts          (iso (:started_at execution-info))
   :instance-id (some-> instance-id str)
   :actor       {:user-id   (:executor_id execution-info)
                 :tenant-id (:tenant_id execution-info)}
   :pii         (boolean pii?)
   :data        {:target           (target execution-info)
                 :database-id      (:database_id execution-info)
                 :query-hash       (hex (:hash execution-info))
                 :context          (some-> (:context execution-info) keyword)
                 :native?          (boolean (:native execution-info))
                 :parameterized?   (boolean (:parameterized execution-info))
                 :outcome          (outcome execution-info)
                 :running-ms       (:running_time execution-info)
                 :result-rows      (:result_rows execution-info)
                 :cache            (cache execution-info)
                 :access           (access execution-info)
                 :client           (client execution-info)
                 :request          (request pii? execution-info)
                 :metabase-version (some-> (:metabase_version execution-info) str)}})
