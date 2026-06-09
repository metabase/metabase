(ns metabase.metabot.agent.prompt-cache-test
  "Tests that protect the Anthropic prompt-cache contract.

  Everything before `<<<METABOT_CACHE_BREAKPOINT>>>` in a system prompt is sent
  as a cacheable prefix. Per-request values (current time, user info, viewing
  context, recent views) must not leak into that prefix, or the cache
  invalidates on every request.

  Snippets under `shared/prompt_snippets/` are also asserted to be free of
  Selmer template directives, since they are intended to be safe to embed
  anywhere in the cacheable prefix without coupling to runtime context."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]))

(set! *warn-on-reflection* true)

(def ^:private cache-breakpoint "<<<METABOT_CACHE_BREAKPOINT>>>")

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

(def ^:private system-templates-with-breakpoint
  ["internal.selmer"
   "embedding-next.selmer"
   "natural-language-querying-only.selmer"
   "sql-querying-only.selmer"
   "slackbot.selmer"
   "transform-codegen.selmer"])

(defn- render
  [template-name per-request-context]
  (binding [scope/*current-user-metabot-permissions* all-yes-perms]
    (prompts/build-system-message-content
     {:prompt-template template-name}
     per-request-context
     {}
     [])))

(defn- prefix-of [rendered]
  (let [idx (.indexOf ^String rendered ^String cache-breakpoint)]
    (when (neg? idx)
      (throw (ex-info "Rendered template is missing the cache breakpoint sentinel"
                      {:rendered rendered})))
    (subs rendered 0 idx)))

(deftest ^:parallel cache-prefix-is-stable-across-per-request-values-test
  (testing "the prefix before <<<METABOT_CACHE_BREAKPOINT>>> must not vary with per-request context"
    (doseq [template system-templates-with-breakpoint]
      (testing template
        (let [a (render template
                        {:current_time      "2026-01-01T00:00:00Z"
                         :current_user_info "User: Alice"
                         :viewing_context   "viewing dashboard 1"
                         :recent_views      "recent: card 1"})
              b (render template
                        {:current_time      "2026-12-31T23:59:59Z"
                         :current_user_info "User: Bob"
                         :viewing_context   "viewing dashboard 2"
                         :recent_views      "recent: card 2"})]
          (is (= (prefix-of a) (prefix-of b))
              "cacheable prefix changed when only per-request values changed"))))))
