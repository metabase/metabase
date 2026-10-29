(ns metabase-enterprise.monitor-relay.settings
  "The setting that says where the relay sends: the ingestion URL `<base>/ingest/<token>` that Metabase Monitor gives at
  registration.

  The token is the instance's only credential: never log it, or the URL that holds it."
  (:require
   [clojure.string :as str]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

(def ^:private ingest-segment "/ingest/")

(defn parse-url
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
  (deferred-tru "The ingestion URL that Metabase Monitor gives at registration. Metabase sends its activity there.")
  :type       :string
  :visibility :admin
  :sensitive? true
  :encryption :when-encryption-key-set
  :export?    false
  :audit      :no-value
  :setter     (fn [url]
                (setting/set-value-of-type! :string :metabase-monitor-url (stored-url url))))
