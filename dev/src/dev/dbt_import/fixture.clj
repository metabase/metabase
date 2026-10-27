(ns dev.dbt-import.fixture
  "Regenerates `dev/resources/dbt_import/flexanalytics_manifest.json`, the converter's test fixture, from a checkout
  of https://github.com/flexanalytics/dbt-business-intelligence. Not something that runs regularly: only when the
  checkout, the extra metrics or the trimming change.

  [[regenerate!]] copies the checkout to a scratch directory, splices the metrics in
  `flexanalytics_extra_metrics.yml` into its `models/semantic_models.yml` (the project only defines simple metrics),
  runs `dbt parse` there and trims the resulting `target/manifest.json` to the sections the converter reads:

  * `metadata`: `dbt_schema_version`, `dbt_version`, `project_name`, `adapter_type`, `generated_at`
  * `nodes`: the project's own model nodes, each reduced to its identity, relation and columns (`name`, `description`,
    `data_type`)
  * `semantic_models` and `metrics`: whole

  The checkout itself is never modified. dbt runs through `uvx` unless a `dbt` is on `PATH`; see the README for the
  `profiles.yml` it needs. JSON goes through Jackson directly rather than [[metabase.util.json]] so that key order
  survives the round trip and the file is written the way `dbt` writes it (one-space indent, non-ASCII escaped,
  floats as they were), which keeps a regeneration's diff down to what changed. Run from a REPL at the repo root:

    (dev.dbt-import.fixture/regenerate!)
    (dev.dbt-import.fixture/regenerate! {:project \"/path/to/dbt-business-intelligence\"})"
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (com.fasterxml.jackson.core JsonFactory StreamWriteFeature)
   (com.fasterxml.jackson.core.json JsonWriteFeature)
   (com.fasterxml.jackson.core.util DefaultIndenter DefaultPrettyPrinter Separators Separators$Spacing)
   (com.fasterxml.jackson.databind DeserializationFeature ObjectMapper)
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.util LinkedHashMap Map)))

(set! *warn-on-reflection* true)

(def ^:private fixture-filename "dev/resources/dbt_import/flexanalytics_manifest.json")
(def ^:private extra-metrics-filename "dev/resources/dbt_import/flexanalytics_extra_metrics.yml")
(def ^:private metrics-yaml "models/semantic_models.yml")

(def ^:private metadata-keys ["dbt_schema_version" "dbt_version" "project_name" "adapter_type" "generated_at"])
(def ^:private node-keys ["unique_id" "resource_type" "name" "database" "schema" "alias" "relation_name" "description" "columns"])
(def ^:private column-keys ["name" "description" "data_type"])

