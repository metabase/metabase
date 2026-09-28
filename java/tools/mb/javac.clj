(ns mb.javac
  "Compiles the backend's Java sources, `java/src`, into `java/classes`, which is on every classpath via the root
  `:paths`.

  Whatever loads backend code from a source checkout calls [[compile!]] before any namespace imports a compiled class:
  `user` (through `dev.java`) for anything run with `:dev`, the `-e` in `:run`, `:doc`, `:load-namespaces` and friends,
  and the uberjar and driver builds. It recompiles only when a source changed since the last compile, so the call is
  nearly free, and javac's own diagnostics go to stderr when compilation fails.

  The Java sources may use only the JDK and Clojure: they compile against exactly that, whichever entry point compiles
  them. `java/classes` has to exist when the JVM starts, or the JVM will not read classes from it, so git keeps the
  directory. A class a running REPL has already loaded stays loaded; restart the REPL after changing it."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (java.io File RandomAccessFile)
   (javax.tools JavaCompiler ToolProvider)))

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

(def ^:private clojure-jar
  (-> clojure.lang.RT .getProtectionDomain .getCodeSource .getLocation .toURI io/file .getPath))

(defn- javac! [sources]
  (let [^JavaCompiler compiler (or (ToolProvider/getSystemJavaCompiler)
                                   (throw (ex-info "Compiling java/src needs a JDK, not a JRE" {})))]
    (with-open [files (.getStandardFileManager compiler nil nil nil)]
      (let [options ["--release" "25" "-Xlint:all" "-Werror" "-encoding" "UTF-8"
                     "-d" (.getPath ^File classes-dir)
                     "-classpath" clojure-jar]
            task    (.getTask compiler *err* files nil options nil (.getJavaFileObjectsFromFiles files ^Iterable sources))]
        (when-not (.call task)
          (throw (ex-info "Compiling java/src failed; see javac's diagnostics above" {})))))))

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
             (javac! sources)
             (spit stamp-file (pr-str current)))))))
   nil))
