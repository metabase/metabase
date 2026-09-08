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

(defn- secret-settings
  "Every setting marked as a credential. `:sensitive?` is the one marker -- see [[single-marker-test]]."
  []
  (into {} (filter (fn [[_ setting]] (:sensitive? setting))) @setting/registered-settings))

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

;;; Namespaces still hand-rolling the "did the client echo the mask back?" comparison. Each is a place where the
;;; decision about reusing a stored credential is made locally rather than by the audience check. This set may only
;;; shrink: a new entry means a new integration reinvented the thing this module exists to centralize.
(def ^:private hand-rolled-mask-comparison
  #{"enterprise/backend/src/metabase_enterprise/remote_sync/api.clj"
    "enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj"
    "enterprise/backend/src/metabase_enterprise/sso/api/oidc.clj"
    "src/metabase/channel/email.clj"
    "src/metabase/llm/provider.clj"
    "src/metabase/slackbot/api.clj"
    "src/metabase/sso/api/ldap.clj"})

(deftest hand-rolled-mask-comparison-ratchet-test
  (let [current (files-matching #"obfuscated-value\?|obfuscate-value")
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

;;; Call sites that expose a credential for a reason other than a network peer. The only remaining reason is handing a
;;; just-created credential to the person who made it, which no mechanism can verify -- so each site is a deliberate,
;;; reviewed decision and the count may only shrink.
(def ^:private disclosure-call-site-budget 4)

(deftest disclosure-escape-hatch-ratchet-test
  (let [n (->> (source-files)
               (map (fn [^java.io.File f] (count (re-seq #":disclosure/to-creator" (slurp f)))))
               (reduce + 0))]
    (is (<= n disclosure-call-site-budget)
        (str "There are now " n " sites exposing a credential without naming a network audience, over a budget of "
             disclosure-call-site-budget ". Prefer a method on the Secret (prefix, mask) or derive-with."))
    (is (= n disclosure-call-site-budget)
        (str "The budget is " disclosure-call-site-budget " but there are only " n
             " sites -- lower `disclosure-call-site-budget` to lock in the reduction."))))
