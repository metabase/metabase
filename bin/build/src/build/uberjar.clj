(ns build.uberjar
  (:require
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [clojure.tools.build.api :as b]
   [clojure.tools.build.util.zip :as build.zip]
   [clojure.tools.namespace.dependency :as ns.deps]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [metabuild-common.core :as u]
   [metabuild-common.misc :as misc]
   [org.corfield.log4j2-conflict-handler :refer [log4j2-conflict-handler]])
  (:import
   (java.io File OutputStream)
   (java.nio.file CopyOption Files LinkOption OpenOption Path StandardCopyOption StandardOpenOption)
   (java.nio.file.attribute FileAttribute)
   (java.security MessageDigest)
   (java.util.jar Manifest)))

(set! *warn-on-reflection* true)

(def ^:private class-dir
  (u/filename u/project-root-directory "target" "classes"))

(def ^:private uberjar-dir
  "Canonical directory for all uberjar builds."
  (u/filename u/project-root-directory "target" "uberjar"))

(def ^:private artifact-name
  "The uberjar artifact name, customizable via the MB_JAR_FILENAME env var."
  (or (System/getenv "MB_JAR_FILENAME")
      "metabase.jar"))

(def uberjar-filename
  "Full path to the Metabase uberjar, including the artifact name."
  (u/filename uberjar-dir artifact-name))

(defn- do-with-duration-ms [thunk f]
  (let [timer      (u/start-timer)
        result     (thunk)
        elapsed-ms (u/since-ms timer)]
    (f elapsed-ms)
    result))

