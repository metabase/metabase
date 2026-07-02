(ns metabase.metabot.agent.prompt-cache-test
  "Tests that protect the Anthropic prompt-cache contract.

  Everything before `<<<METABOT_CACHE_BREAKPOINT>>>` in a system prompt is sent
  as a cacheable prefix. Per-request values (current time, user info, viewing
  context, recent views) must not leak into that prefix, or the cache
  invalidates on every request.

  Snippets under `shared/prompt_snippets/` are asserted not to couple to
  per-request context: they must not interpolate values (`{{ … }}`), and any
  `{% … %}` conditional may branch only on a cache-stable instance flag (see
  [[cache-stable-snippet-flags]]). A snippet that branched on, say, the current
  time or the viewing context would change the cacheable prefix per request."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.prompts :as prompts]
   [metabase.metabot.scope :as scope]
   ;; `build-system-message-content` gates its engine-aware search guidance on
   ;; `(search.engine/supported-engine? :search.engine/semantic)`. That defmethod lives in
   ;; `metabase.search.semantic.core`; require it so the check resolves here regardless of load
   ;; order (at runtime app init pulls it in) rather than hitting the throwing `:default`.
   [metabase.search.semantic.core]))

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

(def ^:private cache-stable-snippet-flags
  "Template variables a shared snippet MAY branch on: instance-level capability flags that are
   constant across requests, so branching on them can't invalidate the Anthropic prompt cache.
   Must stay a subset of the stable (non-per-request) keys in
   `metabase.metabot.agent.prompts/build-system-message-content`'s `template-context` — never a
   per-request value like `current_time` / `current_user_info` / `viewing_context` / `recent_views`."
  #{"has_semantic_search"})

(def ^:private bare-control-tags
  "`{% … %}` tags that carry no variable reference (loop/branch scaffolding), always cache-safe."
  #{"else" "endif" "endfor"})

(defn- snippet-tag-violations
  "The `{% … %}` tag bodies in `body` that couple a shared snippet to something other than a
   cache-stable instance flag: interpolation-free control flow over [[cache-stable-snippet-flags]]
   is allowed; anything else (per-request var, `for`, `include`, etc.) is a violation."
  [body]
  (->> (re-seq #"\{%\s*(.*?)\s*%\}" body)
       (map second)
       (remove (fn [tag]
                 (or (contains? bare-control-tags tag)
                     (when-let [[_ _kw expr] (re-matches #"(if|elif)\s+(.*)" tag)]
                       (every? #(or (contains? #{"not" "and" "or" "all" "any"} %)
                                    (contains? cache-stable-snippet-flags %))
                               (str/split expr #"\s+"))))))))

(deftest ^:parallel shared-snippets-have-no-per-request-coupling-test
  (testing "shared/prompt_snippets/ files stay cacheable: no value interpolation, and any conditional branches only on a cache-stable instance flag"
    (doseq [^java.io.File f (snippet-files)]
      (let [body (slurp f)]
        (testing (.getName f)
          (is (not (re-find #"\{\{" body))
              "snippet contains `{{ … }}` interpolation — shared snippets must be static text")
          (let [violations (snippet-tag-violations body)]
            (is (empty? violations)
                (str "snippet has `{% … %}` tag(s) that couple it to per-request context: "
                     (pr-str violations)))))))))

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
