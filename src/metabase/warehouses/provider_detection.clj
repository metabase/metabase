(ns metabase.warehouses.provider-detection
  "Database provider detection based on hostname patterns."
  (:require
   [clojure.string :as str]))

(def ^:private providers
  "Database providers with their hostname patterns and supported engines.
   Based on frontend/src/metabase/databases/components/DatabaseHostnameWithProviderField/database-providers.ts"
  [{:name "Aiven" :pattern #"\.aivencloud\.com$" :engines [:postgres]}
   {:name "Amazon RDS" :pattern #"\.rds\.amazonaws\.com$" :engines [:postgres]}
   {:name "Azure" :pattern #"\.postgres\.database\.azure\.com$" :engines [:postgres]}
   {:name "Crunchy Data" :pattern #"\.db\.postgresbridge\.com$" :engines [:postgres]}
   {:name "DigitalOcean" :pattern #"db\.ondigitalocean\.com$" :engines [:postgres]}
   {:name "Fly.io" :pattern #"\.fly\.dev$" :engines [:postgres]}
   {:name "Neon" :pattern #"\.neon\.tech$" :engines [:postgres]}
   {:name "PlanetScale" :pattern #"\.psdb\.cloud$" :engines [:postgres]}
   {:name "Railway" :pattern #"\.railway\.app$" :engines [:postgres]}
   {:name "Render" :pattern #"\.render\.com$" :engines [:postgres]}
   {:name "Scaleway" :pattern #"\.scw\.cloud$" :engines [:postgres]}
   {:name "Supabase" :pattern #"(pooler\.supabase\.com|\.supabase\.co)$" :engines [:postgres]}
   {:name "Timescale" :pattern #"(\.tsdb\.cloud|\.timescale\.com)$" :engines [:postgres]}])

(defn- extract-host-from-details
  "Extract host from database details map."
  [details]
  (when details
    (or (:host details)
        (get details "host"))))

(defn- detect-provider
  "Detect database provider from host using regex patterns.
   Returns provider name string or nil if no match found."
  [host]
  (when (and host (string? host) (not (str/blank? host)))
    (let [host (str/trim host)]
      (->> providers
           (filter #(re-find (:pattern %) host))
           first
           :name))))

(defn detect-provider-from-database
  "Detect provider from a database entity by examining its details."
  [database]
  (when-let [details (:details database)]
    (when-let [host (extract-host-from-details details)]
      (detect-provider host))))

(defn providers-for-engine
  "Return providers data formatted for API consumption for a specific engine."
  [engine]
  (let [engine-keyword (keyword engine)]
    (->> providers
         (filter #(some #{engine-keyword} (:engines %)))
         (mapv (fn [provider]
                 {:name (:name provider)
                  :pattern (str (:pattern provider))})))))
