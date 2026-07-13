(ns build.polyglot-ffi
  "Build step that downloads the polyglot-sql-ffi native library for every supported platform into
  `resources/polyglot-sql-ffi/`, so the uberjar can load the right one at runtime wherever it
  runs. The version is pinned by `resources/polyglot-sql-ffi/version.txt`."
  (:require
   [clojure.java.io :as io]
   [environ.core :as env]
   [metabase.sql-parsing.ffi :as sql-parsing.ffi]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(def ^:private platform->library-file-name
  {"linux-x86_64"   "libpolyglot_sql_ffi.so"
   "linux-aarch64"  "libpolyglot_sql_ffi.so"
   "macos-x86_64"   "libpolyglot_sql_ffi.dylib"
   "macos-aarch64"  "libpolyglot_sql_ffi.dylib"
   "windows-x86_64" "polyglot_sql_ffi.dll"})

(defn download-polyglot-ffi!
  "Download the polyglot-sql-ffi shared library for every platform into `resources` for bundling
  into the uberjar. Can be skipped by setting SKIP_POLYGLOT_FFI=true."
  [_edition]
  (if (= (env/env :skip-polyglot-ffi) "true")
    (u/announce "Skipping polyglot-sql-ffi libraries (SKIP_POLYGLOT_FFI=true)")
    (u/step "Download polyglot-sql-ffi native libraries"
      (doseq [[platform lib-name] (sort platform->library-file-name)
              :let [target (io/file u/project-root-directory
                                    "resources" "polyglot-sql-ffi" platform lib-name)]]
        (if (.exists target)
          (u/announce "%s already present" (str target))
          (do
            (sql-parsing.ffi/download-library! platform lib-name target)
            (u/announce "Downloaded %s" (str target))))))))
