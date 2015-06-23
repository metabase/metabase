(ns metabase.test.data.dataset-definitions
  "Definitions of various datasets for use in tests with `with-temp-db`."
  (:require [clojure.tools.reader.edn :as edn]
            [metabase.test.data.interface :refer [def-database-definition]]))

;; ## Helper Functions

(defn- unix-timestamp-ms
  "Create a Unix timestamp (in milliseconds).

     (unix-timestamp-ms :year 2012 :month 12 :date 27)"
  ^Long [& {:keys [year month date hour minute second nano]
            :or   {year 0, month 1, date 1, hour 0, minute 0, second 0, nano 0}}]
  (-> (java.sql.Timestamp. (- year 1900) (- month 1) date hour minute second nano)
      .getTime
      long)) ; coerce to long since Korma doesn't know how to insert bigints


(defn- unix-timestamp
  "Create a Unix timestamp, in seconds."
  ^Long [& args]
  (/ (apply unix-timestamp-ms args) 1000))


;; ## Datasets

(def ^:private ^:const edn-definitions-dir "./test/metabase/test/data/dataset_definitions/")

;; TODO - move this to interface
;; TODO - make rows be lazily loadable for DB definitions from a file
(defmacro ^:private def-database-definition-edn [dbname]
  `(def-database-definition ~dbname
     (edn/read-string (slurp ~(str edn-definitions-dir (name dbname) ".edn")))))

;; Times when the Toucan cried
(def-database-definition-edn sad-toucan-incidents)
