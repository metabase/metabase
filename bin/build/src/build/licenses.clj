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
   (java.io FileReader)
   (java.nio.file Files FileSystem FileSystems FileVisitOption LinkOption OpenOption Path Paths)
   (org.apache.maven.model License)
   (org.apache.maven.model.io.xpp3 MavenXpp3Reader)))

(set! *warn-on-reflection* true)

(defn- ->BiPredicate [f]
  (reify java.util.function.BiPredicate
    (test [_ x y]
      (f x y))))

(def ^:private path-options (into-array String []))
(def ^:private filevisit-options (into-array FileVisitOption []))
(def ^:private link-options (into-array LinkOption []))
(def ^:private open-options (into-array OpenOption []))

(defn determine-pom
  "Produce a pom path from a jar. Looks first for a pom adjacent to the jar, and then finds all files that end with
  pom.xml in the jar, returning the first.

  In the future if we switch to deps.edn we can start with a canonical deps map and go from a proper dependency list
  to artifacts. This would allow accessing the pom directly rather than searching for it. To optimize, we look for the
  pom adjacent to the jar so we don't enumerate every jar."
  [jar-filename ^FileSystem jar-fs]
  (or (let [adjacent-pom (Paths/get (str/replace jar-filename #"\.jar" ".pom")
                                    path-options)]
        (when (Files/exists adjacent-pom link-options)
          adjacent-pom))
      (let [jar-root (.getPath jar-fs "/" path-options)
            ^java.util.function.BiPredicate
            pred (->BiPredicate (fn [^Path path _]
                                  (str/ends-with? (str path) "pom.xml")))]
        (.. (Files/find jar-root Integer/MAX_VALUE pred filevisit-options)
            findFirst
            (orElse nil)))))

(defn do-with-path-is
  "Open an inputstream on `path` and call `f` with the inputstream as an argument. Function `f` should not be lazy."
  [^Path path f]
  (with-open [is (Files/newInputStream path open-options)]
    (f is)))

(defn license-from-pom
  "Read license information from a pom. This reads only the local pom and does not trace parent poms. Clojure.core.async includes a parent pom:

  <parent>
    <groupId>org.clojure</groupId>
    <artifactId>pom.contrib</artifactId>
    <version>1.1.0</version>
  </parent>

  which would specify a license. To trace this would require setting up way more machinery and so just let the
  overrides catch this scenario."
  [^Path pom-path]
  (try
    (let [reader (MavenXpp3Reader.)
          model  (.read reader (FileReader. (.toFile pom-path)))
          license ^License (first (.getLicenses model))]
      (when license
        {:name (.getName license)
         :url  (.getUrl license)}))
    (catch Exception _e nil)))

(def ^:private license-file-names
  ["LICENSE" "LICENSE.txt" "META-INF/LICENSE"
   "META-INF/LICENSE.txt" "license/LICENSE"])

(defn license-from-jar
  "Look inside of a jar filesystem for license files."
  [^FileSystem jar-fs]
  (->> license-file-names
       (map #(.getPath jar-fs % path-options))
       (filter #(Files/exists % link-options))
       first))

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
  [[lib-name info] backfill]
  (let [jar-filename (-> info :paths first)
        jar-path (Paths/get ^String jar-filename path-options)
        classloader (ClassLoader/getSystemClassLoader)]
    (if-not (Files/exists jar-path link-options)
      [lib-name {:error "Jar does not exist"}]
      (try
        (with-open [jar-fs (FileSystems/newFileSystem jar-path classloader)]
          (let [license  (or (when-let [license-path (license-from-jar jar-fs)]
                               (with-open [is (Files/newInputStream license-path open-options)]
                                 (slurp is)))
                             (when-let [pom-path (determine-pom jar-filename jar-fs)]
                               (let [{:keys [name url]} (license-from-pom pom-path)]
                                 (when name (str name ": " url))))
                             (license-from-backfill lib-name backfill))]
            [lib-name (cond-> {:coords {:group (namespace lib-name)
                                        :artifact (name lib-name)
                                        :version (:mvn/version info)}
                               :license license}
                        (not license)
                        (assoc :error "Error determining license"))]))
        (catch Exception e
          [lib-name {:error e}])))))

(defn- write-license [success-os [lib {:keys [coords license]}]]
  (binding [*out* success-os]
    (println "The following software may be included in this product:"
             (str lib ": " (:version coords) ".")
             "This software contains the following license and notice below:")
    (println "\n")
    (println license)
    (println "\n\n----------\n")))

(defn- report-missing [error-os [jar {:keys [coords]}]]
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

(defn jar-entries
  "Filters the `:libs` map of a basis to just `:mvn` based (jar based) libs. Keys are symbols of the lib and the value
  is a map of `:mvn/version` and `:paths` amont others."
  [basis]
  (into {} (filter (comp #{:mvn} :deps/manifest val) (:libs basis))))

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
        entries  (jar-entries basis)
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
  (def libs (process* {:libs     (jar-entries basis)
                       :backfill (edn/read-string
                                  (slurp (io/resource "overrides.edn")))}))
  (process* {:libs (-> basis :libs (select-keys '[org.clojure/clojure
                                                  org.clojure/core.async]))})

  (get-in basis [:libs 'org.clojure/clojure])

  (->> libs
       :without-license
       (map first))

  (def libs-no-overrides (process* {:libs (jar-entries basis)}))
  (->> libs-no-overrides :without-license (map first)))
