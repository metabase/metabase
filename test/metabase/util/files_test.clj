(ns metabase.util.files-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.files :as u.files])
  (:import
   (com.google.common.jimfs Configuration Jimfs)
   (java.net URI)))

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
        (spit file-in-dir "abc") ; create a file in the dir to make sure it exists
        (is (u.files/regular-file? (u.files/get-path file-in-dir)))))
    (is (not (u.files/regular-file? (u.files/get-path dir))))))

(deftest ^:parallel code-location->path-test
  (testing "%-escapes decode to native paths"
    (is (= "/tmp/jar location/x.jar"
           (u.files/code-location->path (URI. "file:/tmp/jar%20location/x.jar")))))
  (testing "windows-semantics filesystems yield drive-letter native form (#81733)"
    (with-open [fs (Jimfs/newFileSystem (Configuration/windows))]
      (let [uri (.toUri (.getPath fs "C:\\jar location\\x.jar" (u/varargs String)))]
        (is (= "C:\\jar location\\x.jar"
               (u.files/code-location->path uri)))))))
