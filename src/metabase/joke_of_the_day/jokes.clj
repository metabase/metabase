(ns metabase.joke-of-the-day.jokes
  (:require
   [clojure.java.io :as io]
   [metabase.release-flags.core :as release-flags]
   [metabase.util.json :as json]))

(defn jokes
  "Returns the collection of jokes from jokes.json."
  []
  (json/decode (slurp (io/resource "jokes.json"))))

;; guard-namespace! must be called at the end, after all functions are defined.
;; Add functions above this line.

(release-flags/guard-namespace! "joke-of-the-day")
