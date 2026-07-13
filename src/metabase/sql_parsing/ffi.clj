(ns metabase.sql-parsing.ffi
  "JNA bindings for `polyglot-sql-ffi` (https://github.com/tobilg/polyglot), a native Rust SQL
  parser/transpiler with sqlglot-compatible dialect behavior. This is the only namespace that talks
  to the native library; everything else in the module works with the JSON AST and SQL strings it
  returns.

  The C API is stateless and thread-safe: every function takes UTF-8 strings and returns a
  `polyglot_result_t` struct by value whose strings the caller must free with
  `polyglot_free_result`. Panics inside the library are caught at the FFI boundary and surface as
  an error status, so a malformed input cannot crash the JVM.

  The shared library is looked up on the classpath at
  `polyglot-sql-ffi/<os>-<arch>/<libname>` (bundled into the uberjar by `bin/build`), or taken from
  `MB_POLYGLOT_SQL_FFI_PATH`. In dev, when the library is missing, it is downloaded on first use
  from the project's GitHub release pinned by `resources/polyglot-sql-ffi/version.txt`."
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [metabase.sql-parsing.ast :as ast]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (clojure.asm ClassWriter Opcodes)
   (clojure.lang DynamicClassLoader)
   (com.sun.jna Function NativeLibrary Pointer Structure)
   (java.io File)
   (java.nio.file Files Path)
   (java.nio.file.attribute FileAttribute PosixFilePermission PosixFilePermissions)
   (java.security DigestInputStream MessageDigest)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- library resolution -------------------------------------------

(def ^:private library-version
  (delay (str/trim (slurp (io/resource "polyglot-sql-ffi/version.txt")))))

(defn- platform
  "`<os>-<arch>` directory name the library is published under, or nil on unsupported platforms.
  Matches the artifact naming of polyglot-sql-ffi releases."
  []
  (let [os-name (u/lower-case-en (System/getProperty "os.name" ""))
        arch    (u/lower-case-en (System/getProperty "os.arch" ""))
        os      (cond
                  (str/includes? os-name "linux")   "linux"
                  (str/includes? os-name "mac")     "macos"
                  (str/includes? os-name "windows") "windows")
        arch    (case arch
                  ("aarch64" "arm64") "aarch64"
                  ("x86_64" "amd64")  "x86_64"
                  nil)]
    (when (and os arch (not= [os arch] ["windows" "aarch64"]))
      (str os "-" arch))))

(defn- library-file-name
  []
  (let [os-name (u/lower-case-en (System/getProperty "os.name" ""))]
    (cond
      (str/includes? os-name "mac")     "libpolyglot_sql_ffi.dylib"
      (str/includes? os-name "windows") "polyglot_sql_ffi.dll"
      :else                             "libpolyglot_sql_ffi.so")))

(defn- library-resource-path
  []
  (when-let [platform-dir (platform)]
    (str "polyglot-sql-ffi/" platform-dir "/" (library-file-name))))

;;; dev-mode download

(def ^:private dev-resources-dir
  "Directory the library is downloaded to in dev; on the classpath via `resources`."
  "resources/polyglot-sql-ffi")

(defn- sha-256
  ^String [^File file]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (with-open [in (DigestInputStream. (io/input-stream file) digest)]
      (io/copy in (java.io.OutputStream/nullOutputStream)))
    (format "%064x" (BigInteger. 1 (.digest digest)))))

(defn- release-url
  [version file-name]
  (str "https://github.com/tobilg/polyglot/releases/download/v" version "/" file-name))

