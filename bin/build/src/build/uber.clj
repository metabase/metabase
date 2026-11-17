(ns build.uber
  "A faster `clojure.tools.build.api/uber`.

  `b/uber` explodes every dependency into a temporary directory, one file at a time, and then compresses the whole
  directory into the uberjar again on a single thread. For Metabase that is ~150k files and two minutes.

  This builds the same uberjar with the same rules: the same exclusions, the same conflict handlers, called in the same
  order with the same arguments, and libs visited in the same order, so the first writer of a path still wins. It
  differs in how the bytes move:

  - a path is recorded with where it comes from rather than written out. Only a path that a conflict handler is called
    for is written to the temporary directory, because handlers read (and, for log4j2, rewrite) the `:existing` file;
  - an entry that comes unchanged from a dependency JAR is copied into the uberjar still compressed;
  - everything else, which is mostly AOT-compiled classes and our resources, is compressed on every core."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.build.api :as b]
   [clojure.tools.build.tasks.uber :as tb.uber]
   [clojure.tools.build.util.file :as tb.file])
  (:import
   (java.io ByteArrayOutputStream File InputStream)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute FileTime)
   (java.util HashSet LinkedHashMap Map)
   (java.util.concurrent Executors)
   (java.util.jar Manifest)
   (java.util.zip ZipEntry)
   (org.apache.commons.compress.archivers.zip
    ParallelScatterZipCreator
    Zip64Mode
    ZipArchiveEntry
    ZipArchiveOutputStream
    ZipFile)
   (org.apache.commons.compress.parallel InputStreamSupplier)))

(set! *warn-on-reflection* true)

;;; Reused from tools.build so the rules cannot drift from the ones `b/uber` applies. The version is pinned in
;;; `deps.edn`, and `build.uber-test` compares the two outputs.

