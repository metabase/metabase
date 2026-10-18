(ns metabase.util.compress-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress])
  (:import
   (java.io File)
   (java.nio.file Files)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveOutputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorOutputStream)))

(set! *warn-on-reflection* true)

(deftest compress-test
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
  "Create a tar.gz archive."
  ^File [entry-name ^bytes content]
  (let [archive (File/createTempFile "archive" ".tar.gz")]
    (with-open [tar (-> (io/output-stream archive)
                        (GzipCompressorOutputStream.)
                        (TarArchiveOutputStream. 512 "UTF-8"))]
      (let [entry (doto (TarArchiveEntry. ^String entry-name true)
                    (.setSize (alength content)))]
        (.putArchiveEntry tar entry)
        (.write tar content)
        (.closeArchiveEntry tar)))
    archive))

(defn- create-multi-entry-tgz
  "Create a tar.gz archive with `n` entries each holding `content`."
  ^File [n ^bytes content]
  (let [archive (File/createTempFile "archive" ".tar.gz")]
    (with-open [tar (-> (io/output-stream archive)
                        (GzipCompressorOutputStream.)
                        (TarArchiveOutputStream. 512 "UTF-8"))]
      (dotimes [i n]
        (let [entry (doto (TarArchiveEntry. (format "file-%d" i))
                      (.setSize (alength content)))]
          (.putArchiveEntry tar entry)
          (.write tar content)
          (.closeArchiveEntry tar))))
    archive))

(deftest untgz-max-uncompressed-bytes-test
  (testing "untgz aborts when total uncompressed bytes exceed :max-uncompressed-bytes"
    (let [content (.getBytes ^String (apply str (repeat 1024 \a)) "UTF-8")
          archive (create-multi-entry-tgz 10 content) ;; 10 KiB total uncompressed
          out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"max uncompressed bytes"
                              (u.compress/untgz archive out {:max-uncompressed-bytes 4096})))
        (testing "no limit means no error"
          (is (= 10 (u.compress/untgz archive out))))
        (finally
          (io/delete-file archive true)
          (run! #(io/delete-file % true) (reverse (file-seq out))))))))

(deftest untgz-max-entries-test
  (testing "untgz aborts when entry count exceeds :max-entries"
    (let [content (.getBytes "x" "UTF-8")
          archive (create-multi-entry-tgz 10 content)
          out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"max entries"
                              (u.compress/untgz archive out {:max-entries 5})))
        (finally
          (io/delete-file archive true)
          (run! #(io/delete-file % true) (reverse (file-seq out))))))))

(deftest untgz-path-traversal-test
  (testing "untgz rejects tar entries with path traversal"
    (let [content (.getBytes "content" "UTF-8")
          out     (doto (io/file (System/getProperty "java.io.tmpdir") (mt/random-name))
                    .mkdirs)]
      (doseq [file-name ["../../etc/foo" "../escape" "foo/../../escape"]]
        (let [archive (create-tgz file-name content)]
          (try
            (is (thrown? java.io.IOException
                         (u.compress/untgz archive out)))
            (finally
              (io/delete-file archive true)
              (run! #(io/delete-file % true) (reverse (file-seq out))))))))))

(deftest tgz-bytes-test
  (let [files {"dist/index.js"        (.getBytes "console.log('hi')" "UTF-8")
               "metabase-plugin.json" (.getBytes "{}" "UTF-8")
               "dist/assets/icon.png" (byte-array [0 (int 0x80) (int 0xff) 1])}]
    (testing "an archive of a map of files reads back as the same map"
      (is (= (update-vals files seq)
             (update-vals (u.compress/untgz-files (u.compress/tgz-bytes files)) seq))))
    (testing "the same files always make the same bytes, whatever their order or the time"
      (is (= (seq (u.compress/tgz-bytes files))
             (seq (u.compress/tgz-bytes (into (sorted-map-by (fn [a b] (compare b a))) files))))))
    (testing "an entry path that could leave a directory is refused"
      (doseq [path ["../escape" "/etc/passwd" "foo/../bar" "" "a//b"]]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"invalid path"
                              (u.compress/tgz-bytes {path (.getBytes "x" "UTF-8")})))))))

(deftest untgz-files-test
  (testing "dot segments in file names are normalized"
    (doseq [path ["./dist/index.js" "././dist/./index.js"]]
      (let [content (.getBytes "script" "UTF-8")
            archive (create-tgz path content)]
        (try
          (is (= {"dist/index.js" (seq content)}
                 (update-vals (u.compress/untgz-files archive) seq)))
          (finally
            (io/delete-file archive true))))))
  (testing "only regular files are read, hidden entries are skipped, and the limits of untgz apply"
    (let [content (.getBytes (apply str (repeat 1024 \a)) "UTF-8")
          archive (create-multi-entry-tgz 10 content)]
      (try
        (is (= (into {} (for [i (range 10)] [(format "file-%d" i) (seq content)]))
               (update-vals (u.compress/untgz-files archive) seq)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"max uncompressed bytes"
                              (u.compress/untgz-files archive {:max-uncompressed-bytes 4096})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"max entries"
                              (u.compress/untgz-files archive {:max-entries 5})))
        (finally
          (io/delete-file archive true))))
    (let [archive (create-tgz ".hidden" (.getBytes "x" "UTF-8"))]
      (try
        (is (= {} (u.compress/untgz-files archive)))
        (finally
          (io/delete-file archive true)))))
  (testing "an entry whose path could leave a directory is refused"
    (doseq [file-name ["../../etc/foo" "foo/../../escape" "foo/../bar" "./../escape" "/etc/foo" "a//b" "a\\b"]]
      (let [archive (create-tgz file-name (.getBytes "content" "UTF-8"))]
        (try
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"invalid path"
                                (u.compress/untgz-files archive)))
          (finally
            (io/delete-file archive true)))))))