(defn- expected-artifact-sha
  "SHA-256 for `artifact-name` from the release's checksums file, or nil if it cannot be fetched."
  [version artifact-name]
  (try
    (->> (str/split-lines (slurp (release-url version "checksums.sha256")))
         (some (fn [line]
                 (let [[sha file] (str/split (str/trim line) #"\s+")]
                   (when (and file (str/ends-with? file artifact-name))
                     sha)))))
    (catch Exception e
      (log/warn e "Could not fetch polyglot-sql-ffi checksums; skipping verification")
      nil)))

(defn- artifact-extension
  [platform-dir]
  (if (str/starts-with? platform-dir "windows") ".zip" ".tar.gz"))

(defn- download-artifact!
  "Download and verify the release archive for `platform-dir`, returning it as a temp File."
  ^File [version platform-dir]
  (let [extension     (artifact-extension platform-dir)
        artifact-name (str "polyglot-sql-ffi-" platform-dir extension)
        url           (release-url version artifact-name)
        archive       (File/createTempFile "polyglot-sql-ffi-" extension)]
    (log/info "Downloading" url)
    (with-open [in (io/input-stream (java.net.URL. url))]
      (io/copy in archive))
    (when-let [expected (expected-artifact-sha version artifact-name)]
      (let [actual (sha-256 archive)]
        (when-not (= expected actual)
          (.delete archive)
          (throw (ex-info "polyglot-sql-ffi download checksum mismatch"
                          {:artifact artifact-name :expected expected :actual actual})))))
    archive))

(defn- extract-library!
  "Extract the shared library file named `lib-name` from `archive` into `target-file`."
  [^File archive lib-name ^File target-file]
  (let [tmp-dir (.toFile (Files/createTempDirectory "polyglot-sql-ffi-" (make-array FileAttribute 0)))
        {:keys [exit err]} (if (str/ends-with? (.getName archive) ".zip")
                             (shell/sh "unzip" "-o" "-q" (.getAbsolutePath archive) "-d" (.getAbsolutePath tmp-dir))
                             (shell/sh "tar" "-xzf" (.getAbsolutePath archive) "-C" (.getAbsolutePath tmp-dir)))]
    (when-not (zero? exit)
      (throw (ex-info (str "Failed to extract polyglot-sql-ffi archive: " err) {})))
    (let [lib (->> (file-seq tmp-dir)
                   (filter #(= (.getName ^File %) lib-name))
                   first)]
      (when-not lib
        (throw (ex-info (str lib-name " not found in polyglot-sql-ffi archive") {})))
      (io/make-parents target-file)
      (io/copy ^File lib target-file))))

(defn download-library!
  "Download the polyglot-sql-ffi shared library for `platform-dir` (e.g. `\"linux-x86_64\"`) into
  `target-file`, verifying its checksum. Used lazily in dev and by the build to bundle libraries
  for every platform into the uberjar."
  [platform-dir lib-name target-file]
  (let [archive (download-artifact! @library-version platform-dir)]
    (try
      (extract-library! archive lib-name target-file)
      (finally
        (.delete ^File archive)))))

(def ^:private dev-download-lock (Object.))

(defn- ensure-dev-library!
  "In dev (running from source, `resources/` present), make sure the library for this platform is
  downloaded, returning its path or nil when the platform is unsupported."
  []
  (when-let [platform-dir (platform)]
    (when (.isDirectory (io/file "resources"))
      (locking dev-download-lock
        (let [target (io/file dev-resources-dir platform-dir (library-file-name))]
          (when-not (.exists target)
            (log/info "polyglot-sql-ffi library not found, downloading (first use in dev)...")
            (download-library! platform-dir (library-file-name) target))
          (.getAbsolutePath target))))))

;;; extraction from the classpath (uberjar)

(defn- owner-only-permissions
  ^"[Ljava.nio.file.attribute.FileAttribute;" []
  (into-array FileAttribute
              [(PosixFilePermissions/asFileAttribute
                #{PosixFilePermission/OWNER_READ
                  PosixFilePermission/OWNER_WRITE
                  PosixFilePermission/OWNER_EXECUTE})]))

(defn- extract-resource!
  "Copy the library classpath resource into a private temp directory, returning its absolute path."
  ^String [resource]
  (let [dir  (Files/createTempDirectory "metabase-polyglot-sql-" (owner-only-permissions))
        file (.toFile (.resolve ^Path dir ^String (library-file-name)))]
    (.deleteOnExit file)
    (.deleteOnExit (.toFile dir))
    (with-open [in (io/input-stream resource)]
      (io/copy in file))
    (.getAbsolutePath file)))

(def ^:private library-path
  "Absolute path of the shared library, or nil when none is available for this platform.
  `MB_POLYGLOT_SQL_FFI_PATH` overrides the classpath lookup."
  (delay
    (or (not-empty (System/getenv "MB_POLYGLOT_SQL_FFI_PATH"))
        (when-let [resource (some-> (library-resource-path) io/resource)]
          (if (= "file" (.getProtocol ^java.net.URL resource))
            (.getAbsolutePath (io/file resource))
            (extract-resource! resource)))
        (ensure-dev-library!))))

(def ^:private library
  (delay
    ;; JNA marshals Java strings with `jna.encoding`, which is not UTF-8 on all platforms by
    ;; default; SQL routinely contains non-ASCII text.
    (System/setProperty "jna.encoding" "UTF-8")
    (NativeLibrary/getInstance
     (or ^String @library-path
         (throw (ex-info (str "No polyglot-sql-ffi library available for this platform. "
                              "Set MB_POLYGLOT_SQL_FFI_PATH to a libpolyglot_sql_ffi build.")
                         {:os (System/getProperty "os.name") :arch (System/getProperty "os.arch")}))))))

(defn- library-fn
  ^Function [fn-name]
  (.getFunction ^NativeLibrary @library ^String fn-name))

(defn available?
  "Whether the native library can be loaded on this platform."
  []
  (boolean @library-path))

;;; ------------------------------------------- result struct -------------------------------------------

;; The C API returns `polyglot_result_t {char *data; char *error; int32_t status;}` BY VALUE, which
;; JNA can only marshal through a concrete `Structure` + `Structure.ByValue` class with public
;; fields. The codebase has no Java sources and `gen-class` only emits bytecode under AOT, so the
;; class is assembled directly with the ASM shipped inside Clojure.
(def ^:private result-class
  (delay
    (let [class-name "metabase.sql_parsing.ffi.PolyglotResult"
          internal   "metabase/sql_parsing/ffi/PolyglotResult"
          cw         (ClassWriter. ClassWriter/COMPUTE_FRAMES)]
      (.visit cw Opcodes/V1_8 (bit-or Opcodes/ACC_PUBLIC Opcodes/ACC_SUPER)
              internal nil "com/sun/jna/Structure"
              (into-array String ["com/sun/jna/Structure$ByValue"]))
      (let [av  (.visitAnnotation cw "Lcom/sun/jna/Structure$FieldOrder;" true)
            arr (.visitArray av "value")]
        (doseq [field-name ["data" "error" "status"]]
          (.visit arr nil field-name))
        (.visitEnd arr)
        (.visitEnd av))
      (doseq [[field-name descriptor] [["data" "Lcom/sun/jna/Pointer;"]
                                       ["error" "Lcom/sun/jna/Pointer;"]
                                       ["status" "I"]]]
        (.visitEnd (.visitField cw Opcodes/ACC_PUBLIC field-name descriptor nil nil)))
      (let [mv (.visitMethod cw Opcodes/ACC_PUBLIC "<init>" "()V" nil nil)]
        (.visitCode mv)
        (.visitVarInsn mv Opcodes/ALOAD 0)
        (.visitMethodInsn mv Opcodes/INVOKESPECIAL "com/sun/jna/Structure" "<init>" "()V" false)
        (.visitInsn mv Opcodes/RETURN)
        (.visitMaxs mv 1 1)
        (.visitEnd mv))
      (.visitEnd cw)
      (.defineClass (DynamicClassLoader. (.getClassLoader Structure))
                    class-name (.toByteArray cw) nil))))

;;; ------------------------------------------- calls -------------------------------------------

(def ^:private status->error-type
  {1  ::parse-error
   2  ::generate-error
   3  ::transpile-error
   4  ::validation-error
   5  ::invalid-argument
   6  ::json-error
   99 ::internal-panic})

(defn parse-error?
  "Whether `e` is an exception thrown for SQL that the native library could not parse."
  [e]
  (= (:type (ex-data e)) ::parse-error))

(def ^:private parse-error-message-pattern
  #"(?s)^Parse error at line (\d+), column (\d+): (.*)$")

(defn- sqlglot-style-message
  "Rephrase the library's parse-error message into the format sqlglot uses
  (`Invalid expression / Unexpected token. Line 1, Col: 23.`), which downstream consumers such as
  the metabot ai-service integration expect."
  [message]
  (if-let [[_ line col detail] (some->> message (re-matches parse-error-message-pattern))]
    (str detail ". Line " line ", Col: " col ".")
    message))

(defn- invoke-ffi
  "Call a `polyglot_*` function returning `polyglot_result_t`, returning the `data` string on
  success and throwing an ex-info tagged with the error type on failure."
  ^String [fn-name args]
  (let [^Structure ret (.invoke (library-fn fn-name) ^Class @result-class (to-array args))
        result         (try
                         {:status (.readField ret "status")
                          :data   (some-> ^Pointer (.readField ret "data") (.getString 0 "UTF-8"))
                          :error  (some-> ^Pointer (.readField ret "error") (.getString 0 "UTF-8"))}
                         (finally
                           (.invokeVoid (library-fn "polyglot_free_result") (to-array [ret]))))
        {:keys [status data error]} result]
    (if (zero? ^int status)
      data
      (throw (ex-info (or (cond-> error
                            (= status 1) sqlglot-style-message)
                          (str fn-name " failed with status " status))
                      {:type   (status->error-type status ::error)
                       :fn     fn-name
                       :status status})))))

(defn- dialect-str
  "The library accepts dialect names case-insensitively with sqlglot-style aliases (`postgres`,
  `tsql`, ...); an empty string selects the generic dialect."
  ^String [dialect]
  (or dialect ""))

;;; ------------------------------------------- public API -------------------------------------------

(defn- post-parse
  "Dialect-specific AST normalization applied to everything that comes out of the parser."
  [dialect node]
  (cond-> node
    (= dialect "bigquery") ast/split-quoted-table-paths))

(defn parse
  "Parse `sql` (possibly multiple statements) into a vector of AST nodes (keywordized JSON)."
  [dialect sql]
  (post-parse dialect (json/decode+kw (invoke-ffi "polyglot_parse" [sql (dialect-str dialect)]))))

(defn parse-one
  "Parse `sql` into a single AST node. Throws if `sql` is not exactly one statement."
  [dialect sql]
  (post-parse dialect (json/decode+kw (invoke-ffi "polyglot_parse_one" [sql (dialect-str dialect)]))))

(defn generate
  "Generate SQL strings from a sequence of AST nodes, returning a vector of SQL strings."
  [dialect ast-nodes]
  (json/decode (invoke-ffi "polyglot_generate" [(json/encode ast-nodes) (dialect-str dialect)])))

(defn generate-one
  "Generate the SQL string for a single AST node."
  ^String [dialect ast-node]
  (first (generate dialect [ast-node])))

(defn transpile
  "Transpile `sql` between dialects, returning a vector of SQL strings (one per statement).
  `options` supports e.g. `{:pretty true}`."
  ([from-dialect to-dialect sql]
   (transpile from-dialect to-dialect sql nil))
  ([from-dialect to-dialect sql options]
   (json/decode (invoke-ffi "polyglot_transpile_with_options"
                            [sql (dialect-str from-dialect) (dialect-str to-dialect)
                             (json/encode (or options {}))]))))

(defn format-sql
  "Pretty-print `sql`, returning a vector of formatted SQL strings (one per statement)."
  [dialect sql]
  (json/decode (invoke-ffi "polyglot_format" [sql (dialect-str dialect)])))

(defn lineage
  "Column lineage graph for `column-name` in `sql` as keywordized JSON
  (`{:name .. :expression .. :downstream [..]}`). `schema` is an optional ValidationSchema map
  (`{:tables [{:name .. :schema .. :columns [{:name .. :type ..}]}]}`) used to resolve columns."
  ([dialect sql column-name]
   (json/decode+kw (invoke-ffi "polyglot_lineage" [column-name sql (dialect-str dialect)])))
  ([dialect sql column-name schema]
   (if (seq (:tables schema))
     (json/decode+kw (invoke-ffi "polyglot_lineage_with_schema"
                                 [column-name sql (json/encode schema) (dialect-str dialect)]))
     (lineage dialect sql column-name))))

(defn library-version-info
  "Version string reported by the loaded native library."
  []
  (.invokeString (library-fn "polyglot_version") (to-array []) false))
