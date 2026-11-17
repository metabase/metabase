(ns metabase.metabot.tools.skills-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.core :as tools.core]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.metabot.tools.skills :as tools.skills]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- load-skills
  "Call `load_skill` for `ids` the way the agent loop does, in a request whose skill manifest holds `loadable`.
  Return the result, or `{:output <the text the model reads> :error {:class :code}}` when the call fails."
  [loadable ids]
  (binding [scope/*current-loadable-skill-ids* (atom (set loadable))]
    (let [entries (metabot.tools/->entries [#'metabot.tools/load-skill-tool] (atom {}) nil :internal)]
      ((:fn (get entries "load_skill")) {:ids ids}))))

(deftest ^:parallel load-skill-takes-ids-test
  (testing "the model sends `ids`, and so does the synthetic call that preloads a SQL dialect"
    (let [{:keys [args]} (tools.core/validate-tool! tools.skills/load-skill-tool)
          [preload]      (skills/dialect-preload-parts "postgresql")]
      (is (= "load_skill" (:function preload)))
      (is (mr/validate args (:arguments preload))))))

(deftest ^:parallel load-skill-returns-body-test
  (testing "loading a known skill returns its body wrapped in a <skill> tag"
    (let [{:keys [output error]} (load-skills [:construct-notebook-query-operators]
                                              ["construct-notebook-query-operators"])]
      (is (nil? error))
      (is (str/starts-with? output "<skill id=\"construct-notebook-query-operators\">\n"))
      (is (str/ends-with? output "\n</skill>"))
      (is (str/includes? output "Aggregations")))))

(deftest ^:parallel load-skill-multiple-test
  (testing "several skills come back in the order asked for, separated by a blank line"
    (let [{:keys [output]} (load-skills [:construct-notebook-query-core :read-resource]
                                        ["read-resource" "construct-notebook-query-core"])]
      (is (= ["read-resource" "construct-notebook-query-core"]
             (map second (re-seq #"<skill id=\"([^\"]+)\">" output))))
      (is (str/includes? output "</skill>\n\n<skill id=\"construct-notebook-query-core\">")))))

(deftest ^:parallel load-skill-unknown-test
  (testing "a skill that doesn't exist and one that this request may not load fail the same way"
    (doseq [id ["does-not-exist" "edit-chart"]]
      (testing id
        (is (= {:output (str "No skill with ID \"" id "\" can be loaded here. Skill IDs you can load: "
                             "construct-notebook-query-core, read-resource.")
                :error  {:class :recoverable :code ::tools.core/all-items-failed}}
               (load-skills [:read-resource :construct-notebook-query-core] [id]))))))
  (testing "each skill that doesn't load is the declared error"
    (binding [scope/*current-loadable-skill-ids* (atom #{})]
      (let [e (is (thrown? clojure.lang.ExceptionInfo
                           (tools.core/handle tools.skills/load-skill-tool {:id "read-resource"} {})))]
        (is (= ::tools.skills/unknown-skill (:code (tools.error/classify e)))))))
  (testing "when the request may load no skills, the model is told so"
    (is (= "No skill with ID \"read-resource\" can be loaded here. No skills can be loaded here."
           (:output (load-skills [] ["read-resource"])))))
  (testing "a long ID is cut short, so the list of skills stays within the failure text limit"
    (is (str/ends-with? (:output (load-skills [:read-resource] [(apply str (repeat 5000 "x"))]))
                        "...\" can be loaded here. Skill IDs you can load: read-resource.")))
  (testing "the skills that load still reach the model, and the failure keeps its place"
    (let [{:keys [output error]} (load-skills [:read-resource] ["read-resource" "does-not-exist"])]
      (is (nil? error))
      (is (str/starts-with? output "<skill id=\"read-resource\">"))
      (is (str/ends-with? output (str "</skill>\n\nNo skill with ID \"does-not-exist\" can be loaded here. "
                                      "Skill IDs you can load: read-resource."))))))

(deftest ^:parallel load-skill-lists-loadable-skills-once-test
  (testing "several IDs that don't load list the skills that can be loaded once, after the first of them"
    (is (= {:output (str "No skill with ID \"nope-1\" can be loaded here. Skill IDs you can load: read-resource.\n\n"
                         "No skill with ID \"nope-2\" can be loaded here.")
            :error  {:class :recoverable :code ::tools.core/all-items-failed}}
           (load-skills [:read-resource] ["nope-1" "nope-2"]))))
  (testing "a call whose failures run past the failure text limit is cut short, and still lists the skills"
    (let [ids                    (for [i (range 40)] (str i (apply str (repeat 200 "x"))))
          {:keys [output error]} (load-skills [:read-resource] ids)]
      (is (= {:class :recoverable :code ::tools.core/all-items-failed} error))
      (is (= tools.runtime/max-output-length (count output)))
      (is (= 1 (count (re-seq #"Skill IDs you can load: read-resource\." output)))))))

(deftest ^:parallel load-skill-logs-refused-ids-test
  (testing "a missing or hidden skill leaves an info line, so operators can see a model guessing skill IDs"
    (log.capture/with-log-messages-for-level [logs [metabase.metabot.tools.skills :info]]
      (load-skills [:read-resource] ["does-not-exist" "edit-chart" "read-resource"])
      (is (= ["Unknown skill requested by load_skill"
              "Skill not available to current request {:id edit-chart}"]
             (map :message (logs)))))))

(deftest ^:parallel load-skill-needs-an-id-test
  (testing "an empty `ids` is an argument error that the model can correct"
    (is (= {:output "Invalid tool arguments: `ids` must be an array of at least one skill id; received an array."
            :error  {:class :validation :code :invalid-arguments}}
           (load-skills [:read-resource] [])))))

(deftest ^:parallel load-skill-unexpected-error-test
  (testing "an unexpected error fails the whole call"
    (mt/with-dynamic-fn-redefs [skills/get-skill-by-id-string (fn [_] (throw (ex-info "boom" {})))]
      (is (= {:class :unrecoverable :code :internal}
             (:error (load-skills [:construct-notebook-query-core] ["construct-notebook-query-core"])))))))