(def ^:private uber-exclusions @#'tb.uber/uber-exclusions)
(def ^:private prep-handlers #'tb.uber/prep-handlers)
(def ^:private remove-optional #'tb.uber/remove-optional)
(def ^:private exclude-from-uber? #'tb.uber/exclude-from-uber?)

;;; Where each path in the uberjar comes from.

(defrecord ^:private ZipSource [^ZipFile zip ^ZipArchiveEntry entry])

;; `materialized?` marks a file in the working directory, which belongs to us. Any other file is someone else's (the
;; class dir, a lib directory) and is copied before a handler gets to touch it.
(defrecord ^:private FileSource [^File file materialized?])

(defn- open-source ^InputStream [source]
  (if (instance? ZipSource source)
    (.getInputStream ^ZipFile (:zip source) ^ZipArchiveEntry (:entry source))
    (io/input-stream (:file source))))

(defn- source-time ^FileTime [source]
  (if (instance? ZipSource source)
    (.getLastModifiedTime ^ZipArchiveEntry (:entry source))
    (FileTime/fromMillis (.lastModified ^File (:file source)))))

(defn- parent-dirs
  "`a/b/c` → `(\"a/b\" \"a\")`"
  [^String path]
  (loop [acc [], i (.lastIndexOf path "/")]
    (if (pos? i)
      (let [parent (subs path 0 i)]
        (recur (conj acc parent) (.lastIndexOf parent "/")))
      acc)))

(defn- context [{:keys [exclude conflict-handlers]}]
  (let [out-dir (.toFile (Files/createTempDirectory "uber" (make-array FileAttribute 0)))]
    {:out-dir  out-dir
     :buffer   (byte-array 65536)
     :handlers (prep-handlers conflict-handlers)
     :exclude  (map re-pattern (into uber-exclusions exclude))
     ;; path → source, in the order paths were first written
     :entries  (LinkedHashMap.)
     ;; every directory that holds a file, which `b/uber` would have created in its working directory
     :dirs     (HashSet.)
     :zips     (atom [])}))

(defn- add-entry! [{:keys [^Map entries ^HashSet dirs]} path source]
  (.put entries path source)
  (doseq [parent (parent-dirs path)]
    (.add dirs parent)))

(defn- materialize!
  "Write `path` to the working directory, if it isn't there already, and return that file. Conflict handlers read the
  existing content from a file, and may write to it."
  ^File [{:keys [out-dir ^Map entries] :as ctx} path]
  (let [source (.get entries path)]
    (if (:materialized? source)
      (:file source)
      (let [out-file (io/file out-dir path)]
        (io/make-parents out-file)
        (when source
          (with-open [is (open-source source)]
            (io/copy is out-file))
          (Files/setLastModifiedTime (.toPath out-file) (source-time source)))
        (add-entry! ctx path (->FileSource out-file true))
        out-file))))

(defn- emit!
  "`clojure.tools.build.tasks.uber/handler-emit`, writing to a path we then own."
  [{:keys [^bytes buffer] :as ctx} ^FileTime last-modified-time path {:keys [string stream append] :or {append false}}]
  (let [out-file (if append
                   (materialize! ctx path)
                   (doto (io/file (:out-dir ctx) path) io/make-parents))]
    (if string
      (spit out-file string :append ^boolean append)
      (with-open [os (io/output-stream out-file :append append)]
        (io/copy ^InputStream stream os :buffer-size (alength buffer))))
    (Files/setLastModifiedTime (.toPath out-file) last-modified-time)
    (add-entry! ctx path (->FileSource out-file true))))

(defn- handle-conflict
  "`clojure.tools.build.tasks.uber/handle-conflict`: the first handler whose pattern matches, in the same order."
  [{:keys [handlers] :as ctx} last-modified-time {:keys [state path] :as handler-params}]
  (let [use-handler (or (some (fn [[re handler]]
                                (when (re-matches re path)
                                  handler))
                              (dissoc handlers :default))
                        (:default handlers))]
    (if use-handler
      (let [{new-state :state, write :write} (use-handler handler-params)]
        (doseq [[path write-spec] write]
          (emit! ctx last-modified-time path write-spec))
        (or new-state state))
      (throw (ex-info (format "No handler found for conflict at %s" path) {})))))

(defn- add!
  "`clojure.tools.build.tasks.uber/explode1` for one entry from `lib`."
  [{:keys [exclude ^Map entries ^HashSet dirs out-dir] :as ctx} lib ^String path dir? source state]
  (cond
    (or (exclude-from-uber? exclude path) dir?)
    state

    ;; same file from several sources
    (.containsKey entries path)
    (let [existing (materialize! ctx path)]
      (with-open [is (open-source source)]
        (handle-conflict ctx (source-time source)
                         {:lib lib, :path path, :in is, :existing existing, :state state})))

    ;; a file where another lib has a directory. `b/uber` hands the handler the directory as `:existing`.
    (.contains dirs path)
    (let [existing (doto (io/file out-dir path) .mkdirs)]
      (with-open [is (open-source source)]
        (handle-conflict ctx (source-time source)
                         {:lib lib, :path path, :in is, :existing existing, :state state})))

    (some #(.containsKey entries %) (parent-dirs path))
    (throw (ex-info (format "Cannot write %s from %s as parent dir is a file from another lib. One of them must be excluded."
                            path lib) {}))

    :else
    (do (add-entry! ctx path source)
        state)))

(defn- add-lib-file!
  "`clojure.tools.build.tasks.uber/explode` for one path of `lib`."
  [{:keys [zips] :as ctx} ^File lib-file lib state]
  (cond
    (not (.exists lib-file))
    state

    (str/ends-with? (.getPath lib-file) ".jar")
    (let [^ZipFile zip (.get (.setFile (ZipFile/builder) lib-file))]
      (swap! zips conj zip)
      (reduce (fn [state ^ZipArchiveEntry entry]
                (let [path (.getName entry)
                      path (if (str/starts-with? path "/") (subs path 1) path)]
                  (add! ctx lib path (.isDirectory entry) (->ZipSource zip entry) state)))
              state
              (enumeration-seq (.getEntriesInPhysicalOrder zip))))

    (.isDirectory lib-file)
    (let [source-path (.toPath (.getAbsoluteFile lib-file))]
      (reduce (fn [state ^File f]
                (let [path (str/replace (str (.relativize source-path (.toPath f))) \\ \/)]
                  (add! ctx lib path (.isDirectory f) (->FileSource f false) state)))
              state
              (tb.file/collect-files (.getAbsoluteFile lib-file) :dirs true)))

    :else
    (throw (ex-info (format "Unexpected lib file: %s" lib-file) {}))))

;;; Writing the uberjar

(defn- manifest-bytes ^bytes [^Manifest manifest]
  (let [baos (ByteArrayOutputStream.)]
    (.write manifest baos)
    (.toByteArray baos)))

(defn- put-entry! [^ZipArchiveOutputStream zos ^String path ^bytes content]
  (let [entry (doto (ZipArchiveEntry. path)
                (.setMethod ZipEntry/DEFLATED))]
    (.putArchiveEntry zos entry)
    (.write zos content)
    (.closeArchiveEntry zos)))

(defn- copy-raw?
  "Whether the entry can go into the uberjar still compressed, as it is in its JAR. A JAR can also store an entry
  uncompressed, and the GraalPy ones store ~150 MB that way. `b/uber` compresses those, so they are compressed here too."
  [source path]
  (and (instance? ZipSource source)
       (let [^ZipArchiveEntry entry (:entry source)]
         (and (= path (.getName entry))
              (= ZipEntry/DEFLATED (.getMethod entry))))))

(defn- write-uberjar!
  [{:keys [^Map entries ^HashSet dirs]} ^File uber-file ^Manifest manifest]
  (io/make-parents uber-file)
  (with-open [zos (ZipArchiveOutputStream. uber-file)]
    (.setUseZip64 zos Zip64Mode/AsNeeded)
    ;; `JarInputStream` only finds a manifest at the start of the JAR
    (put-entry! zos "META-INF/MANIFEST.MF" (manifest-bytes manifest))
    ;; Directory entries are what `ClassLoader/getResource` finds for a directory.
    (doseq [dir (sort dirs)]
      (.putArchiveEntry zos (doto (ZipArchiveEntry. (str dir "/"))
                              (.setMethod ZipEntry/DEFLATED)))
      (.closeArchiveEntry zos))
    (let [threads  (.availableProcessors (Runtime/getRuntime))
          scatter  (ParallelScatterZipCreator. (Executors/newFixedThreadPool threads))
          raw      (java.util.ArrayList.)]
      (doseq [^java.util.Map$Entry e (.entrySet entries)
              :let [path   (.getKey e)
                    source (.getValue e)]]
        (if (copy-raw? source path)
          (.add raw source)
          (.addArchiveEntry scatter
                            (doto (ZipArchiveEntry. ^String path)
                              (.setMethod ZipEntry/DEFLATED)
                              (.setLastModifiedTime (source-time source)))
                            (reify InputStreamSupplier
                              (get [_] (open-source source))))))
      ;; compresses on every core, and shuts the pool down once done
      (.writeTo scatter zos)
      (doseq [{:keys [^ZipFile zip ^ZipArchiveEntry entry]} raw]
        (.addRawArchiveEntry zos entry (.getRawInputStream zip entry))))))

(defn uber
  "Build an uberjar like `clojure.tools.build.api/uber`, with these differences:

  - `:manifest` is the `java.util.jar.Manifest` to write, as is. `b/uber` takes attributes to add to its own.
  - `:extra-files` is a seq of `[path file]` written into the uberjar after everything else, where nothing may be yet.
    It is for files that must skip the exclusions, like sources that `b/uber` strips."
  [{:keys [basis class-dir uber-file manifest extra-files] :as params}]
  (let [{:keys [out-dir zips] :as ctx} (context params)]
    (try
      (reduce (fn [state [lib coord]]
                (reduce (fn [state path]
                          (add-lib-file! ctx (io/file path) lib state))
                        state
                        (:paths coord)))
              nil
              ;; the same map `b/uber` builds, so libs are visited in the same order
              (assoc (remove-optional (:libs basis)) nil {:paths [(b/resolve-path class-dir)]}))
      (doseq [[path ^File file] extra-files]
        (when (or (.containsKey ^Map (:entries ctx) path) (.contains ^HashSet (:dirs ctx) path))
          (throw (ex-info (format "%s is already in the uberjar" path) {:path path, :file file})))
        (add-entry! ctx path (->FileSource file false)))
      (write-uberjar! ctx (b/resolve-path uber-file) manifest)
      (finally
        (run! #(.close ^ZipFile %) @zips)
        (tb.file/delete out-dir)))))
