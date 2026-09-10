(ns metabase.settings.secret-audience-test
  "Enforcement for the secret/audience coupling.

  A stored credential must declare the audience it is sent to, so that changing where it goes cannot silently reuse
  it (see [[metabase.settings.models.setting/assert-audience-writes-authorized!]]). These tests exist so that the next
  credential added to the codebase has to make that declaration rather than quietly inheriting the old behaviour."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.core.init]
   [metabase.core.init]
   [metabase.settings.models.setting :as setting]
   [metabase.test]))

(set! *warn-on-reflection* true)

(comment
  metabase.core.init/keep-me
  metabase-enterprise.core.init/keep-me
  metabase.test/keep-me)

(defn- test-namespace?
  "Whether `setting` was registered by a test namespace. Test files define throwaway `:sensitive?` settings to
  exercise masking, and CI loads every test namespace into one JVM, so without this filter those fixtures would trip
  the ratchets below."
  [setting]
  (str/ends-with? (str (:namespace setting)) "-test"))

(defn- secret-settings
  "Every production setting marked as a credential. `:sensitive?` is the one marker -- see [[single-marker-test]]."
  []
  (into {}
        (filter (fn [[_ setting]] (and (:sensitive? setting) (not (test-namespace? setting)))))
        @setting/registered-settings))

;;; Credentials that predate the coupling and have not been given an audience yet. This list may only shrink: adding
;;; to it means shipping a credential that can be redirected. Remove an entry by declaring `:audience` on the setting
;;; (or `{}` when it genuinely is not sent anywhere, e.g. a signing key we verify against ourselves).
(def ^:private undeclared-audience-backlog
  ;; The LLM provider credentials. Each has a matching `llm-*-api-base-url`, and the coupling between them is being
  ;; built in #81450 (SEC-1172), which moves these onto the provider-connection registry rather than standalone
  ;; settings -- declaring an audience on them here would collide with that work.
  #{:llm-anthropic-api-key
    :llm-azure-api-key
    :llm-bedrock-access-key-id
    :llm-bedrock-secret-access-key
    :llm-bedrock-session-token
    :llm-deepseek-api-key
    :llm-google-oauth-access-token
    :llm-google-service-account-key
    :llm-mistral-api-key
    :llm-moonshot-api-key
    :llm-openai-api-key
    :llm-openrouter-api-key
    :llm-providers
    :llm-vllm-api-key
    :llm-zai-api-key})

