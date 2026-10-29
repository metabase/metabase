(ns dev.dbt-import.fixture
  "Regenerates the converter's manifest fixtures under `dev/resources/dbt_import/`, see [[fixtures]]. Not something
  that runs regularly: only when a project, the extra metrics or the trimming change.

  * `flexanalytics_manifest.json`, from a checkout of https://github.com/flexanalytics/dbt-business-intelligence, a
    project on the legacy spec (top-level `semantic_models:` with `measures:` and `metrics:` pointing at them), with
    the metrics in `flexanalytics_extra_metrics.yml` spliced into its `models/semantic_models.yml` because the project
    only defines simple metrics.
  * `parcel_delivery_manifest.json`, from the small project checked in under `parcel_delivery/`, written on the dbt
    1.12 inline spec (`semantic_model:` nested under `models:`, entities and dimensions on `columns:`, metrics with
    their own `agg` and `expr`). It is what the inline spec looks like in a manifest.

  [[regenerate!]] copies the project to a scratch directory with a `profiles.yml` of its own (see
  [[with-scratch-project]]; `dbt parse` needs a profile for the adapter and the warehouse database name, but never
  connects), runs `dbt parse` and trims the resulting `target/manifest.json` to the sections the converter reads:

  * `metadata`: `dbt_schema_version`, `dbt_version`, `project_name`, `adapter_type`, `generated_at`
  * `nodes`: the project's own model nodes and every node a semantic model depends on (a seed or a snapshot, or a
    package's model: where [[dev.dbt-import.parse]] looks for the columns), each reduced to its identity, relation and
    columns (`name`, `description`, `data_type`)
  * `semantic_models` and `metrics`: whole

  The project itself is never modified. dbt runs through `uvx`, pinned to [[dbt-version]], or failing that as whatever
  `dbt` is on `PATH`, and the manifest's `dbt_version` is checked afterwards; the user's own `DBT_*` environment
  variables are kept out of the run. JSON goes through Jackson
  directly rather than [[metabase.util.json]] so that key order survives the round trip and the file is written the
  way Python's `json.dumps(indent=1)` would (one-space indent, non-ASCII escaped, floats as they were), which keeps a
  regeneration's diff down to what changed. Run from a REPL at the repo root:

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
   (java.util LinkedHashMap Map)
   (org.apache.commons.io FileUtils)))

(set! *warn-on-reflection* true)

(deftype Secret [value]
  Object
  (toString [_] "<redacted>"))

(defmethod print-method Secret
  [_ ^java.io.Writer w]
  (.write w "#secret <redacted>"))

(mr/def ::secret
  "A string that prints redacted, for a password: a schema check that fails on a map around it puts the whole map in the
  exception's data, which lands in the REPL and the log."
  (ms/InstanceOfClass Secret))

(mu/defn secret :- ::secret
  "Wrap `s`, a password, so that it prints redacted; [[reveal]] gets it back."
  [s :- :string]
  (Secret. s))

(mu/defn reveal :- :string
  "The string a [[secret]] wraps."
  [^Secret s :- ::secret]
  (.-value s))

(def ^:private resources-dir "dev/resources/dbt_import")

(mu/defn check-repo-root! :- :nil
  "Throw unless the working directory is the repo root, which the relative paths in [[fixtures]] and in
  [[dev.dbt-import.marts]] assume; a REPL started elsewhere would otherwise fail halfway, or write somewhere else."
  []
  (when-not (.isDirectory (io/file resources-dir))
    (throw (ex-info (format "%s is not under the working directory %s: run from the repo root"
                            resources-dir (System/getProperty "user.dir"))
                    {:user-dir (System/getProperty "user.dir")}))))

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

(mr/def ::connection
  "A Postgres connection for a project's `profiles.yml`: the warehouse dbt builds in, or, for a `dbt parse` that never
  connects, nonsense around the database name the manifest should record."
  [:map {:closed true}
   [:host     :string]
   [:port     :int]
   [:user     :string]
   [:password [:maybe ::secret]]
   [:dbname   :string]])

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
(def ^:private node-keys
  ["unique_id" "resource_type" "name" "database" "schema" "alias" "relation_name" "description" "columns"])
(def ^:private column-keys ["name" "description" "data_type"])

