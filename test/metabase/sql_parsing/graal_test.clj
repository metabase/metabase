(ns metabase.sql-parsing.graal-test
  "Regression for https://github.com/metabase/metabase/issues/73541.

  GraalVM's bundled polyglot `FileSystem` wrapper routes `newByteChannel` through
  `provider.newFileChannel`, which forces JDK ZipFileSystem to extract deflated entries to a temp file
  beside the jar — fails when that directory isn't writable (non-root in a Kubernetes pod).
  The fix in `metabase.sql-parsing.graal/nio-polyglot-fs` overrides `newByteChannel` to call
  `Files/newByteChannel`, which returns an in-memory `ByteArrayChannel` for compressed entries."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics-interface]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-parsing.graal :as graal]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util.files :as u.files])
  (:import
   (java.io FileOutputStream)
   (java.nio.channels FileChannel)
   (java.nio.file Files StandardOpenOption)
   (java.nio.file.attribute FileAttribute)
   (java.util EnumSet)
   (java.util.concurrent TimeoutException)
   (java.util.zip ZipEntry ZipOutputStream)
   (org.graalvm.polyglot.io FileSystem)))

(set! *warn-on-reflection* true)

(deftest ^:parallel new-byte-channel-returns-in-memory-channel-test
  (testing "newByteChannel on a compressed zip entry returns an in-memory channel rather than extracting
            to a temp file beside the jar. With the stock GraalVM wrapper, the channel is a `FileChannel`
            backed by temp-file extraction — that path fails when the jar's parent dir isn't writable."
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
          (let [^FileSystem polyfs (#'graal/read-only-polyglot-fs nio-fs)
                path               (.parsePath polyfs "/python-sources/sql_tools.py")]
            (with-open [ch (.newByteChannel polyfs path
                                            (EnumSet/of StandardOpenOption/READ)
                                            (make-array FileAttribute 0))]
              (is (not (instance? FileChannel ch))
                  "Channel must not be a FileChannel — that implies temp-file extraction beside the jar."))))
        (finally
          (Files/deleteIfExists zip-file))))))

(deftest timeout-surfaces-even-when-metric-inc-fails-test
  (testing (str "A fired Python-call timeout still surfaces as TimeoutException from the API even if "
                "the timeout-metric bump throws — a misconfigured analytics registry must not shadow "
                "the timeout (#77084).")
    (dynamic-redefs/with-dynamic-fn-redefs [;; force the timeout branch of do-with-python-context without waiting 30s
                                            graal/with-timeout* (fn [_ _] :metabase.sql-parsing.graal/timeout)
                                            ;; poison only the timeout metric; leave the acquisition inc! alone
                                            analytics-interface/inc! (fn [k & _]
                                                                       (when (= k :metabase-sql-parsing/context-timeouts)
                                                                         (throw (Exception. "boom"))))]
      (is (thrown? TimeoutException
                   (sql-parsing/referenced-tables "postgres" "SELECT 1"))))))
