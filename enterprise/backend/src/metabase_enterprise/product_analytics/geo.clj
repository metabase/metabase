(ns metabase-enterprise.product-analytics.geo
  "MaxMind GeoLite2/GeoIP2 database reader for IP-based geolocation.
   Loads a `.mmdb` file from a user-configured path and caches the reader.
   Used as a fallback when CDN headers don't provide geo information."
  (:require
   [clojure.string :as str]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log])
  (:import
   (com.maxmind.geoip2 DatabaseReader DatabaseReader$Builder)
   (com.maxmind.geoip2.exception AddressNotFoundException)
   (java.io File)
   (java.net InetAddress)))

(set! *warn-on-reflection* true)

(setting/defsetting product-analytics-maxmind-db-path
  (deferred-tru "File path to a MaxMind GeoLite2-City or GeoIP2-City .mmdb database file. Used for IP geolocation when CDN headers are not available.")
  :type       :string
  :visibility :admin
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

;;; -------------------------------------------- Database reader cache ------------------------------------------------

(defonce ^:private reader-state
  ;; {:path "..." :reader DatabaseReader :last-modified long}
  (atom nil))

(defn- open-db-reader
  "Load a MaxMind DatabaseReader from the given path. Returns nil on failure."
  ^DatabaseReader [^String path]
  (try
    (let [f (File. path)]
      (when (.exists f)
        (let [reader (-> (DatabaseReader$Builder. f)
                         (.build))]
          (log/infof "Loaded MaxMind database from %s" path)
          reader)))
    (catch Exception e
      (log/errorf e "Failed to load MaxMind database from %s" path)
      nil)))

(defn- close-reader! [state]
  (when-let [^DatabaseReader r (:reader state)]
    (try (.close r) (catch Exception _))))

(defn get-reader
  "Return a cached DatabaseReader, reloading if the file path changed or the file
   was modified since last load. Returns nil if no path is configured or the file
   cannot be loaded."
  ^DatabaseReader []
  (let [path (product-analytics-maxmind-db-path)]
    (when-not (str/blank? path)
      (let [f             (File. ^String path)
            last-modified (when (.exists f) (.lastModified f))
            current       @reader-state]
        (if (and current
                 (= (:path current) path)
                 (= (:last-modified current) last-modified)
                 (:reader current))
          (:reader current)
          ;; Need to (re)load
          (let [old-state current
                reader    (open-db-reader path)]
            (when reader
              (reset! reader-state {:path          path
                                    :reader        reader
                                    :last-modified last-modified})
              (close-reader! old-state)
              reader)))))))

;;; --------------------------------------------------- Lookup --------------------------------------------------------

(defn lookup-city
  "Look up geolocation for an IP address string. Returns
   `{:country \"US\" :subdivision1 \"MN\" :city \"Minneapolis\"}` or a map with nil values
   if lookup fails or the IP is not found."
  [^String ip-address]
  (let [empty-result {:country nil :subdivision1 nil :city nil}]
    (if-let [reader (get-reader)]
      (try
        (let [inet     (InetAddress/getByName ip-address)
              response (.city ^DatabaseReader reader inet)
              country  (some-> response .getCountry .getIsoCode)
              subdiv   (some-> response .getMostSpecificSubdivision .getIsoCode)
              city     (some-> response .getCity .getName)]
          {:country      country
           :subdivision1 subdiv
           :city         city})
        (catch AddressNotFoundException _
          empty-result)
        (catch Exception e
          (log/debugf e "MaxMind lookup failed for IP %s" ip-address)
          empty-result))
      empty-result)))
