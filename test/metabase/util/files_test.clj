(ns metabase.util.files-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.files :as u.files])
  (:import
   (java.io FileOutputStream)
   (java.util.zip ZipEntry ZipOutputStream)))

(deftest is-regular-file-test
  (mt/with-temp-file [file "temp-file"]
    (testing (format "file = %s" (pr-str file))
      (spit file "abc")
      (is (u.files/regular-file? (u.files/get-path file)))))
  (mt/with-temp-dir [dir "temp-dir"]
    (testing (format "dir = %s" (pr-str dir)))
    (let [file-in-dir (str (u.files/get-path dir "file"))]
      (testing (format "file = %s" (pr-str file-in-dir))
        (spit file-in-dir "abc") ; create a file in the dir to make sure it exists
        (is (u.files/regular-file? (u.files/get-path file-in-dir)))))
    (is (not (u.files/regular-file? (u.files/get-path dir))))))

(defn- write-test-zip!
  "Write a minimal zip file at `path` containing a single entry."
  [^String path]
  (with-open [zos (ZipOutputStream. (FileOutputStream. path))]
    (.putNextEntry zos (ZipEntry. "hello.txt"))
    (.write zos (.getBytes "hi"))
    (.closeEntry zos)))

(deftest nio-fs-bypasses-uri-cache-test
  (testing "nio-fs can open multiple independent filesystems for the same zip simultaneously"
    (mt/with-temp-file [path "u-files-nio-fs.jar"]
      (write-test-zip! path)
      ;; Two simultaneous with-open bindings — the URI-based FileSystems/newFileSystem overload would throw
      ;; FileSystemAlreadyExistsException on the second open since the cache entry is still live. The Path-based
      ;; overload returns independent instances and both stay open through the body.
      (with-open [fs1 (u.files/nio-fs path)
                  fs2 (u.files/nio-fs path)]
        (is (.isOpen fs1))
        (is (.isOpen fs2)))
      ;; A follow-up open succeeds — closing the previous instances didn't leave the helper in a permanently closed
      ;; state.
      (with-open [fs (u.files/nio-fs path)]
        (is (.isOpen fs))))))
