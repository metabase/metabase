(ns metabase.lib.test-util.data-readers
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(defn opts [m]
  (u/assoc-default m :lib/uuid (str (random-uuid))))

(defn id [symb]
  (let [parts (filter seq (str/split (str symb) #"\."))]
    (cons `metabase.lib.test-metadata/id (map keyword parts))))

(defn field [symb]
  [:field (opts {}) (id symb)])
