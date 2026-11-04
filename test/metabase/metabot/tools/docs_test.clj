(ns metabase.metabot.tools.docs-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.metabot.capabilities :as capabilities]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.docs :as tools.docs]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(def ^:private answer
  {:answer_id "ans_1"
   :answer    "# How to change the port\n\nSet `MB_JETTY_PORT` [1]. Use < and & freely."
   :citations [{:n 1 :title "Environment variables" :heading "MB_JETTY_PORT"
                :url "https://www.metabase.com/docs/v0.57/configuring-metabase/environment-variables#mb_jetty_port"
                :snippet "Configure what port Metabase listens on." :version "v0.57" :plan nil}]
   :version   "v0.57"
   :grounded  true
   :mode      "answer"})

(defn- with-docs-assistant!
  "Calls `(f requests)` with the docs assistant answering from `respond` (a fn of the request body,
  returning `{:status :body}`), on Metabase `tag`, self-hosted. `requests` is an atom of the bodies sent."
  [respond tag f]
  (let [requests (atom [])]
    (with-redefs [config/mb-version-info      {:tag tag}
                  premium-features/is-hosted? (constantly false)
                  tools.docs/docs-request     (fn [body] (swap! requests conj body) (respond body))]
      (f requests))))

(defn- ask [question]
  (:output (tools.core/handle tools.docs/search-metabase-documentation-tool {:question question} {})))

(deftest ^:parallel docs-version-test
  (is (= "v0.57" (tools.docs/docs-version "v0.57.3")))
  (testing "Enterprise tags (v1.x) map to the same docs"
    (is (= "v0.57" (tools.docs/docs-version "v1.57.3"))))
  (testing "local development has no version"
    (is (nil? (tools.docs/docs-version "vLOCAL_DEV")))))

(deftest answer-output-test
  (with-docs-assistant!
    (constantly {:status 200 :body answer}) "v1.57.3"
    (fn [requests]
      (let [output (ask "  How do I change the port?  ")]
        (testing "the question goes out with this instance's version and deployment, and nothing else"
          (is (= [{:question "How do I change the port?"
                   :version  "v0.57"
                   :context  {:deployment "self-hosted"}}]
                 @requests)))
        (testing "the model reads the answer (escaped), its sources and how to use them"
          (is (str/includes? output "<metabase_docs version=\"v0.57\" grounded=\"true\">"))
          (is (str/includes? output "Use &lt; and &amp; freely."))
          (is (str/includes? output (str "<source n=\"1\" title=\"Environment variables › MB_JETTY_PORT\" "
                                         "url=\"https://www.metabase.com/docs/v0.57/configuring-metabase/"
                                         "environment-variables#mb_jetty_port\"/>")))
          (is (str/includes? output "Answer the user from this documentation.")))))))

(deftest ungrounded-output-test
  (with-docs-assistant!
    (constantly {:status 200 :body (assoc answer :grounded false :citations [])}) "v0.57.0"
    (fn [_]
      (let [output (ask "Can Metabase make coffee?")]
        (is (not (str/includes? output "<sources>")))
        (is (str/includes? output "The docs do not cover this."))))))

(deftest unknown-version-falls-back-to-the-newest-docs-test
  (with-docs-assistant!
    (fn [{:keys [version]}]
      (if version
        {:status 400 :body {:error "unknown_version" :versions ["v0.57"]}}
        {:status 200 :body answer}))
    "v0.40.1"
    (fn [requests]
      (is (str/includes? (ask "How do I change the port?") "<answer>"))
      (is (= ["v0.40" nil] (map :version @requests))))))

(deftest unavailable-docs-are-recoverable-test
  (doseq [respond [(constantly {:status 429 :body {:error "rate_limited"}})
                   (constantly {:status 500 :body nil})
                   (fn [_] (throw (java.net.ConnectException. "refused")))]]
    (with-docs-assistant!
      respond "v0.57.0"
      (fn [_]
        (let [e (is (thrown? clojure.lang.ExceptionInfo (ask "How do I change the port?")))]
          (is (=? {:class   :recoverable
                   :code    ::tools.docs/docs-unavailable
                   :message "The Metabase docs could not be searched right now."}
                  (tools.error/classify e))))))))

(deftest admins-can-turn-docs-lookup-off-test
  (mt/with-temporary-setting-values [metabot-docs-search-enabled? true]
    (is (contains? (capabilities/capability-set []) :feature-docs-search)))
  (mt/with-temporary-setting-values [metabot-docs-search-enabled? false]
    (is (not (contains? (capabilities/capability-set []) :feature-docs-search)))))
