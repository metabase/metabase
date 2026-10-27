(ns dev.dbt-import.fixture
  "Regenerates the converter's manifest fixtures under `dev/resources/dbt_import/`, see [[fixtures]]. Not something
  that runs regularly: only when a project, the extra metrics or the trimming change.

  * `flexanalytics_manifest.json`, from a checkout of https://github.com/flexanalytics/dbt-business-intelligence, a
    project on the legacy spec (top-level `semantic_models:` with `measures:` and `metrics:` pointing at them), with
    the metrics in `flexanalytics_extra_metrics.yml` spliced into its `models/semantic_models.yml` because the project
    only defines simple metrics.
  * `parcel_delivery_manifest.json`, from the small project checked in under `parcel_delivery/`, written on the dbt
    1.12 inline spec (`semantic_model:` nested under `models:`, entities and dimensions on `columns:`, metrics with
    their own `agg` and `expr`). It is what the inline spec looks like in a manifest, QRES-6.

  [[regenerate!]] copies the project to a scratch directory, writes a `profiles.yml` there (`dbt parse` needs a
  profile for the adapter and the warehouse database name, but never connects), runs `dbt parse` and trims the
  resulting `target/manifest.json` to the sections the converter reads:

  * `metadata`: `dbt_schema_version`, `dbt_version`, `project_name`, `adapter_type`, `generated_at`
  * `nodes`: the project's own model nodes, each reduced to its identity, relation and columns (`name`, `description`,
    `data_type`)
  * `semantic_models` and `metrics`: whole

  The project itself is never modified. dbt runs through `uvx` unless a `dbt` is on `PATH`. JSON goes through Jackson
  directly rather than [[metabase.util.json]] so that key order survives the round trip and the file is written the
  way `dbt` writes it (one-space indent, non-ASCII escaped, floats as they were), which keeps a regeneration's diff
  down to what changed. Run from a REPL at the repo root:

    (dev.dbt-import.fixture/regenerate! :parcel-delivery)
    (dev.dbt-import.fixture/regenerate! :flexanalytics)
    (dev.dbt-import.fixture/regenerate! :flexanalytics {:project \"/path/to/dbt-business-intelligence\"})"
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (com.fasterxml.jackson.core JsonFactory StreamWriteFeature)
   (com.fasterxml.jackson.core.json JsonWriteFeature)
   (com.fasterxml.jackson.core.util DefaultIndenter DefaultPrettyPrinter Separators Separators$Spacing)
   (com.fasterxml.jackson.databind DeserializationFeature ObjectMapper ObjectWriter)
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.util LinkedHashMap Map)))

(set! *warn-on-reflection* true)

