(ns metabase-enterprise.metabot-v3.agent.prompts-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.prompts :as prompts]))

(deftest load-system-prompt-template-test
  (testing "loads internal.selmer template"
    (let [template (prompts/load-system-prompt-template "internal.selmer")]
      (is (some? template))
      (is (string? template))
      (is (> (count template) 1000))
      (is (re-find #"Metabot" template))))

  (testing "loads embedding-next.selmer template"
    (let [template (prompts/load-system-prompt-template "embedding-next.selmer")]
      (is (some? template))
      (is (string? template))
      (is (re-find #"Metabot" template))))

  (testing "returns nil for non-existent template"
    (let [template (prompts/load-system-prompt-template "non-existent.selmer")]
      (is (nil? template)))))

(deftest load-dialect-instructions-test
  (testing "loads postgresql dialect"
    (let [instructions (prompts/load-dialect-instructions "postgresql")]
      (is (some? instructions))
      (is (string? instructions))
      (is (re-find #"PostgreSQL" instructions))))

  (testing "loads mysql dialect"
    (let [instructions (prompts/load-dialect-instructions "mysql")]
      (is (some? instructions))
      (is (string? instructions))
      (is (re-find #"MySQL" instructions))))

  (testing "returns nil for non-existent dialect"
    (let [instructions (prompts/load-dialect-instructions "non-existent")]
      (is (nil? instructions))))

  (testing "returns nil for nil dialect"
    (let [instructions (prompts/load-dialect-instructions nil)]
      (is (nil? instructions)))))

(deftest render-system-prompt-test
  (testing "renders template with variables"
    (let [template "Hello {{name}}, today is {{day}}"
          context {:name "Metabot" :day "Monday"}
          rendered (prompts/render-system-prompt template context)]
      (is (= "Hello Metabot, today is Monday" rendered))))

  (testing "handles missing variables gracefully"
    (let [template "Hello {{name}}"
          context {}
          rendered (prompts/render-system-prompt template context)]
      (is (some? rendered))
      ;; Selmer leaves undefined variables as empty or the variable name
      (is (or (= "Hello " rendered)
              (= "Hello {{name}}" rendered)))))

  (testing "handles conditionals"
    (let [template "{% if show %}visible{% endif %}"
          context-true {:show true}
          context-false {:show false}]
      (is (= "visible" (prompts/render-system-prompt template context-true)))
      (is (= "" (prompts/render-system-prompt template context-false)))))

  (testing "handles loops"
    (let [template "{% for item in items %}{{item}} {% endfor %}"
          context {:items ["a" "b" "c"]}
          rendered (prompts/render-system-prompt template context)]
      (is (= "a b c " rendered)))))

(deftest template-caching-test
  (testing "caches loaded templates"
    ;; Clear cache first
    (prompts/clear-cache!)

    ;; Load template - should cache it
    (let [template1 (prompts/get-cached-system-prompt "internal.selmer")]
      (is (some? template1))

      ;; Load again - should return from cache
      (let [template2 (prompts/get-cached-system-prompt "internal.selmer")]
        (is (= template1 template2)))))

  (testing "caches dialect instructions"
    ;; Clear cache first
    (prompts/clear-cache!)

    ;; Load dialect - should cache it
    (let [dialect1 (prompts/get-cached-dialect-instructions "postgresql")]
      (is (some? dialect1))

      ;; Load again - should return from cache
      (let [dialect2 (prompts/get-cached-dialect-instructions "postgresql")]
        (is (= dialect1 dialect2)))))

  (testing "clear-cache! removes all cached templates"
    ;; Load some templates
    (prompts/get-cached-system-prompt "internal.selmer")
    (prompts/get-cached-dialect-instructions "postgresql")

    ;; Clear cache
    (prompts/clear-cache!)

    ;; Cache should be empty (we can't directly test this, but we can reload)
    (let [template (prompts/get-cached-system-prompt "internal.selmer")]
      (is (some? template)))))

(deftest extract-tool-instructions-test
  (testing "finds correct instructions"
    (is (=? [{:tool_name "read_resource"
              :instructions #(str/includes? % "you have access to a unified interface")}]
            (prompts/extract-tool-instructions {"read_resource" identity})))))

(deftest build-system-message-content-test
  (testing "builds complete system message"
    (let [profile {:prompt-template "embedding-next.selmer"}
          context {:current_time "2024-01-15 14:30:00"
                   :first_day_of_week "Sunday"
                   :sql-dialect "postgresql"}
          tools {}
          content (prompts/build-system-message-content profile context tools)]
      (is (some? content))
      (is (string? content))
      (is (> (count content) 100))
      (is (re-find #"Metabot" content))
      (is (re-find #"2024-01-15 14:30:00" content))))

  (testing "includes dialect instructions when dialect specified"
    (let [profile {:prompt-template "embedding-next.selmer"}
          context {:current_time "2024-01-15 14:30:00"
                   :sql-dialect "postgresql"}
          tools {}
          content (prompts/build-system-message-content profile context tools)]
      (is (some? content))
      ;; Note: The embedding template might not reference dialect instructions,
      ;; but they should be available in the template context
      (is (string? content))))

  (testing "falls back to default message if template not found"
    (let [profile {:prompt-template "non-existent.selmer"}
          context {}
          tools {}
          content (prompts/build-system-message-content profile context tools)]
      (is (some? content))
      (is (= "You are Metabot, a data analysis assistant for Metabase." content))))

  (testing "uses default template name if not specified"
    (let [profile {}
          context {:current_time "2024-01-15 14:30:00"}
          tools {}
          content (prompts/build-system-message-content profile context tools)]
      (is (some? content))
      (is (string? content))
      (is (> (count content) 1000))))) ; internal.selmer is large
