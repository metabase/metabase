(ns metabase.system.paths-test
  (:require
   [clojure.test :refer :all]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.util :as tu]))

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
