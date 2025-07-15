(ns mage.token-scan-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is]]
   [mage.token-scan :as token-scan]
   [mage.util :as u]))

(deftest token-scan-test-no-tokens
  (is (= {:total-matches 0, :files-with-matches 0}
         (-> (token-scan/run-scan {:arguments [] :options {:all-files true}})
             (select-keys [:total-matches :files-with-matches])))))

(def token-like-comment (str ";;" (apply str (repeat 100 \a))))
(def this-file-path "test/mage/token_scan_test.clj")

(deftest token-scan-finds-error
  (try
    (spit (str u/project-root-directory "/" this-file-path)
          ;; add comment to the bottom of this file:
          token-like-comment
          :append true)
    (try (token-scan/run-scan {:arguments [this-file-path]})
         (catch Exception e
           (is (= {:total-files 1, :files-with-matches 1, :total-matches 1} (:outcome (ex-data e))))))
    (finally
      (spit this-file-path
            (str/replace (slurp this-file-path) token-like-comment "")))))

(deftest token-scan-finds-errors
  ;; Append the token-like comment to the bottom of this file 10 times:
  (dotimes [_ 10]
    (spit (str u/project-root-directory "/" this-file-path)
          ;; add comment to the bottom of this file:
          token-like-comment
          :append true))
  (try (token-scan/run-scan {:arguments [this-file-path]})
       (catch Exception e
         (is (= {:total-files 1
                 :files-with-matches 1
                 :total-matches 10} (:outcome (ex-data e)))
             "should have 10 matches, in this file, one for each token-like-comment"))
       (finally
         (spit this-file-path
               (str/replace (slurp this-file-path) token-like-comment "")))))

(deftest missing-file-test
  (try
    (token-scan/run-scan {:arguments ["some-missing-file.txt"]})
    (catch Exception e
      (is (= "Missing file: some-missing-file.txt" (ex-message e))
          "should have an empty message and no data for missing file error")
      (is (= {:babashka/exit 1} (ex-data e))))))