(deftest every-secret-declares-its-audience-test
  (let [undeclared (into #{} (keep (fn [[k setting]] (when-not (:audience setting) k))) (secret-settings))
        unexpected (remove undeclared-audience-backlog undeclared)]
    (is (empty? unexpected)
        (str "These settings hold a credential but do not declare the audience it is sent to, so changing where they "
             "point would silently reuse the stored value. Add an `:audience` map naming the settings that decide "
             "the destination and how the channel is protected, or `{}` if it is never sent anywhere:\n  "
             (str/join "\n  " (sort unexpected))))))

(deftest audience-backlog-has-no-stale-entries-test
  (let [secrets (secret-settings)
        stale   (remove (fn [k] (and (contains? secrets k) (nil? (:audience (get secrets k)))))
                        undeclared-audience-backlog)]
    (is (empty? stale)
        (str "These settings are listed as awaiting an audience but no longer need to be -- they now declare one, or "
             "are no longer credentials. Remove them from the backlog so it keeps shrinking:\n  "
             (str/join "\n  " (sort stale))))))

(deftest single-marker-test
  (testing "`:sensitive?` is the only way to mark a credential"
    (let [masked-by-custom-getter
          (for [[k setting] @setting/registered-settings
                :let [twin (symbol (str (:namespace setting)) (str "unobfuscated-" (name k)))]
                :when (and (resolve twin) (not (:sensitive? setting)))]
            k)]
      (is (empty? masked-by-custom-getter)
          (str "These settings mask in a custom `:getter` with an `unobfuscated-*` twin instead of being "
               "`:sensitive?`. That puts them outside the obfuscated-value guard, so a client echoing the displayed "
               "mask back overwrites the stored credential with the mask. Mark them `:sensitive?` and delete the "
               "custom getter:\n  "
               (str/join "\n  " (sort masked-by-custom-getter)))))))

;;; --------------------------------------------------- ratchets -----------------------------------------------------

;;; These ratchets read the source tree from disk rather than inspecting loaded vars, deliberately: they must see
;;; every call site, including ones in namespaces this JVM never happened to load.

(defn- source-files []
  (->> (concat (file-seq (io/file "src")) (file-seq (io/file "enterprise/backend/src")))
       (filter #(and (.isFile ^java.io.File %) (str/ends-with? (.getName ^java.io.File %) ".clj")))))

(def ^:private mask-helper-home
  "Where the mask helpers are defined and legitimately used."
  #{"src/metabase/settings/models/setting.clj" "src/metabase/settings/core.clj"})

(defn- files-matching [re]
  (into (sorted-set)
        (comp (keep (fn [^java.io.File f] (when (re-find re (slurp f)) (str f))))
              (remove mask-helper-home))
        (source-files)))

;;; Namespaces comparing a request value against the mask of the *stored* credential -- `(= v (obfuscate-value
;;; (current-secret)))` -- to decide whether the stored credential may be reused. That decision belongs to the bound
;;; Secret: an endpoint detects an echoed mask by shape (`obfuscated-value?`) and lets `expose` decide. Rendering a
;;; mask into a response is fine. This set is empty and must stay empty; the ratchet exists so a new integration cannot
;;; reinvent the comparison.
(def ^:private hand-rolled-mask-comparison
  #{})

(deftest hand-rolled-mask-comparison-ratchet-test
  (let [current (files-matching #"\((?:not)?=\s[^\n]*\(setting/obfuscate-value")
        new     (remove hand-rolled-mask-comparison current)
        gone    (remove (set current) hand-rolled-mask-comparison)]
    (is (empty? new)
        (str "These namespaces compare against a mask by hand instead of letting the audience check decide whether a "
             "stored credential may be reused. Use the coupling on the setting instead:\n  "
             (str/join "\n  " (sort new))))
    (is (empty? gone)
        (str "These namespaces no longer hand-roll a mask comparison. Remove them from the ratchet so it keeps "
             "shrinking:\n  "
             (str/join "\n  " (sort gone))))))

;;; Call sites that open a credential without comparing an audience, because there is nothing to compare it against.
;;; `to-creator` hands a just-created credential to the person who made it; `fixed-endpoint` presents one to a peer no
;;; setting selects. Neither is verifiable by construction, so each site is a deliberate, reviewed decision and the
;;; count may only shrink. It stays small because each credential gets one accessor, not one per call site.
(def ^:private disclosure-call-site-budget 21)

(deftest disclosure-escape-hatch-ratchet-test
  (let [n (->> (source-files)
               (remove #{"src/metabase/util/secret.clj"})
               (map (fn [^java.io.File f] (count (re-seq #":disclosure/" (slurp f)))))
               (reduce + 0))]
    (is (<= n disclosure-call-site-budget)
        (str "There are now " n " sites opening a credential without naming a network audience, over a budget of "
             disclosure-call-site-budget ". Prefer a method on the Secret (prefix, mask) or derive-with."))
    (is (= n disclosure-call-site-budget)
        (str "The budget is " disclosure-call-site-budget " but there are only " n
             " sites -- lower `disclosure-call-site-budget` to lock in the reduction."))))

;;; Opening a Secret against its own bound audience is the one way to get plaintext without naming a destination the
;;; caller actually holds. It is legitimate for the type to offer (tests, tooling), never for production code to use.
(deftest bound-audience-is-not-used-in-production-code-test
  (let [users (files-matching #"(?<![\w-])bound-audience(?![\w-])")]
    (is (empty? (disj users "src/metabase/util/secret.clj"))
        (str "These namespaces open a Secret against its own bound audience, which bypasses the check. Expose it to "
             "the destination the code is actually about to use:\n  "
             (str/join "\n  " (sort (disj users "src/metabase/util/secret.clj")))))))

;;; Files that open a Secret, i.e. hand a stored credential to the peer it was saved for. Each one is a sink: the last
;;; point before the value leaves the process. Two rules apply there, and a new entry means neither has been checked:
;;;
;;;   1. Open the secret *outside* any `try` that translates exceptions into a message of its own. The refusal depends
;;;      only on data already in hand, so there is always a place for it ahead of the risky part; a refusal swallowed
;;;      by such a handler is reported as a connection failure instead of the 400 it is.
;;;   2. Where the sink is itself called from inside such a handler -- as `git-source` is, from the remote-sync
;;;      test-connection endpoint -- that handler must call `u.secret/rethrow-if-audience-mismatch!` first.
;;;
;;; Either way the sink needs a test that a Secret bound elsewhere is refused *and the refusal propagates*, which is
;;; the property these rules exist to protect.
(def ^:private secret-opening-sinks
  #{"enterprise/backend/src/metabase_enterprise/remote_sync/source/git.clj"
    "enterprise/backend/src/metabase_enterprise/semantic_search/embedding.clj"
    "enterprise/backend/src/metabase_enterprise/transforms_python/python_runner.clj"
    "enterprise/backend/src/metabase_enterprise/transforms_python/s3.clj"
    "src/metabase/channel/email.clj"
    "src/metabase/sso/ldap.clj"})

(deftest secret-opening-sinks-ratchet-test
  ;; only an audience-comparing open is a sink in this sense. Opening with a `:disclosure/` reason compares nothing,
  ;; so there is no refusal for a handler to swallow and neither rule applies.
  (let [current (disj (files-matching #"(?<![\w-])maybe-expose(?![\w-])(?![^\n]*:disclosure/)")
                      "src/metabase/util/secret.clj")
        new     (remove secret-opening-sinks current)
        gone    (remove (set current) secret-opening-sinks)]
    (is (empty? new)
        (str "These namespaces open a stored Secret. Check the two rules in the comment above this test, give the sink "
             "a test that a refusal propagates, then add it here:\n  "
             (str/join "\n  " (sort new))))
    (is (empty? gone)
        (str "These namespaces no longer open a Secret. Remove them from the ratchet:\n  "
             (str/join "\n  " (sort gone))))))
