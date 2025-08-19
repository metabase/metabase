(ns metabase.warehouses.provider-detection
  "Database provider detection based on hostname patterns."
  (:require
   [clojure.string :as str]))

(def ^:private providers
  "Database providers with their hostname patterns.
   Based on frontend/src/metabase/databases/components/DatabaseHostnameWithProviderField/database-providers.ts"
  [{:name "Aiven" :pattern #"\.aivencloud\.com$"}
   {:name "Amazon RDS" :pattern #"\.rds\.amazonaws\.com$"}
   {:name "Azure" :pattern #"\.postgres\.database\.azure\.com$"}
   {:name "Crunchy Data" :pattern #"\.db\.postgresbridge\.com$"}
   {:name "DigitalOcean" :pattern #"db\.ondigitalocean\.com$"}
   {:name "Fly.io" :pattern #"\.fly\.dev$"}
   {:name "Neon" :pattern #"\.neon\.tech$"}
   {:name "PlanetScale" :pattern #"\.psdb\.cloud$"}
   {:name "Railway" :pattern #"\.railway\.app$"}
   {:name "Render" :pattern #"\.render\.com$"}
   {:name "Scaleway" :pattern #"\.scw\.cloud$"}
   {:name "Supabase" :pattern #"pooler\.supabase\.com|\.supabase\.co$"}
   {:name "Timescale" :pattern #"\.tsdb\.cloud|\.timescale\.com$"}])

(defn detect-provider
  "Detect database provider from hostname using regex patterns.
   Returns provider name string or nil if no match found."
  [host]
  (when (and host (string? host) (not (str/blank? host)))
    (let [host (str/trim host)]
      (->> providers
           (filter #(re-find (:pattern %) host))
           first
           :name))))

(defn extract-host-from-details
  "Extract host from database details map. Handles various possible keys."
  [details]
  (when details
    (or (:host details)
        (get details "host")
        (:hostname details)
        (get details "hostname"))))

(defn detect-provider-from-database
  "Detect provider from a database entity by examining its details."
  [database]
  (when-let [details (:details database)]
    (when-let [host (extract-host-from-details details)]
      (detect-provider host))))

(defn providers-for-api
  "Return providers data formatted for API consumption, with regex patterns converted to strings."
  []
  (mapv (fn [provider]
          {:name (:name provider)
           :pattern (str (:pattern provider))})
        providers))
