(ns metabase-enterprise.semantic-layer-import.cmd
  "The semantic layer import's command-line entry points, run from the Metabase JAR (see [[metabase.cmd.core]])."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]))

(set! *warn-on-reflection* true)

(defn- ensure!
  "Returns `value` if it satisfies `pred`. Otherwise prints `message` and makes the command exit 1, with no stack trace
  (`:cmd/exit`, see [[metabase.cmd.core/run-cmd]])."
  [value pred message]
  (when-not (pred value)
    ;; the terminal is this command's user interface, not the log
    #_{:clj-kondo/ignore [:discouraged-var]}
    (binding [*out* *err*]
      (println message)
      (println "  got:" (pr-str value)))
    (throw (ex-info message {:cmd/exit true, :value value})))
  value)

(defn- file? [path]
  (and (string? path) (.isFile (io/file path))))

(defn- databases? [m]
  (and (map? m) (seq m) (every? string? (vals m))))

(defn dbt-export!
  "Runs [[semantic-layer-import/convert!]] on a dbt project, with the map it takes read from the EDN file at `path`, and
  prints its report. Needs no running Metabase."
  [path]
  (ensure! path file? "usage: java -jar metabase.jar dbt-export FILE.edn")
  (let [payload                                  (ensure! (edn/read-string (slurp path)) map?
                                                          (str path " must contain a map"))
        {:keys [type raw out-dir config]}        payload
        {:keys [databases driver creator-email]} (ensure! config map? ":config must be a map")]
    (ensure! type #{:dbt} ":type must be :dbt")
    (ensure! raw file? ":raw must be the path to dbt's target/manifest.json")
    (ensure! out-dir string? ":out-dir must be the directory to write to")
    (ensure! databases databases?
             ":databases must map dbt's database name to the name in Metabase, like {\"warehouse\" \"My Warehouse\"}")
    (ensure! driver keyword? ":driver must be a keyword, like :postgres")
    (ensure! creator-email string? ":creator-email must be the email of a user in your instance")
    (let [report (semantic-layer-import/convert! payload)]
      ;; the report is this command's output, not a log message
      #_{:clj-kondo/ignore [:discouraged-var]}
      (pprint/pprint report)
      report)))
