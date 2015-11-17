(ns metabase.test.data.dataset-definitions
  "Definitions of various datasets for use in tests with `with-temp-db`."
  (:require [clojure.tools.reader.edn :as edn]
            [metabase.test.data.interface :refer [def-database-definition]]))


;; ## Datasets

(def ^:private ^:const edn-definitions-dir "./test/metabase/test/data/dataset_definitions/")

;; TODO - move this to interface
;; TODO - make rows be lazily loadable for DB definitions from a file
(defmacro ^:private def-database-definition-edn [dbname]
  `(def-database-definition ~(vary-meta dbname assoc :const true)
     ~@(edn/read-string (slurp (str edn-definitions-dir (name dbname) ".edn")))))

;; The O.G. "Test Database" dataset
(def-database-definition-edn test-data)

;; Times when the Toucan cried
(def-database-definition-edn sad-toucan-incidents)

;; Places, times, and circumstances where Tupac was sighted
(def-database-definition-edn tupac-sightings)

(def-database-definition-edn geographical-tips)

;; A very tiny dataset with a list of places and a booleans
(def-database-definition-edn places-cam-likes)
