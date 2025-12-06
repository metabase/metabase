(ns test-compile
  (:require [metabase.driver.google-sheets :as gs]
            [metabase.driver.google-sheets.api :as gs-api]
            [metabase.driver.google-sheets.comments :as comments]))

(defn test-compile []
  (println "Testing Google Sheets driver compilation...")
  (println "Driver namespace loaded successfully.")
  (println "API namespace loaded successfully.")
  (println "Comments namespace loaded successfully.")
  (println "All namespaces compiled successfully!"))

(test-compile)