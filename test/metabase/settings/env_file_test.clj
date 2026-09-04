(ns metabase.settings.env-file-test
  (:require
   [clojure.test :refer :all]
   [metabase.settings.env-file :as env-file]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-env-file-test
  (testing "KEY=value lines; blank lines and # comments are skipped; `export ` is allowed; outer quotes are stripped"
    (is (= {:mb-site-name         "My Site"
            :mb-not-behind-proxy  "true"
            :mb-store-api-url     "https://store.example/#frag"
            :mb-empty             ""
            :mb-with-equals       "a=b=c"}
           (env-file/parse-env-file
            (str "# a comment\n"
                 "\n"
                 "export MB_SITE_NAME=\"My Site\"\n"
                 "MB_NOT_BEHIND_PROXY='true'\n"
                 "  MB_STORE_API_URL = https://store.example/#frag  \n"
                 "MB_EMPTY=\n"
                 "MB_WITH_EQUALS=a=b=c\n")))))
  (testing "keys are keywordized the way environ does it, so MB_FOO_BAR is found as :mb-foo-bar"
    (is (= {:mb-foo-bar "1"} (env-file/parse-env-file "MB_FOO_BAR=1"))))
  (testing "the last of duplicate keys wins"
    (is (= {:mb-x "2"} (env-file/parse-env-file "MB_X=1\nMB_X=2"))))
  (testing "keys that are not MB_ variables are kept (so startup can warn about them)"
    (is (= {:mb-x "1" :path "/bin"} (env-file/parse-env-file "MB_X=1\nPATH=/bin"))))
  (testing "a line with no = is an error, reported with its line number"
    (is (thrown-with-msg? ExceptionInfo #"line 2"
                          (env-file/parse-env-file "MB_X=1\nthis is not a variable"))))
  (testing "a key that is not a valid variable name is an error"
    (is (thrown-with-msg? ExceptionInfo #"line 1"
                          (env-file/parse-env-file "MB-X=1"))))
  (testing "a UTF-8 byte order mark (Windows Notepad writes one) is not part of the first key"
    (is (= {:mb-site-name "Foo"} (env-file/parse-env-file "\uFEFFMB_SITE_NAME=Foo\n"))))
  (testing "an empty file parses to an empty map"
    (is (= {} (env-file/parse-env-file "")))))

(deftest load-env-file-test
  (mt/with-env-file-values! {}
    (testing "MB_ENV_FILE_PATH names the file to load"
      (mt/with-temp-file [path "metabase.env"]
        (spit path "MB_TEST_SETTING_1=from-file\nMB_TEST_SETTING_2=\"quoted\"\n")
        (mt/with-temp-env-var-value! [mb-env-file-path path]
          (env-file/load-env-file!)
          (is (= {:mb-test-setting-1 "from-file" :mb-test-setting-2 "quoted"}
                 (env-file/env-file-values))))))
    (testing "a configured path that does not exist is an error"
      (mt/with-temp-env-var-value! [mb-env-file-path "/nonexistent/metabase.env"]
        (is (thrown-with-msg? ExceptionInfo #"metabase\.env file not found"
                              (env-file/load-env-file!)))))
    (testing "with no path configured and no ./metabase.env, loading leaves the layer empty"
      (mt/with-temp-env-var-value! [mb-env-file-path nil]
        (env-file/load-env-file!)
        (is (= {} (env-file/env-file-values)))))))

(deftest merge-value-test
  (mt/with-env-file-values! {:mb-x "from-file"}
    (testing "a key the file did not set is added"
      (is (true? (env-file/merge-value! :mb-y "from-config")))
      (is (= "from-config" (get (env-file/env-file-values) :mb-y))))
    (testing "a key the file did set is left alone"
      (is (false? (env-file/merge-value! :mb-x "from-config")))
      (is (= "from-file" (get (env-file/env-file-values) :mb-x))))))
