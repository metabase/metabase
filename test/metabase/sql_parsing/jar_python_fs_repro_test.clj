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

(deftest ^:parallel newByteChannel-returns-in-memory-channel-test
  (testing "newByteChannel on a compressed zip entry returns an in-memory ByteArrayChannel rather than
            extracting to a temp file beside the jar.
            With the stock GraalVM wrapper, the channel is `ZipFileSystem$1` (FileChannel-backed via
            temp-file extraction) — that path fails when the jar's parent dir isn't writable."
    (let [zip-file (Files/createTempFile "metabase-fs-repro" ".zip" (make-array FileAttribute 0))]
      (try
        ;; Write a DEFLATE-compressed zip entry — the case that triggered the bug; STORED entries don't
        ;; need temp extraction.
        (with-open [zos (ZipOutputStream. (FileOutputStream. (str zip-file)))]
          (.setLevel zos java.util.zip.Deflater/DEFAULT_COMPRESSION)
          (let [entry (ZipEntry. "/python-sources/sql_tools.py")]
            (.setMethod entry ZipEntry/DEFLATED)
            (.putNextEntry zos entry)
            (.write zos (.getBytes "print('hello')\n" "UTF-8"))
            (.closeEntry zos)))
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
