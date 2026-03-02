(ns metabase-enterprise.product-analytics.geo
  "MaxMind GeoLite2/GeoIP2 database reader for IP-based geolocation.
   Loads a `.mmdb` file from a user-configured path and caches the reader.
   Falls back to a bundled test database when no path is configured.
   Used as a fallback when CDN headers don't provide geo information."
  (:require
   [clojure.java.io :as io]
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

(def ^:private bundled-db-resource
  "Classpath resource path for the bundled GeoLite2-City test database."
  "product-analytics/GeoLite2-City-Test.mmdb")

(setting/defsetting product-analytics-maxmind-db-path
  (deferred-tru "File path to a MaxMind GeoLite2-City or GeoIP2-City .mmdb database file. Used for IP geolocation when CDN headers are not available. Leave blank to use the bundled test database.")
  :type       :string
  :visibility :admin
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

;;; -------------------------------------------- Database reader cache ------------------------------------------------

(defonce ^:private reader-state
  ;; {:source "..." :reader DatabaseReader :last-modified long-or-nil}
  (atom nil))

(defn- open-db-reader-from-file
  "Load a MaxMind DatabaseReader from a filesystem path. Returns nil on failure."
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

(defn- open-db-reader-from-resource
  "Load a MaxMind DatabaseReader from a classpath resource. Returns nil if not found."
  ^DatabaseReader []
  (try
    (when-let [resource (io/resource bundled-db-resource)]
      (let [reader (-> (DatabaseReader$Builder. (io/input-stream resource))
                       (.build))]
        (log/info "Loaded bundled MaxMind test database from classpath")
        reader))
    (catch Exception e
      (log/errorf e "Failed to load bundled MaxMind database")
      nil)))

(defn- close-reader! [state]
  (when-let [^DatabaseReader r (:reader state)]
    (try (.close r) (catch Exception _))))

(defn get-reader
  "Return a cached DatabaseReader, reloading if the file path changed or the file
   was modified since last load. When no path is configured, falls back to the
   bundled test database on the classpath. Returns nil if nothing can be loaded."
  ^DatabaseReader []
  (let [path (product-analytics-maxmind-db-path)]
    (if-not (str/blank? path)
      ;; Explicit file path configured
      (let [f             (File. ^String path)
            last-modified (when (.exists f) (.lastModified f))
            current       @reader-state]
        (if (and current
                 (= (:source current) path)
                 (= (:last-modified current) last-modified)
                 (:reader current))
          (:reader current)
          (let [old-state current
                reader    (open-db-reader-from-file path)]
            (when reader
              (reset! reader-state {:source        path
                                    :reader        reader
                                    :last-modified last-modified})
              (close-reader! old-state)
              reader))))
      ;; No path configured — use bundled resource
      (let [current @reader-state]
        (if (and current
                 (= (:source current) ::bundled)
                 (:reader current))
          (:reader current)
          (let [old-state current
                reader    (open-db-reader-from-resource)]
            (when reader
              (reset! reader-state {:source        ::bundled
                                    :reader        reader
                                    :last-modified nil})
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
