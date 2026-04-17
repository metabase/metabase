(ns metabase.flarg.joke-of-the-day.jokes
  (:require
   [clojure.java.io :as io]
   [metabase.util.json :as json]))

(defn jokes
  "Returns the collection of jokes from jokes.json."
  []
  (json/decode (slurp (io/resource "jokes.json"))))
