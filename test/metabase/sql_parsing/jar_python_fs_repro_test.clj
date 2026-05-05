(ns metabase.sql-parsing.jar-python-fs-repro-test
  "Regression for https://github.com/metabase/metabase/issues/73541.

  GraalVM's bundled polyglot `FileSystem` wrapper routes `newByteChannel` through
  `provider.newFileChannel`, which forces JDK ZipFileSystem to extract deflated entries to a temp file
  beside the jar — fails when that directory isn't writable (non-root in a Kubernetes pod).
  The fix in `metabase.sql-parsing.pool/nio-polyglot-fs` overrides `newByteChannel` to call
  `Files/newByteChannel`, which returns an in-memory `ByteArrayChannel` for compressed entries."
  (:require
   [clojure.test :refer :all]
   [metabase.sql-parsing.pool :as pool]
   [metabase.util.files :as u.files])
  (:import
   (java.io FileOutputStream)
   (java.nio.file Files StandardOpenOption)
   (java.nio.file.attribute FileAttribute)
   (java.util EnumSet)
   (java.util.zip ZipEntry ZipOutputStream)
   (org.graalvm.polyglot.io FileSystem)))

(set! *warn-on-reflection* true)

(defn- write-deflated-zip!
  "Writes a zip at `path` containing `entries` as DEFLATE-compressed entries (the case that triggered the
  bug — STORED entries don't need temp extraction)."
  [^String path entries]
  (with-open [zos (ZipOutputStream. (FileOutputStream. path))]
    (.setLevel zos java.util.zip.Deflater/DEFAULT_COMPRESSION)
    (doseq [[entry-path content] entries]
      (let [e (ZipEntry. (str entry-path))]
        (.setMethod e ZipEntry/DEFLATED)
        (.putNextEntry zos e)
        (.write zos (.getBytes ^String content "UTF-8"))
        (.closeEntry zos)))))

(deftest ^:parallel newByteChannel-returns-in-memory-channel-test
  (testing "newByteChannel on a compressed zip entry returns an in-memory ByteArrayChannel rather than
            extracting to a temp file beside the jar.
            With the stock GraalVM wrapper, the channel is `ZipFileSystem$1` (FileChannel-backed via
            temp-file extraction) — that path fails when the jar's parent dir isn't writable."
    (let [zip-file (Files/createTempFile "metabase-fs-repro" ".zip" (make-array FileAttribute 0))]
      (try
        (write-deflated-zip! (str zip-file) [["/python-sources/sql_tools.py" "print('hello')\n"]])
        (with-open [^java.nio.file.FileSystem nio-fs (u.files/nio-fs (str zip-file))]
          (let [^FileSystem polyfs (#'pool/read-only-polyglot-fs nio-fs)
                path               (.parsePath polyfs "/python-sources/sql_tools.py")]
            (with-open [ch (.newByteChannel polyfs path
                                            (EnumSet/of StandardOpenOption/READ)
                                            (make-array FileAttribute 0))]
              (is (= "jdk.nio.zipfs.ByteArrayChannel" (-> ch class .getName))
                  "Channel must be the in-memory ByteArrayChannel; a FileChannel implies temp-file extraction."))))
        (finally
          (Files/deleteIfExists zip-file))))))