(mr/def ::fixture
  "How one fixture is generated: the dbt `:project` directory, the `:out` file, the warehouse `:database` the profile
  names (the manifest records it as every relation's database, so the tests and the end-to-end dataset depend on it)
  and, optionally, a file of `:extra-metrics` YAML to splice into the project's `:metrics-yaml`."
  [:map {:closed true}
   [:project       :string]
   [:out           :string]
   [:database      :string]
   [:extra-metrics {:optional true} :string]
   [:metrics-yaml  {:optional true} :string]])

(mr/def ::fixture-overrides
  "Any part of a `::fixture` definition, to override."
  [:map {:closed true}
   [:project       {:optional true} :string]
   [:out           {:optional true} :string]
   [:database      {:optional true} :string]
   [:extra-metrics {:optional true} :string]
   [:metrics-yaml  {:optional true} :string]])

(def fixtures
  "The fixtures, see the namespace docstring."
  {:flexanalytics   {:project       (str (System/getProperty "user.home") "/dbt-business-intelligence")
                     :out           "dev/resources/dbt_import/flexanalytics_manifest.json"
                     :database      "dbt_bi"
                     :extra-metrics "dev/resources/dbt_import/flexanalytics_extra_metrics.yml"
                     :metrics-yaml  "models/semantic_models.yml"}
   :parcel-delivery {:project  "dev/resources/dbt_import/parcel_delivery"
                     :out      "dev/resources/dbt_import/parcel_delivery_manifest.json"
                     :database "parcels"}})

(def ^:private metadata-keys ["dbt_schema_version" "dbt_version" "project_name" "adapter_type" "generated_at"])
(def ^:private node-keys ["unique_id" "resource_type" "name" "database" "schema" "alias" "relation_name" "description" "columns"])
(def ^:private column-keys ["name" "description" "data_type"])

(defn- copy-relative
  "Copy `f`, under `project`, to the same relative path under `scratch`."
  [^File project ^File scratch ^File f]
  (let [target (io/file scratch (str (.relativize (.toPath project) (.toPath f))))]
    (io/make-parents target)
    (io/copy f target)))

(mu/defn copy-project
  "Copy the dbt project at `project` into `scratch`: a git checkout's tracked files plus its installed packages, so
  `dbt deps` need not run, or every file of a plain directory except what dbt itself writes (`target`, `logs`)."
  [^File project :- (ms/InstanceOfClass File)
   ^File scratch :- (ms/InstanceOfClass File)]
  (if (.isDirectory (io/file project ".git"))
    (let [{:keys [exit out err]} (sh/sh "git" "-C" (.getPath project) "ls-files" "-z")]
      (when-not (zero? exit)
        (throw (ex-info (str "git ls-files failed: " err) {:project project})))
      (doseq [relative (remove str/blank? (str/split out #"\u0000"))]
        (copy-relative project scratch (io/file project relative)))
      (doseq [extra ["dbt_packages" "package-lock.yml"]
              ^File f (file-seq (io/file project extra))
              :when (.isFile f)]
        (copy-relative project scratch f)))
    (let [generated (into #{} (map #(.toPath (io/file project %))) ["target" "logs"])]
      (doseq [^File f (file-seq project)
              :when (and (.isFile f)
                         (not-any? #(.startsWith (.toPath f) ^java.nio.file.Path %) generated))]
        (copy-relative project scratch f)))))

(mu/defn- profile-name :- :string
  "The `profile:` a dbt project asks for."
  [^File project :- (ms/InstanceOfClass File)]
  (or (second (re-find #"(?m)^profile:\s*['\"]?([^'\"\n]+?)['\"]?\s*$" (slurp (io/file project "dbt_project.yml"))))
      (throw (ex-info "dbt_project.yml names no profile" {:project project}))))

(mu/defn- write-profile!
  "Write a `profiles.yml` for `project` into `profiles-dir`: a Postgres profile naming `database`, so macros resolve
  against the Postgres adapter and relations are written in that database. Nothing connects to it, so the host and
  credentials are nonsense."
  [^File project      :- (ms/InstanceOfClass File)
   ^File profiles-dir :- (ms/InstanceOfClass File)
   database           :- :string]
  (.mkdirs profiles-dir)
  (spit (io/file profiles-dir "profiles.yml")
        (str/join "\n" [(str (profile-name project) ":")
                        "  target: dev"
                        "  outputs:"
                        "    dev:"
                        "      type: postgres"
                        "      host: localhost"
                        "      port: 5432"
                        "      user: nobody"
                        "      password: nothing"
                        (str "      dbname: " database)
                        "      schema: public"
                        ""])))

(mu/defn- splice-metrics :- :string
  "`yaml` with `extra` appended to its top-level `metrics:` list: before the next top-level key, or at the end."
  [yaml  :- :string
   extra :- :string]
  (let [matcher (re-matcher #"(?m)^metrics:\n" yaml)]
    (when-not (.find matcher)
      (throw (ex-info "the metrics YAML has no top-level metrics: key" {})))
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

(mu/defn dbt!
  "Run `dbt args...` in `scratch` with the profiles in `profiles-dir`, failing with its output when it does."
  [^File scratch      :- (ms/InstanceOfClass File)
   ^File profiles-dir :- (ms/InstanceOfClass File)
   & args             :- [:* :string]]
  (let [env (assoc (into {} (System/getenv)) "DBT_PROFILES_DIR" (.getPath profiles-dir))
        {:keys [exit out err]} (apply sh/sh (concat (dbt-command) args ["--no-use-colors" :dir scratch :env env]))]
    (when-not (zero? exit)
      (throw (ex-info (format "dbt %s failed (exit %d)" (str/join " " args) exit) {:out out, :err err})))))

(def ^:private ^ObjectMapper reader
  "Reads JSON objects as `LinkedHashMap`s, so key order is kept, and floats as `BigDecimal`s, so they are written back
  as they were."
  (doto (ObjectMapper.)
    (.enable DeserializationFeature/USE_BIG_DECIMAL_FOR_FLOATS)))

(def ^:private ^ObjectWriter writer
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

(defn delete-recursively!
  "Delete `dir` and everything under it."
  [^File dir]
  (run! io/delete-file (reverse (file-seq dir))))

(mu/defn regenerate! :- :string
  "Regenerate the fixture `fixture-key` (see [[fixtures]]; default `:flexanalytics`), with `overrides` merged over its
  definition, e.g. `{:project \"/path/to/checkout\"}`. Returns a one-line summary of what was written."
  ([]
   (regenerate! :flexanalytics))

  ([fixture-key :- (into [:enum] (keys fixtures))]
   (regenerate! fixture-key {}))

  ([fixture-key :- (into [:enum] (keys fixtures))
    overrides   :- ::fixture-overrides]
   (let [{:keys [project out database extra-metrics metrics-yaml] :as fixture} (merge (fixtures fixture-key) overrides)
         project (io/file project)]
     (when-let [error (mr/explain ::fixture fixture)]
       (throw (ex-info "bad fixture definition" {:errors (me/humanize error)})))
     (when-not (.isFile (io/file project "dbt_project.yml"))
       (throw (ex-info (str project " is not a dbt project; pass :project") {})))
     (let [scratch      (.toFile (Files/createTempDirectory "dbt-import-fixture" (make-array FileAttribute 0)))
           profiles-dir (io/file scratch ".profiles")]
       (try
         (copy-project project scratch)
         (write-profile! project profiles-dir database)
         (when extra-metrics
           (let [yaml-file (io/file scratch metrics-yaml)]
             (spit yaml-file (splice-metrics (slurp yaml-file) (slurp extra-metrics)))))
         (when (and (.isFile (io/file scratch "packages.yml"))
                    (not (.isDirectory (io/file scratch "dbt_packages"))))
           (dbt! scratch profiles-dir "deps"))
         (dbt! scratch profiles-dir "parse")
         (let [manifest ^Map (.readValue reader (io/file scratch "target" "manifest.json") Map)
               metrics  ^Map (.get manifest "metrics")]
           (.writeValue writer (io/file out) (trim-manifest manifest))
           (format "wrote %s: %d metrics (%s)" out (.size metrics)
                   (str/join ", " (sort (into #{} (map #(.get ^Map % "type")) (.values metrics))))))
         (finally
           (delete-recursively! scratch)))))))
