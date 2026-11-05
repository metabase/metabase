(ns metabase-enterprise.monitor-relay.settings
  "The setting that says where the relay sends: the ingestion URL `<base>/ingest/<token>` that Metabase Monitor gives at
  registration. The relay reads it each cycle. `MB_METABASE_MONITOR_URL` wins over the value an admin saves. Without the
  license's `:monitor-relay` feature, the setting reads as unset, and the settings API refuses to save it.

  The token is the instance's only credential: never log it, or the URL that holds it."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private ingest-segment "/ingest/")

(defn- parse-url
  "The `{:base :token}` of ingestion URL `s`, split at its last `/ingest/`, or nil when `s` is not an http(s) URL of
  that shape."
  [s]
  (let [s (when (string? s) (str/replace (str/trim s) #"/+$" ""))
        i (some-> s (str/last-index-of ingest-segment))]
    (when i
      (let [base  (subs s 0 i)
            token (subs s (+ i (count ingest-segment)))]
        (when (and (re-matches #"(?i)https?://[^\s/?#]+(/[^\s?#]*)?" base)
                   (re-matches #"[A-Za-z0-9_-]+" token))
          {:base base, :token token})))))

(defn- stored-url
  "What the setting stores when it is set to `url`: nil for a blank one, the URL as [[parse-url]] reads it, or the
  masked value that reading the setting gives, which the `:string` setter ignores. Throws a 400 for anything else."
  [url]
  (cond
    (or (nil? url) (and (string? url) (str/blank? url)))
    nil

    (and (string? url) (setting/obfuscated-value? url))
    url

    :else
    (if-let [{:keys [base token]} (parse-url url)]
      (str base ingest-segment token)
      (throw (ex-info (tru "This is not a Metabase Monitor ingestion URL. Paste the URL that Metabase Monitor gives at registration, of the form <base>/ingest/<token>.")
                      {:status-code 400})))))

(defsetting metabase-monitor-url
  (deferred-tru "The ingestion URL that Metabase Monitor gives when you register this instance. Metabase sends the rows of its application database there, such as users, questions and query history.")
  :type       :string
  :feature    :monitor-relay
  :visibility :admin
  :sensitive? true
  :encryption :when-encryption-key-set
  :export?    false
  :audit      :no-value
  ;; It schedules the relay's job once the URL commits, in a future, so that the job store does not take a second
  ;; connection while the transaction still holds its own. `additional-search-engines` does the same.
  :setter     (fn [url]
                (let [result (setting/set-value-of-type! :string :metabase-monitor-url (stored-url url))]
                  (mdb/do-after-commit
                   #(future
                      (try
                        ((requiring-resolve 'metabase-enterprise.monitor-relay.task.relay/schedule!))
                        (catch Throwable t
                          (log/error t "Could not schedule the Metabase Monitor relay's job")))))
                  result)))

(mr/def ::target
  "Where the relay sends: `:ok`, with the URL's `:base` and `:token`; `:unset`, when no URL is set or the license lacks
  `:monitor-relay`; or `:malformed`, when the URL is not of the form `<base>/ingest/<token>`. Only
  `MB_METABASE_MONITOR_URL` can hold such a URL: the setting refuses one."
  [:or
   [:map {:closed true} [:status [:= :ok]] [:base :string] [:token :string]]
   [:map {:closed true} [:status [:enum :unset :malformed]]]])

(mu/defn target :- ::target
  "Where the relay sends now."
  []
  (if-let [url (metabase-monitor-url)]
    (if-let [parsed (parse-url url)]
      (assoc parsed :status :ok)
      {:status :malformed})
    {:status :unset}))
