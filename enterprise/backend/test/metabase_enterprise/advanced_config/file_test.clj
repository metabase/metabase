(ns metabase-enterprise.advanced-config.file-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1.0, :max 1.999}]
                        (mt/with-premium-features #{:config-text-file}
                          (thunk)))))

(defn- re-quote [^String s]
  (re-pattern (java.util.regex.Pattern/quote s)))

(def ^:private mock-yaml
  {:version 1
   :config  {:settings {:my-setting "abc123"}}})

(deftest config-test
  (testing "Specify a custom path and read from YAML"
    (mt/with-temp-file [filename "temp-config-file.yml"]
      (spit filename (yaml/generate-string mock-yaml))
      (binding [advanced-config.file/*env* (assoc @#'advanced-config.file/*env* :mb-config-file-path filename)]
        (is (= {:version 1
                :config  {:settings {:my-setting "abc123"}}}
               (#'advanced-config.file/config))))))
  (testing "Support overriding config with dynamic var for mocking purposes"
    (binding [advanced-config.file/*config* mock-yaml]
      (is (= {:version 1
              :config  {:settings {:my-setting "abc123"}}}
             (#'advanced-config.file/config))))))

(deftest validate-config-test
  (testing "Config should throw an error"
    (testing "if it is not a map"
      (binding [advanced-config.file/*config* [1 2 3 4]]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             (re-quote "failed: map?")
             (#'advanced-config.file/config)))))
    (testing "if version"
      (testing "is not included"
        (binding [advanced-config.file/*config* {:config {:settings {}}}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               (re-quote "failed: (contains? % :version)")
               (#'advanced-config.file/config)))))
      (testing "is unsupported"
        (testing "because it is too old"
          (binding [advanced-config.file/*supported-versions* {:min 2.0, :max 3.0}
                    advanced-config.file/*config*             {:version 1.0, :config {}}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 (re-quote "failed: supported-version?")
                 (#'advanced-config.file/config)))))
        (testing "because it is too new"
          (binding [advanced-config.file/*supported-versions* {:min 2.0, :max 3.0}
                    advanced-config.file/*config*             {:version 4.0, :config {}}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 (re-quote "failed: supported-version?")
                 (#'advanced-config.file/config)))))))))

(defn- mock-config-with-setting [s]
  {:version 1.0, :config {:settings {:my-setting s}}})

(deftest expand-template-forms-test
  (testing "Ignore single curly brackets, or brackets with spaces between them"
    (are [s] (= (mock-config-with-setting s)
                (binding [advanced-config.file/*config* (mock-config-with-setting s)]
                  (#'advanced-config.file/config)))
      "{}}"
      "{}}"
      "{ {}}"))
  (testing "Invalid template forms"
    (are [template error-pattern] (thrown-with-msg?
                                   clojure.lang.ExceptionInfo
                                   error-pattern
                                   (binding [advanced-config.file/*config* (mock-config-with-setting template)]
                                     (#'advanced-config.file/config)))
      ;; {{ without a corresponding }}
      "{{}"                        (re-quote "Invalid query: found [[ or {{ with no matching ]] or }}")
      "{{} }"                      (re-quote "Invalid query: found [[ or {{ with no matching ]] or }}")
      ;; raw token, not a list
      "{{CONFIG_FILE_BIRD_NAME}}"  (re-quote "CONFIG_FILE_BIRD_NAME - failed: valid-template-type?")
      ;; unbalanced parens
      "{{(env MY_ENV_VAR}}"        (re-quote "Error parsing template string \"(env MY_ENV_VAR\": EOF while reading")
      ;; unknown template type
      "{{bird \"Parrot Hilton\"}}" (re-quote "bird - failed: valid-template-type?"))))

(deftest recursive-template-form-expansion-test
  (testing "Recursive expansion is unsupported, for now."
    (binding [advanced-config.file/*env*    (assoc @#'advanced-config.file/*env* :x "{{env Y}}", :y "Y")
              advanced-config.file/*config* (mock-config-with-setting "{{env X}}")]
      (is (= (mock-config-with-setting "{{env Y}}")
             (#'advanced-config.file/config))))))

(deftest expand-template-env-var-values-test
  (testing "env var values"
    (binding [advanced-config.file/*env* (assoc @#'advanced-config.file/*env* :config-file-bird-name "Parrot Hilton")]
      (testing "Nothing weird"
        (binding [advanced-config.file/*config* (mock-config-with-setting "{{env CONFIG_FILE_BIRD_NAME}}")]
          (is (= (mock-config-with-setting "Parrot Hilton")
                 (#'advanced-config.file/config)))))
      (testing "Should handle multiple templates in one string"
        (binding [advanced-config.file/*config* (mock-config-with-setting "{{env CONFIG_FILE_BIRD_NAME}}-{{env CONFIG_FILE_BIRD_NAME}}")]
          (is (= (mock-config-with-setting "Parrot Hilton-Parrot Hilton")
                 (#'advanced-config.file/config)))))
      (testing "Ignore whitespace inside the template brackets"
        (binding [advanced-config.file/*config* (mock-config-with-setting "{{  env CONFIG_FILE_BIRD_NAME  }}")]
          (is (= (mock-config-with-setting "Parrot Hilton")
                 (#'advanced-config.file/config)))))
      (testing "Ignore excess brackets"
        (are [template expected] (= (mock-config-with-setting expected)
                                    (binding [advanced-config.file/*config* (mock-config-with-setting template)]
                                      (#'advanced-config.file/config)))
          "{{{env CONFIG_FILE_BIRD_NAME}}" "{Parrot Hilton"
          "{{env CONFIG_FILE_BIRD_NAME}}}" "Parrot Hilton}"))
      (testing "handle lisp-case/snake-case and case variations"
        (binding [advanced-config.file/*config* (mock-config-with-setting "{{env config-file-bird-name}}")]
          (is (= (mock-config-with-setting "Parrot Hilton")
                 (#'advanced-config.file/config))))))))

(deftest expand-template-env-var-values-validation-test
  (testing "(config) should walk the config map and expand {{template}} forms"
    (testing "env var values"
      (testing "validation"
        (are [template error-pattern] (thrown-with-msg?
                                       clojure.lang.ExceptionInfo
                                       error-pattern
                                       (binding [advanced-config.file/*config* (mock-config-with-setting template)]
                                         (#'advanced-config.file/config)))
          ;; missing env var name
          "{{env}}"                           #"Insufficient input"
          ;; too many args
          "{{env SOME_ENV_VAR SOME_ENV_VAR}}" #"failed: Extra input"
          ;; wrong env var type
          "{{env :SOME_ENV_VAR}}"             (re-quote "SOME_ENV_VAR - failed: symbol?"))))))

(deftest optional-template-test
  (testing "[[optional {{template}}]] values"
    (binding [advanced-config.file/*env* (assoc @#'advanced-config.file/*env* :my-sensitive-password "~~~SeCrEt123~~~")]
      (testing "env var exists"
        (binding [advanced-config.file/*config* (mock-config-with-setting "[[{{env MY_SENSITIVE_PASSWORD}}]]")]
          (is (= (mock-config-with-setting "~~~SeCrEt123~~~")
                 (#'advanced-config.file/config))))
        (binding [advanced-config.file/*config* (mock-config-with-setting "password__[[{{env MY_SENSITIVE_PASSWORD}}]]")]
          (is (= (mock-config-with-setting "password__~~~SeCrEt123~~~")
                 (#'advanced-config.file/config))))
        (testing "with text inside optional brackets before/after the templated part"
          (binding [advanced-config.file/*config* (mock-config-with-setting "[[before__{{env MY_SENSITIVE_PASSWORD}}__after]]")]
            (is (= (mock-config-with-setting "before__~~~SeCrEt123~~~__after")
                   (#'advanced-config.file/config))))))
      (testing "env var does not exist"
        (binding [advanced-config.file/*config* (mock-config-with-setting "[[{{env MY_OTHER_SENSITIVE_PASSWORD}}]]")]
          (is (= (mock-config-with-setting "")
                 (#'advanced-config.file/config))))
        (binding [advanced-config.file/*config* (mock-config-with-setting "password__[[{{env MY_OTHER_SENSITIVE_PASSWORD}}]]")]
          (is (= (mock-config-with-setting "password__")
                 (#'advanced-config.file/config))))
        (testing "with text inside optional brackets before/after the templated part"
          (binding [advanced-config.file/*config* (mock-config-with-setting "[[before__{{env MY_OTHER_SENSITIVE_PASSWORD}}__after]]")]
            (is (= (mock-config-with-setting "")
                   (#'advanced-config.file/config)))))))))

(deftest initialize-section-test
  (testing "Ignore unknown sections"
    (binding [advanced-config.file/*config* {:version 1.0, :config {:unknown-section {}}}]
      (let [log-messages (mt/with-log-messages-for-level [metabase-enterprise.advanced-config.file.interface :warn]
                           (is (= :ok
                                  (advanced-config.file/initialize!))))]
        (is (= [[:warn nil (u/colorize :yellow "Ignoring unknown config section :unknown-section.")]]
               log-messages))))))

(deftest require-advanced-config-test
  (testing "Config files should require the `:config-text-file` token feature"
    (mt/with-premium-features #{}
      (binding [advanced-config.file/*config* {:version 1.0, :config {:unknown-section {}}}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Metabase config files require a Premium token with the :config-text-file feature"
             (advanced-config.file/initialize!)))))))

(deftest error-validation-do-not-leak-env-vars-test
  (testing "spec errors should not include contents of env vars -- expand templates after spec validation."
    (binding [advanced-config.file/*env*    (assoc @#'advanced-config.file/*env* :my-sensitive-password "~~~SeCrEt123~~~")
              advanced-config.file/*config* {:version 1
                                             :config  {:users [{:first_name "Cam"
                                                                :last_name  "Era"
                                                                :password   "{{env MY_SENSITIVE_PASSWORD}}"}]}}]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (#'advanced-config.file/config)))
      (try
        (#'advanced-config.file/config)
        (catch Throwable e
          (letfn [(contains-password? [form]
                    (let [seen-password? (atom false)]
                      (walk/postwalk
                       (fn [form]
                         (when (and (string? form)
                                    (str/includes? form "~~~SeCrEt123~~~"))
                           (reset! seen-password? true))
                         form)
                       form)
                      @seen-password?))]
            (is (not (contains-password? (ex-message e))))
            (is (not (contains-password? (ex-data e))))))))))

(deftest always-init-settings-first-test
  (testing "Always apply the :settings section first regardless of the order the YAML file is in."
    (doseq [config [{:settings {:my-setting 1000}
                     :users    [{:first_name "Cam"
                                 :last_name  "Era"
                                 :email      "camera@example.com"
                                 :password   "toucans"}]}
                    {:users    [{:first_name "Cam"
                                 :last_name  "Era"
                                 :email      "camera@example.com"
                                 :password   "toucans"}]
                     :settings {:my-setting 1000}}]]
      (testing (format "config = %s" (pr-str config))
        (let [initialized-sections (atom [])]
          (with-redefs [advanced-config.file.i/initialize-section! (fn [section-name _section-config]
                                                                     (swap! initialized-sections conj section-name))]
            (binding [advanced-config.file/*config* {:version 1, :config config}]
              (advanced-config.file/initialize!)
              (is (= [:settings
                      :users]
                     @initialized-sections)))))))))
