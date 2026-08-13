(ns metabase.metabot.agent.prompt-cache-test
  "Tests that protect the Anthropic prompt-cache contract.

  The entire system prompt is sent as a cacheable prefix. Per-request values
  (current time, user info, viewing context, recent views) are injected into
  the last user message (see `message_injection.selmer`), never rendered into
  the system prompt.

  Snippets under `shared/prompt_snippets/` are also asserted to be free of
  Selmer template directives, since they are intended to be safe to embed
  anywhere in the cacheable prompt without coupling to runtime context."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]))

(set! *warn-on-reflection* true)

(def ^:private all-yes-perms
  {:permission/metabot-sql-generation :yes
   :permission/metabot-nlq            :yes
   :permission/metabot-other-tools    :yes})

(def ^:private snippets-dir "metabot/prompts/shared/prompt_snippets")

(defn- snippet-files []
  (->> (io/resource snippets-dir)
       io/file
       file-seq
       (filter #(.isFile ^java.io.File %))
       (filter #(str/ends-with? (.getName ^java.io.File %) ".selmer"))))

(deftest ^:parallel shared-snippets-have-no-template-directives-test
  (testing "files in shared/prompt_snippets/ must be free of Selmer directives"
    (doseq [^java.io.File f (snippet-files)]
      (let [body (slurp f)]
        (testing (.getName f)
          (is (not (re-find #"\{\{" body))
              "snippet contains `{{ … }}` interpolation")
          (is (not (re-find #"\{%" body))
              "snippet contains `{% … %}` tag"))))))

(deftest ^:parallel shared-snippets-directory-not-empty-test
  (testing "snippet directory exists and has files (guards against the previous test silently passing)"
    (is (seq (snippet-files)))))

(def ^:private system-templates-dir "metabot/prompts/system")

(defn- system-template-files []
  (->> (io/resource system-templates-dir)
       io/file
       file-seq
       (filter #(.isFile ^java.io.File %))
       (filter #(str/ends-with? (.getName ^java.io.File %) ".selmer"))))

(def ^:private per-request-template-vars
  "Template variables that vary per request. These belong to the message-injection
  template (message_injection.selmer), never to system prompts — a system prompt
  referencing one would render blank (they are no longer supplied) and would have
  signalled per-request content in the cacheable prompt."
  [#"current_time"
   #"current_user_info"
   #"viewing_context"
   #"recent_views"
   #"first_day_of_week"])

(deftest ^:parallel system-templates-have-no-per-request-vars-test
  (testing "system prompt templates must not reference per-request context variables"
    (doseq [^java.io.File f (system-template-files)]
      (let [body (slurp f)]
        (testing (.getName f)
          (doseq [pattern per-request-template-vars]
            (is (not (re-find pattern body))
                (str "system template references per-request variable " pattern))))))))

(deftest ^:parallel system-templates-directory-not-empty-test
  (testing "system template directory exists and has files (guards against the previous test silently passing)"
    (is (seq (system-template-files)))))

(defn- render
  [template-name per-request-context]
  (binding [scope/*current-user-metabot-permissions* all-yes-perms]
    (prompts/build-system-message-content
     {:prompt-template template-name}
     per-request-context
     {}
     [])))

(deftest ^:parallel system-prompt-is-stable-across-per-request-values-test
  (testing "the rendered system prompt must not vary with per-request context"
    (doseq [^java.io.File f (system-template-files)]
      (let [template (.getName f)]
        (testing template
          (let [a (render template
                          {:current_time      "2026-01-01T00:00:00Z"
                           :current_user_info "User: Alice"
                           :viewing_context   "viewing dashboard 1"
                           :recent_views      "recent: card 1"
                           :first_day_of_week "Monday"})
                b (render template
                          {:current_time      "2026-12-31T23:59:59Z"
                           :current_user_info "User: Bob"
                           :viewing_context   "viewing dashboard 2"
                           :recent_views      "recent: card 2"
                           :first_day_of_week "Friday"})]
            (is (= a b)
                "system prompt changed when only per-request values changed")))))))
