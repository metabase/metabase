#!/usr/bin/env bb

(ns map-countries
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.java.shell :as shell]
            [clojure.string :as str]))

;; Configuration constants
(def ^:private config
  {:geojson-path "resources/frontend_client/app/assets/geojson/world.json"
   :template-path "bin/templates/country-codes-template.md"
   :output-path "docs/questions/visualizations/country-codes.md"
   :markdown-title "Country codes"
   :table-headers {:code "Country code" :name "Country name"}})

(defn- validate-country
  "Validate that a country entry has required fields."
  [{:keys [name code] :as country}]
  (and (string? name)
       (not (str/blank? name))
       (string? code)
       (= 2 (count code))
       (re-matches #"[A-Z]{2}" code)))

(defn- read-world-json
  "Read and parse the world.json file."
  [file-path]
  (try
    (if-not (.exists (io/file file-path))
      (throw (ex-info (str "GeoJSON file not found: " file-path)
                      {:type :file-not-found :path file-path})))

    (with-open [reader (io/reader file-path)]
      (json/parse-stream reader true))
    (catch Exception e
      (throw (ex-info (str "Failed to read or parse GeoJSON file: " file-path)
                      {:type :parse-error :path file-path :cause (.getMessage e)})))))

(defn- extract-countries
  "Extract and validate country data from GeoJSON features."
  [geojson]
  (when-not (map? geojson)
    (throw (ex-info "Invalid GeoJSON structure: expected map"
                    {:type :invalid-structure})))

  (when-not (sequential? (:features geojson))
    (throw (ex-info "Invalid GeoJSON structure: missing or invalid features"
                    {:type :invalid-features})))

  (let [countries (->> (:features geojson)
                       (map :properties)
                       (map (fn [{:keys [NAME ISO_A2]}]
                              {:name NAME :code ISO_A2}))
                       (filter validate-country)
                       (sort-by :code))
        invalid-count (- (count (:features geojson)) (count countries))]

    (when (pos? invalid-count)
      (println (format "Skipped %d entries with invalid or missing data" invalid-count)))

    (when (empty? countries)
      (throw (ex-info "No valid countries found in GeoJSON"
                      {:type :no-valid-countries})))

    countries))

(defn- format-markdown-table
  "Format countries as a Markdown table with given headers."
  [countries {:keys [code name] :as headers}]
  (let [header (format "| %s | %s |" code name)
        separator "|----|----|"
        rows (map (fn [{country-code :code country-name :name}]
                    (format "| %s | %s |" country-code country-name))
                  countries)]
    (->> (concat [header separator] rows)
         (str/join "\n"))))

(defn- read-template
  "Read markdown template file."
  [template-path]
  (try
    (if-not (.exists (io/file template-path))
      (throw (ex-info (str "Template file not found: " template-path)
                      {:type :template-not-found :path template-path})))
    (slurp template-path)
    (catch Exception e
      (throw (ex-info (str "Failed to read template file: " template-path)
                      {:type :template-read-error :path template-path :cause (.getMessage e)})))))

(defn- replace-template-placeholders
  "Replace placeholders in template with actual values."
  [template {:keys [title country-count countries-table]}]
  (-> template
      (str/replace "{{title}}" title)
      (str/replace "{{country_count}}" (str country-count))
      (str/replace "{{countries_table}}" countries-table)))

(defn- generate-markdown-content
  "Generate complete Markdown documentation from template with replacements."
  [template-path countries-table country-count title]
  (let [template (read-template template-path)
        replacements {:title title
                      :country-count country-count
                      :countries-table countries-table}]
    (replace-template-placeholders template replacements)))

(defn- write-markdown-file
  "Write markdown content to file, creating parent directories if needed."
  [content output-path]
  (try
    (io/make-parents output-path)
    (spit output-path content)
    (println (format "Written to: %s" output-path))
    (catch Exception e
      (throw (ex-info (str "Failed to write file: " output-path)
                      {:type :write-error :path output-path :cause (.getMessage e)})))))

(defn- format-with-prettier
  "Format the file with prettier if available."
  [file-path]
  (try
    (let [{:keys [exit out err]} (shell/sh "npx" "prettier" "--write" file-path)]
      (if (= exit 0)
        (println "Formatted with prettier")
        (println (format "Prettier warning: %s" (str/trim err)))))
    (catch Exception e
      (println (format "Could not run prettier: %s" (.getMessage e)))
      (println "  File generated successfully but not formatted"))))

(defn- generate-country-docs
  "Core logic to generate country documentation from GeoJSON data."
  [{:keys [geojson-path template-path output-path markdown-title table-headers]}]
  (let [geojson (read-world-json geojson-path)
        countries (extract-countries geojson)
        countries-table (format-markdown-table countries table-headers)
        markdown-content (generate-markdown-content template-path
                                                    countries-table
                                                    (count countries)
                                                    markdown-title)]
    (write-markdown-file markdown-content output-path)
    (println (format "Generated country codes reference with %d countries" (count countries)))
    (format-with-prettier output-path)
    {:countries-count (count countries) :output-path output-path}))

(defn -main
  "Generate country code documentation from GeoJSON world map data.
  
  This script:
  1. Reads the world.json GeoJSON file
  2. Extracts country names and ISO codes
  3. Validates the data quality
  4. Generates a Markdown reference table
  5. Reads the markdown template file
  6. Replaces template placeholders with actual data
  7. Writes the documentation file
  8. Formats it with prettier (if available)"
  [& args]
  (try
    (let [result (generate-country-docs config)]
      (println "Country documentation generated successfully!")
      result)
    (catch Exception e
      (let [error-data (ex-data e)]
        (println "Error generating country documentation:")
        (println (str "  " (.getMessage e)))
        (when error-data
          (println (str "  Type: " (:type error-data)))
          (when (:path error-data)
            (println (str "  Path: " (:path error-data)))))
        (System/exit 1)))))

;; Auto-run when executed directly
(when (= *file* (System/getProperty "babashka.file"))
  (-main))