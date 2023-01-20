(ns ^:mb/once metabase.util.files-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.files :as u.files]))

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