(mu/defn- copy-relative :- :nil
  "Copy `f`, under `project`, to the same relative path under `scratch`."
  [^File project :- (ms/InstanceOfClass File)
   ^File scratch :- (ms/InstanceOfClass File)
   ^File f       :- (ms/InstanceOfClass File)]
  (let [target (io/file scratch (str (.relativize (.toPath project) (.toPath f))))]
    (io/make-parents target)
    (io/copy f target)))

(mu/defn- git-files :- [:sequential (ms/InstanceOfClass File)]
  "The files of the git checkout at `project`: the tracked ones (`--cached`, which also lists a file deleted from the
  working tree but not from the index) and the untracked ones that are not ignored (`--others --exclude-standard`),
  minus whatever is not a file, such as that deleted one or a submodule; plus the installed packages, which are
  ignored, so that `dbt deps` need not run."
  [^File project :- (ms/InstanceOfClass File)]
  (let [{:keys [exit out err]} (sh/sh "git" "-C" (.getPath project)
                                      "ls-files" "-z" "--cached" "--others" "--exclude-standard")]
    (when-not (zero? exit)
      (throw (ex-info (format "git ls-files failed: %s" err) {:project project})))
    (concat (for [relative (remove str/blank? (str/split out #"\u0000"))
                  :let     [^File f (io/file project relative)]
                  :when    (.isFile f)]
              f)
            (for [extra   ["dbt_packages" "package-lock.yml"]
                  ^File f (file-seq (io/file project extra))
                  :when   (.isFile f)]
              f))))

(mu/defn copy-project :- :nil
  "Copy the dbt project at `project` into `scratch`: a git checkout's files (see [[git-files]]) or every file of a plain
  directory, either way without what dbt itself writes (`target`, `logs`)."
  [^File project :- (ms/InstanceOfClass File)
   ^File scratch :- (ms/InstanceOfClass File)]
  (let [generated (into #{} (map #(.toPath (io/file project %))) ["target" "logs"])
        files     (if (.exists (io/file project ".git"))
                    (git-files project)
                    (filter #(.isFile ^File %) (file-seq project)))]
    (doseq [^File f files
            :when   (not-any? #(.startsWith (.toPath f) ^java.nio.file.Path %) generated)]
      (copy-relative project scratch f))))

(mu/defn- profile-name :- :string
  "The `profile:` a dbt project asks for."
  [^File project :- (ms/InstanceOfClass File)]
  (or (second (re-find #"(?m)^profile:\s*['\"]?([^'\"\n]+?)['\"]?\s*$" (slurp (io/file project "dbt_project.yml"))))
      (throw (ex-info "dbt_project.yml names no profile" {:project project}))))

(mu/defn- profiles-yaml :- :string
  "A `profiles.yml` with one Postgres profile, `profile`, pointing dbt at `connection` and building in schema
  `public`, as the README's does."
  [profile                                  :- :string
   {:keys [host port user password dbname]} :- ::connection]
  (str/join "\n" [(str profile ":")
                  "  target: dev"
                  "  outputs:"
                  "    dev:"
                  "      type: postgres"
                  (str "      host: " host)
                  (str "      port: " port)
                  (str "      user: " user)
                  (str "      password: " (pr-str (if password (reveal password) "")))
                  (str "      dbname: " dbname)
                  "      schema: public"
                  "      threads: 4"
                  ""]))

(mu/defn- write-profile! :- :nil
  "Write a `profiles.yml` for `project` into `profiles-dir`, pointing dbt at `connection` (see [[profiles-yaml]]),
  so macros resolve against the Postgres adapter and relations are written in that database."
  [^File project      :- (ms/InstanceOfClass File)
   ^File profiles-dir :- (ms/InstanceOfClass File)
   connection         :- ::connection]
  (.mkdirs profiles-dir)
  (spit (io/file profiles-dir "profiles.yml") (profiles-yaml (profile-name project) connection)))

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

(def dbt-version
  "The dbt release the fixtures are generated with, and the only one [[regenerate!]] accepts: a manifest changes from
  release to release, and so would the fixtures, and the tests that pin what is in them, with whatever dbt happened to
  be installed."
  "1.12.6")

(mu/defn- on-path? :- :boolean
  [command :- :string]
  (zero? (:exit (sh/sh "sh" "-c" (str "command -v " command)))))

(mu/defn- dbt-command :- [:sequential :string]
  "The command that runs dbt, given which of `uvx` and `dbt` are `available`: `uvx` with `dbt-core` pinned to
  [[dbt-version]] when it is, otherwise `dbt` itself, whatever version that is, which [[check-dbt-version!]] catches
  after the parse."
  [available :- [:set :string]]
  (cond
    (available "uvx") ["uvx" "--from" (str "dbt-core==" dbt-version) "--with" "dbt-postgres" "dbt"]
    (available "dbt") ["dbt"]
    :else             (throw (ex-info "neither uvx nor dbt is on PATH; see the README" {}))))

(mu/defn- dbt-env :- [:map-of :string :string]
  "The environment dbt runs in: `env` without any `DBT_*` variable of the user's (a `DBT_PROFILES_DIR`,
  `DBT_PROJECT_DIR` or `DBT_TARGET_PATH` would send dbt somewhere other than the scratch copy), and `DBT_PROFILES_DIR`
  set to `profiles-dir`."
  [^File profiles-dir :- (ms/InstanceOfClass File)
   env                :- [:map-of :string :string]]
  (-> (into {} (remove (fn [[k _]] (str/starts-with? k "DBT_"))) env)
      (assoc "DBT_PROFILES_DIR" (.getPath profiles-dir))))

(mu/defn dbt! :- :nil
  "Run `dbt args...` in `scratch` with the profiles in `profiles-dir` (see [[dbt-env]]), failing with its output when
  it does."
  [^File scratch      :- (ms/InstanceOfClass File)
   ^File profiles-dir :- (ms/InstanceOfClass File)
   & args             :- [:* :string]]
  (let [command                (dbt-command (into #{} (filter on-path?) ["uvx" "dbt"]))
        env                    (dbt-env profiles-dir (into {} (System/getenv)))
        {:keys [exit out err]} (apply sh/sh (concat command args ["--no-use-colors" :dir scratch :env env]))]
    (when-not (zero? exit)
      (throw (ex-info (format "dbt %s failed (exit %d)" (str/join " " args) exit) {:out out, :err err})))))

(mu/defn with-scratch-project :- :any
  "Run `f` with a scratch copy of the dbt project at `project` (see [[copy-project]]) and a directory holding a
  `profiles.yml` for `connection` (see [[write-profile!]]), with the project's packages installed (`dbt deps`, unless
  the copy brought them along), as `(f scratch profiles-dir)`; the scratch directory is deleted afterwards, whatever
  happened. The project itself is never modified."
  [^File project :- (ms/InstanceOfClass File)
   connection    :- ::connection
   f             :- fn?]
  (when-not (.isFile (io/file project "dbt_project.yml"))
    (throw (ex-info (format "%s is not a dbt project; pass :project" project) {})))
  (let [scratch      (.toFile (Files/createTempDirectory "dbt-import-scratch" (make-array FileAttribute 0)))
        profiles-dir (io/file scratch ".profiles")]
    (try
      (copy-project project scratch)
      (write-profile! project profiles-dir connection)
      (when (and (.isFile (io/file scratch "packages.yml"))
                 (not (.isDirectory (io/file scratch "dbt_packages"))))
        (dbt! scratch profiles-dir "deps"))
      (f scratch profiles-dir)
      (finally
        (FileUtils/deleteDirectory scratch)))))

(def ^:private ^ObjectMapper reader
  "Reads JSON objects as `LinkedHashMap`s, so key order is kept, and floats as `BigDecimal`s, so they are written back
  as they were."
  (doto (ObjectMapper.)
    (.enable DeserializationFeature/USE_BIG_DECIMAL_FOR_FLOATS)))

(def ^:private ^ObjectWriter writer
  "Writes JSON the way Python's `json.dumps(indent=1)` does."
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

(mu/defn- pick :- (ms/InstanceOfClass Map)
  "A new ordered map of the entries of `m` whose keys are in `ks`, in that order."
  [^Map m :- (ms/InstanceOfClass Map)
   ks     :- [:sequential :string]]
  (let [picked (LinkedHashMap.)]
    (doseq [k ks
            :when (.containsKey m k)]
      (.put picked k (.get m k)))
    picked))

(mu/defn- trim-node :- (ms/InstanceOfClass Map)
  "`node` reduced to its identity, relation and columns, see the namespace docstring."
  [^Map node :- (ms/InstanceOfClass Map)]
  (let [^Map trimmed (pick node node-keys)
        columns      (LinkedHashMap.)]
    (doseq [[column-name column] ^Map (.get node "columns")]
      (.put columns column-name (pick column column-keys)))
    (.put trimmed "columns" columns)
    trimmed))

(mu/defn- check-dbt-version! :- :nil
  "Throw unless `metadata`, a parsed manifest's, says [[dbt-version]] wrote it."
  [^Map metadata :- (ms/InstanceOfClass Map)]
  (let [found (.get metadata "dbt_version")]
    (when-not (= dbt-version found)
      (throw (ex-info (format "the manifest was written by dbt %s, not the %s the fixtures are generated with"
                              found dbt-version)
                      {:dbt-version found, :expected dbt-version})))))

(mu/defn- trim-manifest :- (ms/InstanceOfClass Map)
  "The sections of a decoded manifest the converter reads, see the namespace docstring. Of the nodes, the project's own
  models and whatever a semantic model depends on, whichever package and resource type that is."
  [^Map manifest :- (ms/InstanceOfClass Map)]
  (let [metadata     ^Map (.get manifest "metadata")
        project-name (.get metadata "project_name")
        depended-on  (into #{}
                           (mapcat (fn [^Map semantic-model]
                                     (some-> ^Map (.get semantic-model "depends_on") (.get "nodes"))))
                           (.values ^Map (.get manifest "semantic_models")))
        nodes        (LinkedHashMap.)
        trimmed      (LinkedHashMap.)]
    (doseq [[node-id ^Map node] ^Map (.get manifest "nodes")
            :when (or (depended-on node-id)
                      (and (= "model" (.get node "resource_type"))
                           (= project-name (.get node "package_name"))))]
      (.put nodes node-id (trim-node node)))
    (doto trimmed
      (.put "metadata" (pick metadata metadata-keys))
      (.put "nodes" nodes)
      (.put "semantic_models" (.get manifest "semantic_models"))
      (.put "metrics" (.get manifest "metrics")))))

(mu/defn regenerate! :- :string
  "Regenerate the fixture `fixture-key` (see [[fixtures]]; default `:flexanalytics`), with `overrides` merged over its
  definition, e.g. `{:project \"/path/to/checkout\"}`. Returns a one-line summary of what was written."
  ([]
   (regenerate! :flexanalytics))

  ([fixture-key :- (into [:enum] (keys fixtures))]
   (regenerate! fixture-key {}))

  ([fixture-key :- (into [:enum] (keys fixtures))
    overrides   :- ::fixture-overrides]
   (check-repo-root!)
   (let [{:keys [project out database extra-metrics metrics-yaml] :as fixture} (merge (fixtures fixture-key) overrides)]
     (when-let [error (mr/explain ::fixture fixture)]
       (throw (ex-info "bad fixture definition" {:errors (me/humanize error)})))
     ;; `dbt parse` never connects, so everything but the database name is nonsense
     (with-scratch-project (io/file project)
       {:host "localhost", :port 5432, :user "nobody", :password (secret "nothing"), :dbname database}
       (fn [scratch profiles-dir]
         (when extra-metrics
           (let [yaml-file (io/file scratch metrics-yaml)]
             (spit yaml-file (splice-metrics (slurp yaml-file) (slurp extra-metrics)))))
         ;; `--target-path`: a `target-path` in the project's `dbt_project.yml` would put the manifest elsewhere
         (dbt! scratch profiles-dir "parse" "--target-path" "target")
         (let [manifest ^Map (.readValue reader (io/file scratch "target" "manifest.json") Map)
               metrics  ^Map (.get manifest "metrics")]
           (check-dbt-version! (.get manifest "metadata"))
           (.writeValue writer (io/file out) (trim-manifest manifest))
           (format "wrote %s: %d metrics (%s)" out (.size metrics)
                   (str/join ", " (sort (into #{} (map #(.get ^Map % "type")) (.values metrics)))))))))))