(defmacro ^:private with-duration-ms [[duration-ms-binding] & body]
  (let [[butlast-forms last-form] ((juxt butlast last) body)]
    `(do-with-duration-ms
      (fn [] ~@butlast-forms)
      (fn [~duration-ms-binding]
        ~last-form))))

(defn- create-basis [edition]
  {:pre [(#{:ee :oss} edition)]}
  (b/create-basis {:project "deps.edn",
                   :aliases #{edition :drivers}}))

(defn- all-paths [basis]
  (concat (:paths basis)
          (get-in basis [:argmap :extra-paths])))

(defn- delete! [path]
  (u/step (format "Delete %s" path)
    (b/delete {:path path})))

(defn- clean! []
  (u/step "Clean"
    (delete! class-dir)
    (delete! uberjar-filename)))

;; this topo sort order stuff is required for stuff to work correctly... I copied it from my Cloverage PR
;; https://github.com/cloverage/cloverage/pull/303
(defn- dependencies-graph
  "Return a `clojure.tools.namespace` dependency graph of namespaces named by `ns-symbol`."
  [ns-decls]
  (reduce
   (fn [graph ns-decl]
     (let [ns-symbol (ns.parse/name-from-ns-decl ns-decl)]
       (reduce
        (fn [graph dep]
          (ns.deps/depend graph ns-symbol dep))
        graph
        (ns.parse/deps-from-ns-decl ns-decl))))
   (ns.deps/graph)
   ns-decls))

(def ^:private drivers-excluded-from-aot
  "Drivers whose JDBC dependencies are not bundled due to licensing restrictions (users must supply the JDBC driver JAR
  themselves). These drivers are included as source on the classpath and compiled lazily at runtime when their JDBC
  driver is present in the plugins directory."
  #{"oracle" "vertica"})

(defn- all-drivers []
  (->> (.listFiles (io/file (u/filename u/project-root-directory "modules" "drivers")))
       (filter (fn [^File d]
                 (and
                  (.isDirectory d)
                  (not (.isHidden d))
                  (.exists (io/file d "deps.edn"))
                  (not (contains? drivers-excluded-from-aot (.getName d))))))
       (map (comp symbol #(str "metabase.driver." %) #(.getName ^File %)))))

(defn- metabase-namespaces-in-topo-order [basis]
  (let [ns-decls   (into []
                         (comp (map io/file)
                               (mapcat ns.find/find-ns-decls-in-dir))
                         (all-paths basis))
        ns-symbols (into #{} (map ns.parse/name-from-ns-decl) ns-decls)
        sorted     (->> (dependencies-graph ns-decls)
                        ns.deps/topo-sort
                        (filter ns-symbols))
        orphans    (remove (set sorted) ns-symbols)
        all        (concat orphans sorted (all-drivers))]
    (assert (contains? (set all) 'metabase.core.bootstrap))
    (when (contains? ns-symbols 'metabase-enterprise.core.dummy-namespace)
      (assert (contains? (set all) 'metabase-enterprise.core.dummy-namespace)))
    all))

(defn- compile-sources! [basis]
  (u/step "Compile Clojure source files"
    (let [paths    (all-paths basis)
          _        (u/announce "Compiling Clojure files in %s" (pr-str paths))
          ns-decls (u/step "Determine compilation order for Metabase files"
                     (metabase-namespaces-in-topo-order basis))]
      (with-duration-ms [duration-ms]
        (b/compile-clj {:basis      basis
                        :src-dirs   paths
                        :class-dir  class-dir
                        :ns-compile ns-decls})
        (u/announce "Finished compilation in %.1f seconds." (/ duration-ms 1000.0))))))

(def ^:private resource-ignore-patterns
  "Files to ignore when copying resources from source directories (`src` and `enterprise/backend/src`) and resource
  directories (`resources`)."
  [#"\.clj[c|s]?$"
   #""
   ;; ignore .~undo-tree~ or other nonsense files created by editors. I was considering using
   ;;
   ;;    git ls-files --ignored --exclude-from=.gitignore --others
   ;;
   ;; to find ALL the files to ignore here but then we run into problems accidentally ignoring build artifacts like
   ;; translation files. This should be good enough for now -- we don't really NEED to do this stuff since we build in a
   ;; clean Docker env, so it's more of a nice to have to keep the clutter in our JARs down when building locally.
   #"\~$"
   #"^\.?#"
   #"\.rej$"
   ;; Driver classes are now flattened directly into the uberjar via the :drivers alias — the old nested
   ;; driver JARs in resources/modules/ must not be included or we'd ship everything twice.
   #"^modules/"])

(defn- copy-resources! [basis]
  (u/step "Copy resources"
    ;; put module config file on classpath for log team attribution
    (b/copy-file {:src ".clj-kondo/config/modules/config.edn"
                  :target "resources/metabase/config/modules.edn"})
    (doseq [path (all-paths basis)]
      (u/step (format "Copy resources from %s" path)
        (b/copy-dir {:target-dir class-dir
                     :src-dirs   [path]
                     :ignores    resource-ignore-patterns})))))

(def ^:private dependency-ignore-patterns
  "Files to ignore when copying resources from our dependencies."
  [#".*metabase.*\.clj[c|s]?$"
   ;; ignore module-info files inside META-INF because we don't have a modular JAR and they can break tools like `jar
   ;; tf` -- see Slacc thread
   ;; https://metaboat.slack.com/archives/C5XHN8GLW/p1731633690703149?thread_ts=1731504670.951389&cid=C5XHN8GLW
   #".*module-info\.class"
   #"^LICENSE$"
   #".*LICENSE.jol.txt"
   #"META-INF/license/LICENSE.jol.txt"
   #"META-INF/license.*"
   #"META-INF/LICENSE.*"])

(defn- prefer-lib
  "Returns a conflict handler fn that ensures `preferred` lib's classes always win.
   The returned fn writes when the incoming class is from `preferred`, skips otherwise."
  [preferred]
  (fn prefer-lib' [{:keys [lib path in]}]
    (when (= lib preferred)
      {:write {path {:stream in}}})))

;; hive-jdbc bundles javax.activation classes with package-private visibility on LogSupport.
;; When these overwrite jakarta.activation's public versions, javax.mail (postal) fails with
;; IllegalAccessError.
(def ^:private activation-conflict-handler
  (let [from-com-sun-activation (prefer-lib 'com.sun.activation/jakarta.activation)]
    {"com/sun/activation/.*" from-com-sun-activation
     "javax/activation/.*"   from-com-sun-activation}))

;; vertica-jdbc bundles unshaded gson 2.8.9. When these overwrite the pinned 2.12.1,
;; BigQuery crashes with NoSuchMethodError on JsonWriter.value(float). See #73736.
(def ^:private gson-conflict-handler
  {"com/google/gson/.*" (prefer-lib 'com.google.code.gson/gson)})

;; avatica (Hive transitive dep) bundles the entire SLF4J API unshaded.
(def ^:private slf4j-conflict-handler
  {"org/slf4j/.*" (prefer-lib 'org.slf4j/slf4j-api)})

(def conflict-handlers
  "Merged conflict handlers for the uberjar build. Handles Log4j2 plugin merging,
   jakarta.activation class visibility, gson version pinning, and SLF4J API."
  (merge log4j2-conflict-handler
         activation-conflict-handler
         gson-conflict-handler
         slf4j-conflict-handler))

(defn- create-uberjar! [basis]
  (u/step "Create uberjar"
    (with-duration-ms [duration-ms]
      (b/uber {:class-dir         class-dir
               :uber-file         uberjar-filename
               :conflict-handlers conflict-handlers
               :basis             basis
               :exclude           dependency-ignore-patterns})
      (u/announce "Created uberjar in %.1f seconds." (/ duration-ms 1000.0)))))

;;; ------------------------------------------- deps-only base jar ---------------------------------------------------
;;;
;;; `b/uber` explodes every dependency JAR into a temp directory and then deflates the whole tree into the uberjar.
;;; Dependencies are ~75% of the jar's uncompressed bytes and ~84% of its entries, and they only change when a
;;; `deps.edn` does (~2% of commits), so we pay for that work on nearly every build for nothing.
;;;
;;; Instead, CI's cache generator builds a "base jar" — the same `b/uber` call with an *empty* class-dir, so it holds
;;; only the exploded, conflict-resolved dependencies — and caches it weekly. A build with a matching dependency set
;;; copies that base jar and appends its own class-dir into it, which re-uses the dependencies' already-compressed
;;; bytes instead of re-deflating them. When the dependency set doesn't match, we fall back to the normal `b/uber`
;;; path, so the cache can only ever make the build faster, never wrong.

(def ^:private deps-base-dir
  "Directory holding the cached deps-only base jars. Deliberately outside `target/classes` and not touched by
  `clean!`, since CI restores the cache into it before the build runs."
  (u/filename u/project-root-directory "target" "deps-base"))

(defn deps-base-jar-filename
  "Path of the deps-only base jar for `edition`."
  [edition]
  (u/filename deps-base-dir (format "metabase-deps-%s.jar" (name edition))))

(defn- deps-base-hash-filename [edition]
  (str (deps-base-jar-filename edition) ".hash"))

(defn- sha256 ^String [^String s]
  (->> (.getBytes s "UTF-8")
       (.digest (MessageDigest/getInstance "SHA-256"))
       (map (partial format "%02x"))
       (apply str)))

(defn- basis-deps-hash
  "Fingerprint of the resolved dependency set — exactly what the base jar contains. We hash the *resolved* libs rather
  than the `deps.edn` files so that the check can't be fooled by a change that alters resolution without touching a
  file we thought to hash (or vice versa). `:paths` are omitted because they are absolute and machine-specific."
  [basis]
  (->> (:libs basis)
       (map (fn [[lib coord]]
              (str lib " " (or (:mvn/version coord) (:git/sha coord) (:local/root coord)))))
       sort
       (str/join "\n")
       sha256))

(defn build-deps-base-jar!
  "Build the deps-only base jar for `edition` plus the hash sidecar identifying which dependency set it holds. Run by
  CI's cache generator; see .github/workflows/cache-generator.yml.

    clojure -X:build:build/uberjar build.uberjar/build-deps-base-jar! :edition :ee"
  [{:keys [edition], :or {edition :oss}}]
  (u/step (format "Build %s deps base jar" edition)
    (let [basis     (create-basis edition)
          jar       (deps-base-jar-filename edition)
          ;; an empty class-dir is what makes this deps-only: `b/uber` merges class-dir and libs into one tree, so
          ;; giving it nothing to merge yields just the libs.
          empty-dir (str (Files/createTempDirectory "empty-class-dir" (misc/varargs FileAttribute)))]
      (u/delete-file-if-exists! jar)
      (u/create-directory-unless-exists! deps-base-dir)
      (with-duration-ms [duration-ms]
        (b/uber {:class-dir         empty-dir
                 :uber-file         jar
                 :conflict-handlers conflict-handlers
                 :basis             basis
                 :exclude           dependency-ignore-patterns})
        (spit (deps-base-hash-filename edition) (basis-deps-hash basis))
        (u/announce "Built %s (%.1f MB) in %.1f seconds."
                    jar (/ (.length (io/file jar)) 1e6) (/ duration-ms 1000.0))))))

(defn- usable-deps-base-jar
  "Path of a base jar we can build on top of, or nil. nil whenever anything is off — no cache restored, or the
  dependency set moved since it was built — which just means the normal `b/uber` path runs."
  [edition basis]
  (let [jar       (deps-base-jar-filename edition)
        hash-file (io/file (deps-base-hash-filename edition))]
    (cond
      (not (.exists (io/file jar)))
      (do (u/announce "No deps base jar at %s; building the uberjar from scratch." jar) nil)

      (not (.exists hash-file))
      (do (u/announce "Deps base jar has no hash sidecar; building the uberjar from scratch.") nil)

      (not= (str/trim (slurp hash-file)) (basis-deps-hash basis))
      (do (u/announce "Deps base jar is stale (dependency set changed); building the uberjar from scratch.") nil)

      :else
      (do (u/announce "Using cached deps base jar %s." jar) jar))))

(def ^:private uber-exclusions
  "tools.build drops these from everything it writes into an uberjar — including class-dir content. Appending the app
  layer ourselves has to drop exactly the same set or our jar would differ from a `b/uber` one. Read back out of
  tools.build rather than copied here, so a version bump surfaces as a loud failure instead of silent drift."
  (delay @(requiring-resolve 'clojure.tools.build.tasks.uber/uber-exclusions)))

(defn- excluded-from-uber? [^String path]
  (boolean (some #(re-matches % path) (concat @uber-exclusions dependency-ignore-patterns))))

(defn- merged-data-readers
  "Replicates tools.build's `:data-readers` conflict handler. `b/uber` explodes the class-dir *first* and then merges
  each lib's data readers over it, so the app's entries come first and libs win any key collision — `(merge app base)`
  reproduces both the ordering and the precedence."
  [^String app-str ^String base-str]
  (binding [*read-eval* false]
    (let [read-readers #(read-string {:read-cond :preserve :features #{:clj}} %)]
      (with-out-str
        (pprint/pprint (merge (read-readers app-str) (read-readers base-str)))))))

(defn- append-conflict!
  "Resolve a class-dir file whose path already exists in the base jar (i.e. a lib shipped the same path)."
  [^Path target ^File src ^String path]
  (cond
    (re-matches #"data_readers.clj[c]?" path)
    (let [^String merged (merged-data-readers (slurp src) (String. (Files/readAllBytes target) "UTF-8"))]
      (Files/write target (.getBytes merged "UTF-8")
                   (misc/varargs OpenOption [StandardOpenOption/WRITE StandardOpenOption/TRUNCATE_EXISTING])))

    ;; `b/uber` would concatenate/dedupe these rather than let one side win. Nothing under `resources/` produces them
    ;; today, so rather than carry an untested merge, fail loudly if that ever changes.
    (or (re-matches #"META-INF/services/.*" path)
        (re-matches #"(?i)(META-INF/)?(COPYRIGHT|NOTICE|LICENSE)(\.(txt|md))?" path))
    (throw (ex-info (str "Cannot append " path " onto the deps base jar: b/uber merges this path, and this code only"
                         " knows how to merge data_readers. Teach append-conflict! how to merge it, or exclude it.")
                    {:path path}))

    ;; Everything else: `b/uber`'s default handler is `:ignore` (first writer wins) and the class-dir goes in first,
    ;; so the app's copy wins.
    :else
    (Files/copy (.toPath src) target
                (misc/varargs CopyOption [StandardCopyOption/REPLACE_EXISTING]))))

(defn- create-uberjar-from-base!
  "Build the uberjar by copying the deps-only `base-jar` and appending the class-dir into it."
  [base-jar]
  (u/step "Create uberjar from cached deps base jar"
    (with-duration-ms [duration-ms]
      (io/copy (io/file base-jar) (io/file uberjar-filename))
      (let [root  (.toPath (io/file class-dir))
            files (->> (io/file class-dir) file-seq (filter #(.isFile ^File %)))]
        (u/with-open-jar-file-system [fs uberjar-filename]
          (doseq [^File f files
                  :let [path (str/replace (str (.relativize root (.toPath f))) File/separatorChar \/)]
                  :when (not (excluded-from-uber? path))]
            (let [target (u/get-path-in-filesystem fs path)]
              (if (Files/exists target (misc/varargs LinkOption))
                (append-conflict! target f path)
                (do
                  (when-let [parent (.getParent target)]
                    (Files/createDirectories parent (misc/varargs FileAttribute)))
                  (Files/copy (.toPath f) target (misc/varargs CopyOption))))))))
      (u/announce "Created uberjar from base in %.1f seconds." (/ duration-ms 1000.0)))))

(def ^:private manifest-entries
  {"Manifest-Version" "1.0"
   "Multi-Release"    "true"
   "Created-By"       "Metabase build.clj"
   "Build-Jdk-Spec"   (System/getProperty "java.specification.version")
   "Main-Class"       "metabase.core.bootstrap"})

(defn- manifest ^Manifest []
  (doto (Manifest.)
    (build.zip/fill-manifest! manifest-entries)))

(defn- write-manifest! [^OutputStream os]
  (.write (manifest) os)
  (.flush os))

(defn- add-non-aot-driver-sources!
  "Inject source files for drivers excluded from AOT directly into the uberjar.
  These drivers can't be AOT-compiled (their ns forms reference JDBC classes not bundled due to licensing), so they
  ship as source and are compiled lazily at runtime. We add them after b/uber because uber strips all .clj files from
  class-dir."
  []
  (u/step "Add non-AOT driver sources to uberjar"
    (u/with-open-jar-file-system [fs uberjar-filename]
      (doseq [driver drivers-excluded-from-aot
              :let [src-dir (io/file (u/filename u/project-root-directory "modules" "drivers" driver "src"))]
              :when (.isDirectory src-dir)]
        (u/step (format "Add source for %s" driver)
          (doseq [^File f (file-seq src-dir)
                  :when (.isFile f)]
            (let [rel-path (.toString (.relativize (.toPath src-dir) (.toPath f)))
                  target   (u/get-path-in-filesystem fs rel-path)]
              (Files/createDirectories (.getParent target) (misc/varargs java.nio.file.attribute.FileAttribute))
              (Files/copy (.toPath f) target (misc/varargs java.nio.file.CopyOption)))))))))

(defn update-manifest!
  "Start a build step that updates the manifest.
  The customizations we need to make are not currently supported by tools.build -- see
  https://ask.clojure.org/index.php/10827/ability-customize-manifest-created-clojure-tools-build-uber -- so we need
  to do it by hand for the time being."
  []
  (u/step "Update META-INF/MANIFEST.MF"
    (u/with-open-jar-file-system [fs uberjar-filename]
      (let [manifest-path (u/get-path-in-filesystem fs "META-INF" "MANIFEST.MF")]
        (with-open [os (Files/newOutputStream manifest-path (into-array OpenOption [StandardOpenOption/WRITE
                                                                                    StandardOpenOption/TRUNCATE_EXISTING]))]
          (write-manifest! os))))))

(defn uberjar
  "Build just the uberjar (no i18n, FE, or anything else). You can run this from the CLI like:

    clojure -X:build:build/uberjar
    clojure -X:build:build/uberjar :edition :ee"
  [{:keys [edition], :or {edition :oss}}]
  (u/step (format "Build %s uberjar" edition)
    (with-duration-ms [duration-ms]
      (clean!)
      (let [basis (create-basis edition)]
        (compile-sources! basis)
        (copy-resources! basis)
        (if-let [base-jar (usable-deps-base-jar edition basis)]
          (create-uberjar-from-base! base-jar)
          (create-uberjar! basis))
        (add-non-aot-driver-sources!)
        (update-manifest!))
      (u/announce "Built %s in %.1f seconds." uberjar-filename (/ duration-ms 1000.0)))))

(defn detect-class-conflicts
  "Run `b/uber` against `basis` (no AOT, no resources) and return a seq of
   `{:path ... :lib ...}` for every `.class` file conflict not already handled
   by our conflict handlers."
  [basis]
  (let [conflicts (atom [])]
    (clean!)
    (b/uber {:class-dir         class-dir
             :uber-file         uberjar-filename
             :conflict-handlers (merge conflict-handlers
                                       {:default (fn [{:keys [lib path]}]
                                                   (when (str/ends-with? path ".class")
                                                     (swap! conflicts conj {:path path :lib lib}))
                                                   nil)})
             :basis             basis
             :exclude           dependency-ignore-patterns})
    @conflicts))

(defn audit-conflicts
  "Build a bare uberjar (no AOT, no resources) and report all class file conflicts.
   Useful for detecting vendored/unshaded dependencies in fat JARs.

     clojure -X:build:build/uberjar build.uberjar/audit-conflicts
     clojure -X:build:build/uberjar build.uberjar/audit-conflicts :edition :ee"
  [{:keys [edition], :or {edition :ee}}]
  (u/step (format "Audit %s uberjar class file conflicts" edition)
    (let [basis     (create-basis edition)
          conflicts (detect-class-conflicts basis)]
      (when (seq conflicts)
        (u/announce "=== %d class file conflicts detected ===" (count conflicts))
        (let [report-file "target/conflict-report.txt"]
          (spit report-file
                (str/join "\n"
                          (for [[path libs] (->> conflicts
                                                 (group-by :path)
                                                 (sort-by key))]
                            (format "%s — %s" path (str/join ", " (map :lib libs))))))
          (u/announce "Conflict report written to %s" report-file))))))
