(ns metabase.util.compress-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress])
  (:import
   (java.io ByteArrayOutputStream File)
   (java.nio.file Files)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveOutputStream TarConstants)
   (org.apache.commons.compress.compressors.gzip GzipCompressorOutputStream)))

(set! *warn-on-reflection* true)

(deftest ^:parallel compress-test
  (testing "tgz/untgz"
    (let [dir     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)
          archive (io/file (str (.getName dir) ".tar.gz"))
          out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)]
      (try
        (spit (io/file dir "one") (mt/random-hash))
        (spit (io/file dir "two") (mt/random-hash))
        (testing "it is indeed a gzip archive"
          (u.compress/tgz dir archive)
          (let [bytes (Files/readAllBytes (.toPath archive))]
            ;; https://www.ietf.org/rfc/rfc1952.txt, section 2.3.1
            (is (= [(unchecked-byte 0x1f) (unchecked-byte 0x8b)]
                   (take 2 bytes)))))
        (testing "uncompressing generates identical folder"
          (u.compress/untgz archive out)
          (is (= (mapv slurp (filter #(.isFile ^File %) (file-seq dir)))
                 (mapv slurp (filter #(.isFile ^File %) (file-seq out))))))
        (finally
          (run! io/delete-file (reverse (file-seq dir)))
          (when (.exists archive)
            (io/delete-file archive))
          (run! io/delete-file (reverse (file-seq out))))))))

(defn- create-tgz
  "Build an archive from path-or-entry and byte-content pairs."
  ^bytes [entries]
  (let [out (ByteArrayOutputStream.)]
    (with-open [tar (-> out
                        (GzipCompressorOutputStream.)
                        (TarArchiveOutputStream. 512 "UTF-8"))]
      (doseq [[path ^bytes content] entries
              :let [entry (if (string? path) (TarArchiveEntry. ^String path true) path)]]
        (when content
          (.setSize ^TarArchiveEntry entry (alength content)))
        (.putArchiveEntry tar entry)
        (when content
          (.write tar content))
        (.closeArchiveEntry tar)))
    (.toByteArray out)))

(deftest ^:parallel extraction-limits-test
  (let [content (byte-array 1024)
        files   (into {} (for [i (range 10)] [(str "file-" i) content]))
        archive (create-tgz files)
        out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name)) .mkdirs)]
    (try
      (doseq [extract [#(u.compress/untgz archive out %) #(u.compress/untgz-files archive %)]]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"max uncompressed bytes"
                              (extract {:max-uncompressed-bytes 4096})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"max entries"
                              (extract {:max-entries 5}))))
      (is (= 10 (u.compress/untgz archive out)))
      (is (= (update-vals files seq) (update-vals (u.compress/untgz-files archive) seq)))
      (finally
        (run! io/delete-file (reverse (file-seq out)))))))

(deftest ^:parallel untgz-path-traversal-test
  (let [out (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name)) .mkdirs)]
    (try
      (doseq [path ["../../escape" "../escape" "foo/../../escape"]]
        (is (thrown? java.io.IOException
                     (u.compress/untgz (create-tgz [[path (.getBytes "{}" "UTF-8")]]) out))))
      (finally
        (run! io/delete-file (reverse (file-seq out)))))))

(deftest ^:parallel tgz-bytes-test
  (let [files {"file.txt" (.getBytes "{}" "UTF-8")
               "dir/file.bin" (byte-array [0 (int 0x80) (int 0xff) 1])}]
    (is (= (update-vals files seq)
           (update-vals (u.compress/untgz-files (u.compress/tgz-bytes files)) seq)))
    (testing "entry order does not affect archive bytes"
      (is (= (seq (u.compress/tgz-bytes files))
             (seq (u.compress/tgz-bytes (into (sorted-map-by #(compare %2 %1)) files)))))))
  (doseq [path ["../escape" "/absolute" "foo/../bar" "" "a//b"]]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"invalid path"
                          (u.compress/tgz-bytes {path (.getBytes "{}" "UTF-8")})))))

(deftest ^:parallel tgz-bytes-compresses-at-the-maximum-level-test
  (let [bytes (u.compress/tgz-bytes {"file.txt" (.getBytes "{}" "UTF-8")})]
    ;; RFC 1952: XFL = 2 indicates maximum compression.
    (is (= 2 (aget bytes 8)))))

(deftest ^:parallel untgz-files-normalizes-paths-test
  (let [content (.getBytes "{}" "UTF-8")]
    (doseq [path ["./dir/file.txt" "././dir/./file.txt"]]
      (is (= {"dir/file.txt" (seq content)}
             (update-vals (u.compress/untgz-files (create-tgz [[path content]])) seq))))))

(deftest ^:parallel untgz-files-rejects-unsafe-paths-test
  (doseq [path ["../../escape" "foo/../../escape" "foo/../bar" "./../escape" "/absolute" "a//b" "a\\b"]]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"invalid path"
                          (u.compress/untgz-files (create-tgz [[path (.getBytes "{}" "UTF-8")]]))))))

(deftest ^:parallel extraction-skips-hidden-and-special-entries-test
  (let [content (.getBytes "{}" "UTF-8")
        archive (create-tgz
                 [[(doto (TarArchiveEntry. "link.txt" TarConstants/LF_SYMLINK)
                     (.setLinkName "/etc/passwd")) nil]
                  [(doto (TarArchiveEntry. "hard.txt" TarConstants/LF_LINK)
                     (.setLinkName "real.txt")) nil]
                  [(TarArchiveEntry. "pipe" TarConstants/LF_FIFO) nil]
                  [".hidden" content]
                  ["real.txt" content]])
        out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name)) .mkdirs)]
    (try
      (is (= {"real.txt" (seq content)} (update-vals (u.compress/untgz-files archive) seq)))
      (u.compress/untgz archive out)
      (is (= ["real.txt"] (vec (.list out))))
      (is (= "{}" (slurp (io/file out "real.txt"))))
      (finally
        (run! io/delete-file (reverse (file-seq out)))))))