(mu/defn- copy-project
  "Copy the tracked files of the checkout at `project`, plus its installed packages so `dbt deps` need not run, into
  `scratch`."
  [^File project :- (ms/InstanceOfClass File)
   ^File scratch :- (ms/InstanceOfClass File)]
  (let [{:keys [exit out err]} (sh/sh "git" "-C" (.getPath project) "ls-files" "-z")]
    (when-not (zero? exit)
      (throw (ex-info (str "git ls-files failed: " err) {:project project})))
    (doseq [relative (remove str/blank? (str/split out #"\u0000"))
            :let     [target (io/file scratch relative)]]
      (io/make-parents target)
      (io/copy (io/file project relative) target)))
  (doseq [extra ["dbt_packages" "package-lock.yml"]
          :let  [source (io/file project extra)]
          ^File f (file-seq source)
          :when (.isFile f)
          :let  [target (io/file scratch (str (.relativize (.toPath project) (.toPath f))))]]
    (io/make-parents target)
    (io/copy f target)))

(mu/defn- splice-metrics :- :string
  "`yaml` with `extra` appended to its top-level `metrics:` list: before the next top-level key, or at the end."
  [yaml  :- :string
   extra :- :string]
  (let [matcher (re-matcher #"(?m)^metrics:\n" yaml)]
    (when-not (.find matcher)
      (throw (ex-info (str metrics-yaml " has no top-level metrics: key") {})))
    (let [after-metrics (.end matcher)
          following     (re-matcher #"(?m)^\S" (subs yaml after-metrics))
          insert-at     (if (.find following) (+ after-metrics (.start following)) (count yaml))
          yaml          (cond-> yaml (not (str/ends-with? yaml "\n")) (str "\n"))]
      (str (subs yaml 0 insert-at) extra (subs yaml insert-at)))))

(defn- dbt-command []
  (cond
    (zero? (:exit (sh/sh "sh" "-c" "command -v dbt"))) ["dbt"]
    (zero? (:exit (sh/sh "sh" "-c" "command -v uvx"))) ["uvx" "--from" "dbt-core" "--with" "dbt-postgres" "dbt"]
    :else (throw (ex-info "neither dbt nor uvx is on PATH; see the README" {}))))

(mu/defn- dbt!
  "Run `dbt <subcommand>` in `scratch`, failing with its output when it does."
  [^File scratch :- (ms/InstanceOfClass File)
   subcommand    :- :string]
  (let [{:keys [exit out err]} (apply sh/sh (concat (dbt-command) [subcommand "--no-use-colors" :dir scratch]))]
    (when-not (zero? exit)
      (throw (ex-info (format "dbt %s failed (exit %d)" subcommand exit) {:out out, :err err})))))

(def ^:private reader
  "Reads JSON objects as `LinkedHashMap`s, so key order is kept, and floats as `BigDecimal`s, so they are written back
  as they were."
  (doto (ObjectMapper.)
    (.enable DeserializationFeature/USE_BIG_DECIMAL_FOR_FLOATS)))

(def ^:private writer
  "Writes JSON the way Python's `json.dump(indent=1)`, which `dbt` uses, does."
  (let [indenter   (DefaultIndenter. " " "\n")
        separators (-> (Separators/createDefaultInstance)
                       (.withObjectFieldValueSpacing Separators$Spacing/AFTER)
                       (.withObjectEmptySeparator "")
                       (.withArrayEmptySeparator ""))
        printer    (-> (DefaultPrettyPrinter.)
                       (.withObjectIndenter indenter)
                       (.withArrayIndenter indenter)
                       (.withSeparators separators))
        factory    (-> (JsonFactory/builder)
                       (.enable JsonWriteFeature/ESCAPE_NON_ASCII)
                       (.enable StreamWriteFeature/WRITE_BIGDECIMAL_AS_PLAIN)
                       .build)]
    (.writer (ObjectMapper. ^JsonFactory factory) printer)))

(defn- pick
  "A new ordered map of the entries of `m` whose keys are in `ks`, in that order."
  ^Map [^Map m ks]
  (let [picked (LinkedHashMap.)]
    (doseq [k ks
            :when (.containsKey m k)]
      (.put picked k (.get m k)))
    picked))

(defn- trim-node ^Map [^Map node]
  (let [trimmed (pick node node-keys)
        columns (LinkedHashMap.)]
    (doseq [[column-name column] ^Map (.get node "columns")]
      (.put columns column-name (pick column column-keys)))
    (.put trimmed "columns" columns)
    trimmed))

(defn- trim-manifest
  "The sections of a decoded manifest the converter reads, see the namespace docstring."
  ^Map [^Map manifest]
  (let [metadata     ^Map (.get manifest "metadata")
        project-name (.get metadata "project_name")
        nodes        (LinkedHashMap.)
        trimmed      (LinkedHashMap.)]
    (doseq [[node-id ^Map node] ^Map (.get manifest "nodes")
            :when (and (= "model" (.get node "resource_type"))
                       (= project-name (.get node "package_name")))]
      (.put nodes node-id (trim-node node)))
    (doto trimmed
      (.put "metadata" (pick metadata metadata-keys))
      (.put "nodes" nodes)
      (.put "semantic_models" (.get manifest "semantic_models"))
      (.put "metrics" (.get manifest "metrics")))))

(defn- delete-recursively! [^File dir]
  (run! io/delete-file (reverse (file-seq dir))))

(mu/defn regenerate! :- :string
  "Regenerate the fixture (see the namespace docstring) from the checkout at `:project` (default
  `~/dbt-business-intelligence`), writing it to `:out` (default the fixture itself). Returns a one-line summary of what
  was written."
  ([]
   (regenerate! {}))

  ([{:keys [project out]
     :or   {project (str (System/getProperty "user.home") "/dbt-business-intelligence")
            out     fixture-filename}}
    :- [:map {:closed true}
        [:project {:optional true} :string]
        [:out     {:optional true} :string]]]
   (let [project (io/file project)]
     (when-not (.isFile (io/file project "dbt_project.yml"))
       (throw (ex-info (str project " is not a dbt project; pass :project") {})))
     (let [scratch (.toFile (Files/createTempDirectory "dbt-import-fixture" (make-array FileAttribute 0)))]
       (try
         (copy-project project scratch)
         (let [yaml-file (io/file scratch metrics-yaml)]
           (spit yaml-file (splice-metrics (slurp yaml-file) (slurp extra-metrics-filename))))
         (when-not (.isDirectory (io/file scratch "dbt_packages"))
           (dbt! scratch "deps"))
         (dbt! scratch "parse")
         (let [manifest ^Map (.readValue reader (io/file scratch "target" "manifest.json") Map)
               metrics  ^Map (.get manifest "metrics")]
           (.writeValue writer (io/file out) (trim-manifest manifest))
           (format "wrote %s: %d metrics (%s)" out (.size metrics)
                   (str/join ", " (sort (into #{} (map #(.get ^Map % "type")) (.values metrics))))))
         (finally
           (delete-recursively! scratch)))))))
