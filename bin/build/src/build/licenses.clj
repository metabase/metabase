(ns build.licenses
  "Functionality to take a classpath and generate a file containing all libraries and their respective licenses.
  Intended to be called from from the command line like:

  clj -X mb.license/process :classpath a-classpath :output-filename a-filename

  or from clojure code like:
  ```
  (license/process {:classpath classpath
                    :backfill (edn/read-string (slurp (io/resource \"overrides.edn\")))
                    :output-filename (.getAbsolutePath output-file)
                    :report? false})
  ```

  Allows for optional backfill, either edn or a filename that is edn. Backfill should be of the form

  {\"group\" {\"artifact\" \"license text\"}
   \"group\" {\"artifact\" {:resource \"filename-of-license\"}}

  :override/group {\"group\" \"license\"
                   \"group\" {:resource \"filename-of-license\"}}
  }

  At the moment assumes a leiningen classpath which is primarily jars and your own source paths, so only detects
  license information from jars. In the future a strategy and heuristics could be determined for when source is
  available from local roots and git dependencies."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.build.api :as b])
  (:import
   (java.io StringReader)
   (java.nio.file Files FileSystem FileSystems LinkOption OpenOption Path Paths)
   (org.apache.maven.model License)
   (org.apache.maven.model.io.xpp3 MavenXpp3Reader)))

(set! *warn-on-reflection* true)

(def ^:private path-options (into-array String []))
(def ^:private link-options (into-array LinkOption []))
(def ^:private open-options (into-array OpenOption []))

(defn slurp-path
  "Open an inputstream on `path` and slurp the contents."
  [^Path path]
  (with-open [is (Files/newInputStream path open-options)]
    (slurp is)))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;     Protocols     ;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;;; pom->license. Handles strings and paths to poms
;;;; search for files. Handles paths (git deps) and file-systems (jar filesystem)

(defprotocol LicenseFromPom
  (-pom->license [_]
    "Return license information (if possible) from the pom.
Read license information from a pom. This reads only the local pom and does not trace parent poms."))

(defn license-from-pom
  "Get license information from a pom. Can be a path or a string (treated as the contents)."
  [pom]
  (-pom->license pom))

(defprotocol FileSearch
  (-file-search [_ files]
    "Find the first file matching the names passed in. Returns a Path."))

(extend-protocol LicenseFromPom
  Path
  (-pom->license [pom-path]
    (-pom->license (slurp-path pom-path)))

  String
  (-pom->license [pom-contents]
    (try
      (let [reader       (MavenXpp3Reader.)
            model        (.read reader (StringReader. pom-contents))
            license      ^License (first (.getLicenses model))]
        ;; if we can figure out how to get jar paths based on parent info we could recurse on that.
        (when license
          {:name (.getName license)
           :url  (.getUrl license)}))
      (catch Exception _e nil))))

(extend-protocol FileSearch
  FileSystem
  (-file-search [jar-fs files]
    (->> files
         (map #(.getPath jar-fs % path-options))
         (filter #(Files/exists % link-options))
         first))

  Path
  (-file-search [root-path files]
    (->> files
         (map (fn [^String filename]
                (.resolve root-path filename)))
         (filter (fn [^Path path]
                   (Files/exists path link-options)))
         first)))

(def license-file-names
  "Common places to look for a license in a jar."
  ["LICENSE" "LICENSE.txt" "META-INF/LICENSE"
   "META-INF/LICENSE.txt" "license/LICENSE"])


;;;;;;;;;;;;;;;;;;;;;;;;;;;;     Jar helpers     ;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn adjacent-pom
  "Sometimes jars don't have a pom but they are adjacent to the pom in .m2/repository."
  [jar-filename]
  (let [adjacent-pom (Paths/get (str/replace jar-filename #"\.jar" ".pom")
                                path-options)]
    (when (Files/exists adjacent-pom link-options)
      adjacent-pom)))

(defn determine-pom
  "Find a pom for a jar. Look for expected location in the jar, and then check for the pom as a sibling file to the
  jar."
  [{:keys [jar-fs lib-name jar-filename]}]
  (let [expected-pom (format "META-INF/maven/%s/%s/pom.xml"
                             (namespace lib-name)
                             (name lib-name))]
    (or (-file-search jar-fs [expected-pom])
        (adjacent-pom jar-filename))))

(defmulti lib-license
  "Determine the license from an lib. Implementations for both :mvn (jar) and :deps (git deps)."
  (fn [[_lib-name info]]
    (:deps/manifest info)))

(defmethod lib-license :mvn
  [[lib-name info]]
  (let [jar-filename (-> info :paths first)
        jar-path     (Paths/get ^String jar-filename path-options)
        classloader  (ClassLoader/getSystemClassLoader)]
    (if-not (Files/exists jar-path link-options)
      {:error "Jar does not exist"}
      (try
        (with-open [jar-fs (FileSystems/newFileSystem jar-path classloader)]
          (when-let [license (or (when-let [license-path (-file-search jar-fs license-file-names)]
                                   (slurp-path license-path))
                                 (when-let [pom-path (determine-pom {:jar-fs jar-fs
                                                                     :lib-name lib-name
                                                                     :jar-filename jar-filename})]
                                   (let [{:keys [name url]} (license-from-pom pom-path)]
                                     (when name (str name ": " url)))))]
            {:license license}))
        (catch Exception e
          {:error e})))))

(defmethod lib-license :deps
  [[_lib-name info]]
  (let [^String git-root (:deps/root info)
        git-path         (Paths/get git-root path-options)]
    (if-not (Files/exists git-path link-options)
      {:error "Git path does not exist"}
      (try
        (when-let [license-path (-file-search git-path license-file-names)]
          {:license (slurp-path license-path)})
        (catch Exception e
          {:error e})))))

(defn license-from-backfill
  "Look in the backfill information for license information."
  [lib-name backfill]
  (let [[group artifact] ((juxt namespace name) lib-name)]
    (when-let [license (some #(get-in backfill %)
                             [[group artifact]
                              [:override/group group]])]
      (if (string? license)
        license
        (if-let [resource (io/resource (:resource license))]
          (slurp resource)
          (throw (ex-info (str "Missing license for " artifact)
                          {:group    group
                           :artifact artifact
                           :backfill license})))))))

(defn discern-license-and-coords
  "Returns a tuple of [jar-filename {:coords :license [:error]}. Error is optional. License will be a string of license
  text, coords a map with group and artifact."
  [[lib-name info :as lib-entry] backfill]
  (let [{:keys [license error]} (lib-license lib-entry)
        license (or license
                    (license-from-backfill lib-name backfill))]
    [lib-name (cond-> {:coords {:group (namespace lib-name)
                                :artifact (name lib-name)}
                       :license license}

                (:mvn/version info)
                (assoc :version (:mvn/version info))

                (not license)
                (assoc :error (or error "Error determining license")))]))

(defn write-license [success-os [lib {:keys [coords license]}]]
  (binding [*out* success-os]
    (println "The following software may be included in this product:"
             (str lib ": " (:version coords) ".")
             "This software contains the following license and notice below:")
    (println "\n")
    (println license)
    (println "\n\n----------\n")))

(defn report-missing [error-os [jar {:keys [coords]}]]
  (let [{:keys [group artifact]} coords
        dep-name (or (when artifact
                       (str (when group (str group ":")) artifact))
                     jar)]
    (binding [*out* error-os]
      (println dep-name " : No license information found."))))

(defn process*
  "Returns a map of `:with-license` and `:without-license`."
  [{:keys [libs backfill]}]
  (let [info     (map #(discern-license-and-coords % backfill) libs)

        categorized (group-by (comp (complement #(contains? % :error)) second) info)]
    {:with-license    (categorized true)
     :without-license (categorized false)}))

(defn generate
  "Process a basis from clojure.tools.build.api/create-basis, creating a file of all license information, writing to
  `:output-filename`. Backfill is a clojure data structure or a filename of an edn file of a clojure datastructure
  providing for backfilling license information if it is not discernable from the jar. Should be of the form (note
  keys are strings not symbols)

  {\"group\" {\"artifact\" \"license text\"}
   \"group\" {\"artifact\" {:resource \"filename-of-license\"}}

  :override/group {\"group\" \"license\"
                   \"group\" {:resource \"filename-of-license\"}}
  }

  Algorithm is:
    - check jar for license file at a few different standard paths. If present keep this text.
    - Look in pom file next to jar or in jar for license information. If found this information is used,
      it is not expanded into a full license text.
    - look in provided backfill information for license text or a resource containing the license text

  Reports if `:report?` is true (the default). Writes missing license information to *err* and summary of identified
  licenses to *out*.

  Returns a map
  {:with-license [ [lib-name {:coords {:group :artifact :version} :license <text>}] ...]
   :without-license [ [lib-name {:coords {:group :artifact :version} :error <text>}] ... ]}"
  [{:keys [basis backfill output-filename report?] :or {report? true}}]
  (let [backfill (if (string? backfill)
                   (edn/read-string (slurp (io/resource backfill)))
                   (or backfill {}))
        entries  (:libs basis)
        {:keys [with-license without-license] :as license-info}
        (process* {:libs     entries
                   :backfill backfill})]
    (when (seq with-license)
      (with-open [os (io/writer output-filename)]
        (run! #(write-license os %) with-license)))
    (when report?
      (when (seq without-license)
        (run! #(report-missing *err* %) without-license))
      (when (seq with-license)
        (println "License information for" (count with-license) "libraries written to "
                 output-filename)
        ;; we call this from the build script. if we switch to the shell we can reenable this and figure out the
        ;; best defaults. Want to make sure we never kill our build script
        #_(System/exit (if (seq without-license) 1 0))))
    license-info))

(comment
  (def basis (b/create-basis {:project "path-to-metabase/deps.edn"}))
  (def libs (process* {:libs     (:libs basis)
                       :backfill (edn/read-string
                                  (slurp (io/resource "overrides.edn")))}))
  (->> libs :without-license (map first))

  (process* {:libs (-> basis :libs (select-keys '[org.liquibase/liquibase-core]))})

  (get-in basis [:libs 'org.clojure/clojure])

  (def libs-no-overrides (process* {:libs (:libs basis)}))
  (->> libs-no-overrides :without-license (map first))

  (let [overrides (edn/read-string (slurp (io/resource "overrides.edn")))
        by-group  (:override/group overrides)
        by-group? false #_true]
    (keep (fn [[lib _junk]]
            (let [without-license (->> (process* {:libs (:libs basis)
                                                  :backfill
                                                  (if by-group?
                                                    (update overrides
                                                            :override/group
                                                            dissoc lib)
                                                    (dissoc overrides lib))})
                                       :without-license
                                       seq)]
              (when-not without-license
                lib)))
          (if by-group?
            by-group
            (dissoc overrides :override/group))))

  (->> (process* {:libs     (:libs basis)
                  :backfill (edn/read-string
                             (slurp (io/resource "overrides.edn")))})
       :without-license)
  )
