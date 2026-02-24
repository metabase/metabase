(ns metabase-enterprise.product-analytics.pipeline
  "Event postprocessing pipeline for Product Analytics.
   Transforms a raw Umami-compatible event payload + request context into data
   structures ready for `store-upsert-session!` and `store-save-event!`."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [java-time.api :as t]
   [malli.core :as mc]
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase-enterprise.product-analytics.token :as pa.token]
   [user-agent])
  (:import
   (java.net URI URISyntaxException URLDecoder)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Schemas ----------------------------------------------------

(def ^:private EventPayload
  [:map
   [:website [:string {:max 36}]]
   [:url     [:string {:max 2048}]]
   [:hostname {:optional true} [:maybe :string]]
   [:screen   {:optional true} [:maybe :string]]
   [:language {:optional true} [:maybe :string]]
   [:referrer {:optional true} [:maybe :string]]
   [:title    {:optional true} [:maybe :string]]
   [:name     {:optional true} [:maybe [:string {:max 50}]]]
   [:data     {:optional true} [:maybe :any]]])

(def ^:private IdentifyPayload
  [:map
   [:website     [:string {:max 36}]]
   [:data        {:optional true} [:maybe [:map-of [:or :string :keyword] :any]]]
   [:distinct_id {:optional true} [:maybe [:string {:max 50}]]]])

(def ^:private SendRequest
  [:multi {:dispatch :type}
   ["event"    [:map [:type [:= "event"]]    [:payload EventPayload]]]
   ["identify" [:map [:type [:= "identify"]] [:payload IdentifyPayload]]]])

;;; --------------------------------------------------- Utilities --------------------------------------------------

(defn- truncate
  "Nil-safe string truncation."
  [s max-len]
  (when s
    (subs s 0 (min (count s) max-len))))

(defn- hash->uuid
  "Take the first 16 bytes of a hash and format as a UUID string (char(36))."
  ^String [^bytes hash-bytes]
  (let [hex (codecs/bytes->hex (byte-array (take 16 hash-bytes)))]
    (str (subs hex 0 8) "-"
         (subs hex 8 12) "-"
         (subs hex 12 16) "-"
         (subs hex 16 20) "-"
         (subs hex 20 32))))

(defn- monthly-salt
  "Derive a monthly salt from the secret and a timestamp."
  [secret now]
  (str secret (t/format "yyyy-MM" (t/local-date now))))

(defn- hourly-salt
  "Derive an hourly salt from the secret and a timestamp."
  [secret now]
  (str secret (t/format "yyyy-MM-dd-HH" now)))

(defn- parse-query-params
  "Parse a query string into a {string string} map. Returns empty map on nil."
  [query-string]
  (if (str/blank? query-string)
    {}
    (into {}
          (keep (fn [pair]
                  (let [parts (str/split pair #"=" 2)]
                    (when (= 2 (count parts))
                      [(URLDecoder/decode ^String (first parts) "UTF-8")
                       (URLDecoder/decode ^String (second parts) "UTF-8")]))))
          (str/split query-string #"&"))))

;;; ------------------------------------------------ Step functions ------------------------------------------------

(defn validate-payload
  "Validate the top-level request body against the SendRequest schema.
   Returns `{:ok body}` or `{:error :validation/invalid-payload :message ...}`."
  [body]
  (if-let [explanation (mc/explain SendRequest body)]
    {:error   :validation/invalid-payload
     :message (pr-str explanation)}
    {:ok body}))

(def ^:private bot-pattern
  "Regex matching known bot User-Agent strings."
  (re-pattern
   (str "(?i)"
        (str/join "|"
                  ["Googlebot" "Bingbot" "bbot" "Slurp" "DuckDuckBot"
                   "Baiduspider" "YandexBot" "facebookexternalhit"
                   "LinkedInBot" "Twitterbot" "Applebot" "AhrefsBot"
                   "SemrushBot" "MJ12bot" "DotBot" "PetalBot"
                   "UptimeRobot" "Pingdom" "HeadlessChrome"
                   "PhantomJS" "CasperJS" "Lighthouse"
                   "APIs-Google" "Mediapartners-Google" "AdsBot-Google"
                   "curl" "wget" "python-requests" "Go-http-client"
                   "Java/" "okhttp" "Apache-HttpClient"
                   "bot" "crawler" "spider" "scraper"]))))

(defn bot?
  "Return true if the user-agent string looks like a bot.
   nil or blank UA is treated as a bot."
  [user-agent-string]
  (if (str/blank? user-agent-string)
    true
    (boolean (re-find bot-pattern user-agent-string))))

(defn lookup-site
  "Look up a site by UUID. Returns `{:ok site}` or `{:error :validation/unknown-site}`."
  [site-uuid]
  (if-let [site (storage/store-get-site site-uuid)]
    {:ok site}
    {:error   :validation/unknown-site
     :message (str "Unknown site: " site-uuid)}))

(def ^:private device-type-mapping
  {"Personal computer" "desktop"
   "Smartphone"        "mobile"
   "Mobile Browser"    "mobile"
   "Tablet"            "tablet"})

(defn parse-client-info
  "Parse a user-agent string into `{:browser :os :device}`.
   All values truncated to 254 chars. Returns all-nil map for nil UA."
  [user-agent-string]
  (if (str/blank? user-agent-string)
    {:browser nil :os nil :device nil}
    (let [parsed     (user-agent/parse user-agent-string)
          browser    (:name parsed)
          os         (get-in parsed [:os :name])
          raw-device (:type-name parsed)
          device     (or (get device-type-mapping raw-device)
                         (when raw-device (str/lower-case raw-device)))]
      {:browser (truncate browser 254)
       :os      (truncate os 254)
       :device  (truncate device 254)})))

(defn extract-geo
  "Extract geo information from CDN headers.
   Checks Cloudflare, then Vercel headers. Returns `{:country :subdivision1 :city}`."
  [headers]
  (let [headers   (into {} (map (fn [[k v]] [(str/lower-case (name k)) v])) headers)
        cf-country (get headers "cf-ipcountry")
        country    (cond
                     (and cf-country (not (#{"XX" "T1"} cf-country)))
                     cf-country

                     :else
                     (get headers "x-vercel-ip-country"))
        subdivision1 (get headers "x-vercel-ip-country-region")
        raw-city     (get headers "x-vercel-ip-city")
        city         (when raw-city
                       (try
                         (URLDecoder/decode ^String raw-city "UTF-8")
                         (catch Exception _ raw-city)))]
    {:country      country
     :subdivision1 subdivision1
     :city         city}))

(defn session-uuid
  "Compute a deterministic session UUID from site, IP, UA, and monthly-rotating salt."
  ^String [site-uuid ip user-agent-string secret now]
  (let [input (str site-uuid "|" ip "|" user-agent-string "|" (monthly-salt secret now))
        hash  (buddy-hash/sha256 input)]
    (hash->uuid hash)))

(defn visit-id
  "Compute a deterministic visit ID from session UUID and hourly-rotating salt."
  ^String [session-uuid-str secret now]
  (let [input (str session-uuid-str "|" (hourly-salt secret now))
        hash  (buddy-hash/sha256 input)]
    (hash->uuid hash)))

(defn parse-url
  "Parse a URL string, extracting path, query, UTM params, and click IDs.
   Returns all-nil map on malformed URLs."
  [url-string]
  (if (str/blank? url-string)
    {:path nil :query nil
     :utm_source nil :utm_medium nil :utm_campaign nil :utm_content nil :utm_term nil
     :gclid nil :fbclid nil}
    (try
      (let [uri          (URI. ^String url-string)
            path         (truncate (.getPath uri) 500)
            query-string (.getQuery uri)
            params       (parse-query-params query-string)]
        {:path         path
         :query        query-string
         :utm_source   (truncate (get params "utm_source") 254)
         :utm_medium   (truncate (get params "utm_medium") 254)
         :utm_campaign (truncate (get params "utm_campaign") 254)
         :utm_content  (truncate (get params "utm_content") 254)
         :utm_term     (truncate (get params "utm_term") 254)
         :gclid        (truncate (get params "gclid") 254)
         :fbclid       (truncate (get params "fbclid") 254)})
      (catch URISyntaxException _
        {:path nil :query nil
         :utm_source nil :utm_medium nil :utm_campaign nil :utm_content nil :utm_term nil
         :gclid nil :fbclid nil}))))

(defn parse-referrer
  "Parse a referrer URL string.
   Extracts `:referrer_path`, `:referrer_query`, `:referrer_domain`. nil/blank → all nil."
  [referrer-string]
  (if (str/blank? referrer-string)
    {:referrer_path nil :referrer_query nil :referrer_domain nil}
    (try
      (let [uri (URI. ^String referrer-string)]
        {:referrer_path   (truncate (.getPath uri) 500)
         :referrer_query  (.getQuery uri)
         :referrer_domain (truncate (.getHost uri) 500)})
      (catch URISyntaxException _
        {:referrer_path nil :referrer_query nil :referrer_domain nil}))))

(defn build-event-properties
  "Convert a `{\"key\" value}` data map into a vector of property row maps.
   Strings → data_type 1, numbers → data_type 2, else coerced to string.
   Keys and string values truncated to 500 chars. nil/empty → `[]`."
  [data-map]
  (if (or (nil? data-map) (empty? data-map))
    []
    (mapv (fn [[k v]]
            (let [str-key (truncate (str k) 500)]
              (cond
                (number? v)
                {:data_key     str-key
                 :number_value v
                 :data_type    2}

                (string? v)
                {:data_key     str-key
                 :string_value (truncate v 500)
                 :data_type    1}

                :else
                {:data_key     str-key
                 :string_value (truncate (str v) 500)
                 :data_type    1})))
          data-map)))

(defn build-session-data-rows
  "Convert a `{\"key\" value}` data map into session-data row maps for
   [[storage/save-session-data!]]. Caller must assoc `:session_id` onto each row.
   Strings → data_type 1, numbers → data_type 2, else coerced to string.
   Keys and string values truncated to 500 chars. nil/empty → `[]`."
  [data-map]
  (if (or (nil? data-map) (empty? data-map))
    []
    (mapv (fn [[k v]]
            (let [str-key (truncate (str k) 500)]
              (cond
                (number? v)
                {:data_key     str-key
                 :number_value v
                 :data_type    2}

                (string? v)
                {:data_key     str-key
                 :string_value (truncate v 500)
                 :data_type    1}

                :else
                {:data_key     str-key
                 :string_value (truncate (str v) 500)
                 :data_type    1})))
          data-map)))

;;; ----------------------------------------------- Orchestrator ---------------------------------------------------

(defn- resolve-token
  "Verify a session cache JWT from request-context :token.
   Returns claims map or nil."
  [request-context]
  (when-let [token (:token request-context)]
    (pa.token/verify-session-token token)))

(defn process-event
  "Process a raw event payload and request context through the pipeline.

   `body` is the parsed JSON body (e.g. `{:type \"event\" :payload {...}}`).
   `request-context` is `{:user-agent \"...\" :ip \"...\" :headers {...} :token \"...\"}`.
   `resolved-session` is an optional pre-resolved session (for Phase 5.5, nil for now).

   Returns on success:
     `{:session-data {...} :event-data {:event {...} :properties [...]}}`

   Returns on failure:
     `{:error :validation/... :message \"...\"}`"
  ([body request-context]
   (process-event body request-context nil))
  ([body request-context resolved-session]
   (let [validation (validate-payload body)]
     (if (:error validation)
       validation
       (let [ua (:user-agent request-context)]
         (if (bot? ua)
           {:error :rejected/bot :message "Bot user-agent rejected"}
           (let [payload      (:payload body)
                 site-uuid    (:website payload)
                 site-res     (lookup-site site-uuid)]
             (if (:error site-res)
               site-res
               (let [site          (:ok site-res)
                     now           (t/zoned-date-time)
                     secret        (pa.token/ensure-secret!)
                     token-claims  (when-not resolved-session
                                     (let [claims (resolve-token request-context)]
                                       (when (and claims (= (:website-id claims) site-uuid))
                                         claims)))
                     cached?       (boolean (or resolved-session token-claims))
                     client-info   (when-not cached? (parse-client-info ua))
                     geo           (when-not cached? (extract-geo (:headers request-context)))
                     sess-uuid     (cond
                                     resolved-session (:session_uuid resolved-session)
                                     token-claims     (:session-id token-claims)
                                     :else            (session-uuid site-uuid
                                                                    (:ip request-context)
                                                                    ua
                                                                    secret
                                                                    now))
                     vid           (cond
                                     (and resolved-session (:visit_id resolved-session))
                                     (:visit_id resolved-session)

                                     token-claims
                                     (:visit-id token-claims)

                                     :else
                                     (visit-id sess-uuid secret now))
                     url-info      (parse-url (:url payload))
                     ref-info      (parse-referrer (:referrer payload))
                     props         (build-event-properties (:data payload))
                     event-type    (if (str/blank? (:name payload)) 1 2)]
                 {:session-data (cond-> {:session_uuid sess-uuid
                                         :site_id      (:id site)
                                         :screen       (truncate (:screen payload) 254)
                                         :language     (truncate (:language payload) 20)}
                                  (not cached?)
                                  (merge {:browser      (:browser client-info)
                                          :os           (:os client-info)
                                          :device       (:device client-info)
                                          :country      (:country geo)
                                          :subdivision1 (:subdivision1 geo)
                                          :city         (:city geo)}))
                  :event-data   {:event      {:site_id         (:id site)
                                              :visit_id        vid
                                              :event_type      event-type
                                              :event_name      (when (= 2 event-type)
                                                                 (truncate (:name payload) 50))
                                              :url_path        (:path url-info)
                                              :url_query       (:query url-info)
                                              :referrer_path   (:referrer_path ref-info)
                                              :referrer_query  (:referrer_query ref-info)
                                              :referrer_domain (:referrer_domain ref-info)
                                              :page_title      (truncate (:title payload) 500)
                                              :utm_source      (:utm_source url-info)
                                              :utm_medium      (:utm_medium url-info)
                                              :utm_campaign    (:utm_campaign url-info)
                                              :utm_content     (:utm_content url-info)
                                              :utm_term        (:utm_term url-info)
                                              :gclid           (:gclid url-info)
                                              :fbclid          (:fbclid url-info)}
                                 :properties props}})))))))))

(defn process-identify
  "Process an identify payload and request context.

   `body` is `{:type \"identify\" :payload {:website \"...\" :distinct_id \"...\" :data {...}}}`.
   `request-context` is `{:user-agent \"...\" :ip \"...\" :headers {...} :token \"...\"}`.

   Returns on success:
     `{:identify true :session-data {...} :distinct-id \"...\" :data-rows [...]}`

   Returns on failure:
     `{:error :validation/... :message \"...\"}`"
  [body request-context]
  (let [validation (validate-payload body)]
    (if (:error validation)
      validation
      (let [ua (:user-agent request-context)]
        (if (bot? ua)
          {:error :rejected/bot :message "Bot user-agent rejected"}
          (let [payload      (:payload body)
                site-uuid    (:website payload)
                site-res     (lookup-site site-uuid)]
            (if (:error site-res)
              site-res
              (let [site         (:ok site-res)
                    token-claims (let [claims (resolve-token request-context)]
                                   (when (and claims (= (:website-id claims) site-uuid))
                                     claims))
                    now          (t/zoned-date-time)
                    secret       (pa.token/ensure-secret!)
                    sess-uuid    (if token-claims
                                   (:session-id token-claims)
                                   (session-uuid site-uuid
                                                 (:ip request-context)
                                                 ua
                                                 secret
                                                 now))
                    distinct-id  (:distinct_id payload)
                    data-rows    (build-session-data-rows (:data payload))]
                {:identify     true
                 :session-data {:session_uuid sess-uuid
                                :site_id      (:id site)}
                 :distinct-id  distinct-id
                 :data-rows    data-rows}))))))))

(defn process-payload
  "Top-level entry point. Dispatches on `:type` to [[process-event]] or [[process-identify]]."
  [body request-context]
  (case (:type body)
    "event"    (process-event body request-context)
    "identify" (process-identify body request-context)
    {:error   :validation/invalid-payload
     :message (str "Unknown payload type: " (pr-str (:type body)))}))
