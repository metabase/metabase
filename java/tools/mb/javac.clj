(ns mb.javac
  "Compiles the backend's Java sources, `java/src`, into `java/classes`, which is on every classpath via the root
  `:paths`.

  Whatever loads backend code from a source checkout calls [[compile!]] before any namespace imports a compiled class:
  `user` (through `dev.java`) for anything run with `:dev`, the `-e` in `:run`, `:doc`, `:load-namespaces` and friends,
  and the uberjar and driver builds. It recompiles only when a source changed since the last compile, so the call is
  nearly free, and javac's own diagnostics go to stderr when compilation fails.

  The Java sources may use only the JDK, Clojure, and JSpecify's nullness annotations: they compile against exactly
  that, whichever entry point compiles them. [[lint!]] holds them to more than javac does.

  `java/classes` has to exist when the JVM starts, or the JVM will not read classes from it, so git keeps the
  directory. A class a running REPL has already loaded stays loaded; restart the REPL after changing it."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (java.io File RandomAccessFile)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (javax.tools DiagnosticListener JavaCompiler ToolProvider)))

(set! *warn-on-reflection* true)

(def ^:private src-dir (io/file "java/src"))

(def ^:private classes-dir (io/file "java/classes"))

(def ^:private stamp-file
  "What the classes were last compiled from: each source's path and modification time."
  (io/file "java/.javac-stamp"))

(def ^:private lock-file (io/file "java/.javac-lock"))

(defn- sources []
  (filter #(str/ends-with? (.getName ^File %) ".java") (file-seq src-dir)))

(defn- stamp [sources]
  (into {} (map (fn [^File f] [(.getPath f) (.lastModified f)])) sources))

(defn- read-stamp []
  (when (.exists ^File stamp-file)
    (edn/read-string (slurp stamp-file))))

(defn- clear-classes!
  "Deletes the compiled classes, so a source that was removed leaves no class behind. Keeps the `.gitignore` that keeps
  the directory."
  []
  (doseq [^File f (reverse (rest (file-seq classes-dir)))
          :when   (not= ".gitignore" (.getName f))]
    (.delete f)))

(defn- jar-of ^String [^Class c]
  (-> c .getProtectionDomain .getCodeSource .getLocation .toURI io/file .getPath))

(defn- compile-classpath []
  (str (jar-of clojure.lang.RT) File/pathSeparator (jar-of (Class/forName "org.jspecify.annotations.NullMarked"))))

(def ^:private javac-options
  "What every compile holds the sources to: every lint, and well-formed javadoc where there is any."
  ["--release" "25" "-Xlint:all" "-Xdoclint:all,-missing" "-encoding" "UTF-8"])

(defn- javac!
  "Compiles `sources` with [[javac-options]] and `options`, returning whether it succeeded. Diagnostics go to `listener`
  when there is one, and otherwise to stderr as javac prints them."
  [sources options ^DiagnosticListener listener]
  (let [^JavaCompiler compiler (or (ToolProvider/getSystemJavaCompiler)
                                   (throw (ex-info "Compiling java/src needs a JDK, not a JRE" {})))]
    (with-open [files (.getStandardFileManager compiler listener nil nil)]
      (.call (.getTask compiler *err* files listener (into javac-options options) nil
                       (.getJavaFileObjectsFromFiles files ^Iterable sources))))))

(def ^:private in-process-lock
  "The file lock orders JVMs, but not threads within one (the driver builds compile from several at once): a second
  thread's `FileChannel.lock` throws rather than waits."
  (Object.))

(defn compile!
  "Compiles `java/src` into `java/classes` unless the classes are already up to date, or `force`. A no-op without
  `java/src`, i.e. anywhere but a source checkout.

  Callable as `clojure -X:javac`, with `:force true` to recompile regardless."
  ([] (compile! {}))
  ([{:keys [force]}]
   (when (.isDirectory ^File src-dir)
     (locking in-process-lock
       (with-open [file    (RandomAccessFile. ^File lock-file "rw")
                   channel (.getChannel file)
                   _lock   (.lock channel)]
         (let [sources (sources)
               current (stamp sources)]
           (when (or force (not= current (read-stamp)))
             (println (format "Compiling %d Java source files in java/src ..." (count sources)))
             (.mkdirs ^File classes-dir)
             (clear-classes!)
             (when-not (javac! sources ["-Werror" "-d" (.getPath ^File classes-dir) "-classpath" (compile-classpath)] nil)
               (throw (ex-info "Compiling java/src failed; see javac's diagnostics above" {})))
             (spit stamp-file (pr-str current)))))))
   nil))

;;; ------------------------------------------------------- Lint -------------------------------------------------------

(def ^:private disabled-checks
  "The Error Prone checks [[lint!]] leaves off; every other one, including those Error Prone disables by default, counts."
  ["Var"                           ; wants Error Prone's @Var on every reassigned local
   "ImmutableMemberCollection"     ; wants Guava's immutable types; records copy into unmodifiable collections instead
   "CanIgnoreReturnValueSuggester" ; wants Error Prone's annotations jar, for one fluent method
   "AddNullMarkedToClass"          ; packages are @NullMarked, which RequireExplicitNullMarking checks
   "Java8ApiChecker"])             ; flags every API newer than Java 8; the sources target Java 25

(def ^:private error-prone-options
  (str/join " " (concat ["-Xplugin:ErrorProne"
                         "-XepAllDisabledChecksAsWarnings"
                         "-XepAllSuggestionsAsWarnings"
                         "-Xep:NullAway:ERROR"
                         "-XepOpt:NullAway:OnlyNullMarked=true"
                         "-XepOpt:NullAway:JSpecifyMode=true"
                         "-Xep:RequireExplicitNullMarking:ERROR"]
                        (for [check disabled-checks] (str "-Xep:" check ":OFF")))))

(defn lint!
  "Compiles `java/src` with Error Prone, which adds hundreds of bug-pattern checks, and NullAway, which checks nullness
  against the JSpecify annotations: every package is `@NullMarked`, so anything that may be null says `@Nullable`. Any
  finding fails the lint, once all of them are reported; with `-Werror`, the first would stop Error Prone analyzing the
  files after it. Writes nothing to `java/classes`.

  NullAway does not check a variable bound by a record pattern (uber/NullAway#840); the rules that keep that from
  hiding a null are in `java/src/metabase/metabot/providers/package-info.java`.

  Run as `clojure -X:javac:javac-lint`: that JVM has Error Prone on its classpath and opens it javac's internals."
  [_opts]
  (let [findings (atom 0)
        listener (reify DiagnosticListener
                   (report [_ diagnostic]
                     (swap! findings inc)
                     (binding [*out* *err*] (println (str diagnostic)))))
        out      (.toFile (Files/createTempDirectory "javac-lint" (make-array FileAttribute 0)))
        ok?      (javac! (sources)
                         ["-XDcompilePolicy=simple" "--should-stop=ifError=FLOW" "-Xmaxwarns" "10000"
                          "-processorpath" (System/getProperty "java.class.path")
                          "-classpath" (compile-classpath)
                          "-d" (.getPath out)
                          error-prone-options]
                         listener)]
    (when (or (not ok?) (pos? @findings))
      (throw (ex-info (format "java/src has %d lint findings; see above" @findings) {})))
    (println "java/src: no lint findings")))
