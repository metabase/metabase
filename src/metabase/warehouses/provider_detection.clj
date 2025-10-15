(ns metabase.warehouses.provider-detection
  "Database provider detection based on hostname patterns."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]))

(defn- detect-provider
  "Detect database provider from host and engine using regex patterns.
   Returns provider name string or nil if no match found."
  [host providers]
  (when-not (str/blank? host)
    (some (fn [{provider-name :name pat :pattern}]
            (when (and (string? pat) (re-find (re-pattern pat) host))
              provider-name))
          providers)))

(defn detect-provider-from-database
  "Detect provider from a database entity by examining its details and engine. Looks for common host names to identify
  common database providers, like supabase."
  [{:keys [engine] :as database}]
  (when-let [host (some-> database :details :host)]
    (let [providers (:providers (driver/extra-info engine))]
      (when (seq providers)
        (detect-provider host providers)))))
