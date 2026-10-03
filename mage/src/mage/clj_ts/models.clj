(ns mage.clj-ts.models
  "Which application-database table each Toucan model (`:model/Card`) lives in, found by scanning the source for
  `(methodical/defmethod t2/table-name :model/X [_model] :table_name)`."
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private table-name-re
  #"\(methodical/defmethod\s+t2/table-name\s+:model/([A-Za-z0-9_.\-]+)\s+\[[^\]]*\]\s+:([A-Za-z0-9_]+)\s*\)")

(defn- scan [dirs]
  (into {}
        (for [dir  dirs
              :when (fs/exists? dir)
              f    (fs/glob dir "**.{clj,cljc}")
              :let [text (slurp (str f))]
              :when (str/includes? text "t2/table-name")
              [_ model table] (re-seq table-name-re text)]
          [model table])))

(def ^:private model->table*
  (delay (scan ["src" "enterprise/backend/src"])))

(defn table-for
  "The table name for model name `model` (e.g. \"Card\" -> \"report_card\"), or nil if unknown."
  [model]
  (get @model->table* model))
