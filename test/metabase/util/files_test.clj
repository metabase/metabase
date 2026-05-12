(ns metabase.util.files-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.files :as u.files])
  (:import
   (java.io FileOutputStream)
   (java.nio.file ClosedFileSystemException FileSystem Files)
   (java.util.zip ZipEntry ZipOutputStream)))

(set! *warn-on-reflection* true)

(deftest is-regular-file-test
  (mt/with-temp-file [file "temp-file"]
    (testing (format "file = %s" (pr-str file))
      (spit file "abc")
      (is (u.files/regular-file? (u.files/get-path file)))))
  (mt/with-temp-dir [dir "temp-dir"]
    (testing (format "dir = %s" (pr-str dir)))
    (let [file-in-dir (str (u.files/get-path dir "file"))]
      (testing (format "file = %s" (pr-str file-in-dir))
        (spit file-in-dir "abc")        ; create a file in the dir to make sure it exists
        (is (u.files/regular-file? (u.files/get-path file-in-dir)))))
    (is (not (u.files/regular-file? (u.files/get-path dir))))))

(defn- write-test-zip!
  "Write a minimal zip file at `path` containing a single `hello.txt` entry with content `hi`."
  [^String path]
  (with-open [zos (ZipOutputStream. (FileOutputStream. path))]
    (.putNextEntry zos (ZipEntry. "hello.txt"))
    (.write zos (.getBytes "hi"))
    (.closeEntry zos)))

(defn- read-hello [^FileSystem fs]
  (Files/readString (.getPath fs "/hello.txt" (u/varargs String))))

(deftest nio-fs-bypasses-uri-cache-test
  (testing "nio-fs returns independent filesystems for the same zip — closing one cannot kill another"
    (mt/with-temp-file [zip-path]
      (write-test-zip! zip-path)
      (with-open [fs1 (u.files/nio-fs zip-path)
                  fs2 (u.files/nio-fs zip-path)]
        ;; Both filesystems read the entry — distinguishes Path-based (works) from URI-based (would throw
        ;; FileSystemAlreadyExistsException on the second open since the cache entry would still be live).
        (is (= "hi" (read-hello fs1)))
        (is (= "hi" (read-hello fs2)))
        ;; Closing fs1 must not affect fs2.
        (.close fs1)
        (is (thrown? ClosedFileSystemException (read-hello fs1)))
        (is (= "hi" (read-hello fs2))))
      ;; Subsequent opens still work after previous instance closes — not in a permanently-broken state.
      (with-open [fs (u.files/nio-fs zip-path)]
        (is (= "hi" (read-hello fs)))))))
