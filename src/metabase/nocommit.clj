(ns metabase.nocommit
  (:require [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [clojure.java.shell :as sh]
            [clojure.tools.trace :as tr]
            [hiccup.core :as hiccup :refer [html]]
            [medley.core :as m]
            [metabase.models.card :refer [Card]]
            [metabase.pulse.render.style :as style]
            [metabase.query-processor :as qp]
            [metabase.query-processor.pivot :as qp.pivot]
            [toucan.db :as db]))

(defn write! [pivoted-rows]
  (with-open [writer (io/writer "pivoted-magic.csv")]
    (csv/write-csv writer pivoted-rows)))

  ;; --------------------------------
