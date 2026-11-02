(ns metabase.system.paths-test
  (:require
   [clojure.test :refer :all]
   [metabase.system.core :as system]
   [metabase.system.paths :as paths]
   [metabase.test :as mt]
   [metabase.test.util :as tu])
  (:import
   (com.google.common.jimfs Configuration Jimfs)))

(set! *warn-on-reflection* true)

(def ^:private checks
  [[:read  system/readable-path? system/ensure-readable-path! :mb-readable-paths #"Reading from path is disallowed"]
   [:write system/writable-path? system/ensure-writable-path! :mb-writable-paths #"Writing to path is disallowed"]])

(deftest allowed-path-test
  (doseq [[access allowed? ensure! env-var disallowed-msg] checks]
    (testing access
      (tu/do-with-temp-env-var-value!
       env-var "/allowed/dir,/other"
       (fn []
         (testing "paths under an allowed directory are allowed"
           (is (true? (allowed? "/allowed/dir")))
           (is (true? (allowed? "/allowed/dir/file.pem")))
           (is (true? (allowed? "/other/deep/nested/file")))
           (is (= "/allowed/dir/file.pem" (ensure! "/allowed/dir/file.pem"))))
         (testing "paths outside every allowed directory are not"
           (doseq [path ["/etc/passwd"
                         "/allowed"
                         ;; a sibling sharing a string prefix is not a descendant
                         "/allowed/directory/file"
                         ;; traversal is normalized before comparing
                         "/allowed/dir/../../etc/passwd"]]
             (testing path
               (is (false? (allowed? path)))
               (is (=? {:file-path path, :access access, :status-code 400}
                       (try (ensure! path) nil (catch clojure.lang.ExceptionInfo e (ex-data e)))))
               (is (thrown-with-msg? clojure.lang.ExceptionInfo disallowed-msg (ensure! path))))))))
      (testing "NONE allows nothing"
        (tu/do-with-temp-env-var-value! env-var "NONE"
                                        #(is (false? (allowed? "/allowed/dir/file.pem")))))
      (testing "the root allows everything"
        (tu/do-with-temp-env-var-value! env-var "/"
                                        #(is (true? (allowed? "/etc/passwd"))))))))

(deftest read-and-write-allowlists-are-independent-test
  (mt/with-temp-env-var-value! [mb-readable-paths "/read"
                                mb-writable-paths "/write"]
    (is (true? (system/readable-path? "/read/f")))
    (is (false? (system/writable-path? "/read/f")))
    (is (true? (system/writable-path? "/write/f")))
    (is (false? (system/readable-path? "/write/f")))))

(deftest relative-path-traversal-test
  (testing "relative paths resolve against the working directory before `..` is collapsed"
    (let [cwd (System/getProperty "user.dir")]
      (doseq [[access allowed? _ensure! env-var] checks]
        (testing access
          (tu/do-with-temp-env-var-value!
           env-var cwd
           (fn []
             (is (true? (allowed? "sub/file.pem")))
             (is (false? (allowed? "../outside.pem")))
             (is (false? (allowed? "sub/../../outside.pem"))))))))))

(deftest windows-paths-test
  (with-open [fs (Jimfs/newFileSystem (Configuration/windows))]
    (let [allowed? (fn [allowlist path] (#'paths/allowed-path? fs allowlist path))]
      (testing "/ allows any path, not only the current drive"
        (doseq [path ["C:\\certs\\key.pem" "D:\\certs\\key.pem"]]
          (is (true? (allowed? ["/"] path)) path)))
      (testing "drive-letter allowlist entries"
        (is (true? (allowed? ["C:\\certs"] "C:\\certs\\key.pem")))
        (testing "either separator, any case"
          (is (true? (allowed? ["C:/certs"] "c:\\CERTS\\key.pem"))))
        (testing "another drive is not under it"
          (is (false? (allowed? ["C:\\certs"] "D:\\certs\\key.pem")))
          ;; which is why `/` cannot just be compared as a path: on Windows it is only the current drive's root
          (is (false? (allowed? ["C:\\"] "D:\\certs\\key.pem"))))
        (testing "traversal is normalized before comparing"
          (is (false? (allowed? ["C:\\certs"] "C:\\certs\\..\\secrets\\key.pem"))))))))
