(ns metabase.util.compress-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress])
  (:import
   (java.io File)
   (java.nio.file Files)))

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
