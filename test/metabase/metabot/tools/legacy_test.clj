(ns metabase.metabot.tools.legacy-test
  "Converted and unconverted tools in one profile, called through one function."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.legacy :as tools.legacy]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.metabot.tools.timelines :as tools.timelines]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Unconverted tools --------------------------------------------------

;;; Written exactly as tools are written today: an `mu/defn` var with metadata, one argument, and a
;;; loose return value.

(mu/defn ^{:tool-name "old_plain"
           :scope     "agent:content:read"}
  old-plain-tool
  "Returns a plain string, as several tools do."
  [{:keys [n]} :- [:map {:closed true} [:n :int]]]
  (str "plain " n))

(mu/defn ^{:tool-name    "old_rich"
           :scope        "agent:content:read"
           :capabilities #{:permission-write-sql-queries}}
  old-rich-tool
  "Returns the full old-shape map, including the keys that no longer exist."
  [{:keys [n]} :- [:map {:closed true} [:n :int]]]
  {:output            (str "rich " n)
   :structured_output {:n n}                                ; snake_case variant
   :instructions      "Show the user the result."
   :status-code       200                                   ; dropped
   :data-parts        [{:type :data :data-type "viz"}]})

(mu/defn ^{:tool-name "old_agent_error"}
  old-agent-error-tool
  "Throws the old `:agent-error?` flag, meaning: relay this to the model."
  [_args :- [:map {:closed true}]]
  (throw (ex-info "Card 7 is not in this conversation." {:agent-error? true :status-code 400})))

(mu/defn ^{:tool-name "old_terminal_error"}
  old-terminal-error-tool
  "Throws the old `:terminal-error?` flag, meaning: show the user and stop."
  [_args :- [:map {:closed true}]]
  (throw (ex-info "You do not have permission to write SQL queries against this database."
                  {:agent-error? true :terminal-error? true})))

(mu/defn ^{:tool-name "old_terminal_result"}
  old-terminal-result-tool
  "Returns `:terminal-error?` rather than throwing it, as the SQL tools do."
  [_args :- [:map {:closed true}]]
  {:output "You do not have permission to write SQL queries against this database."
   :terminal-error? true})

(mu/defn ^{:tool-name "old_crash"}
  old-crash-tool
  "Throws something nobody wrote text for."
  [_args :- [:map {:closed true}]]
  (throw (ex-info "H2 connection reset: user=mb_admin" {:sql "SELECT 1"})))

(mu/defn ^{:tool-name "old_quiet_failure"}
  old-quiet-failure-tool
  "Catches its own error and returns it as a success-shaped result, as `read_resource` does."
  [_args :- [:map {:closed true}]]
  {:output "Failed to read the card."})

;;; -------------------------------------------- A converted tool --------------------------------------------------

(tools.error/defrecoverable new-no-widget!
  "There is no widget with that id."
  {:payload [:map {:closed true} [:id :int]]}
  [{:keys [id]}]
  {:message  (str "Widget " id " does not exist.")
   :recovery [{:uses #{"search"} :text "Call `search` to find a widget id."}]})

(defrecord NewWidgetTool []
  tools/Tool
  (declaration [_]
    {:name        "new_widget"
     :description "Reports a widget."
     :scope       "agent:content:read"
     :args        [:map {:closed true} [:id :int]]})
  (handle [_ {:keys [id]} _ctx]
    (if (even? id)
      {:output (str "widget " id)}
      (new-no-widget! {:id id}))))

(def ^:private new-widget-tool (->NewWidgetTool))

;;; ------------------------------------------------- Fixtures -----------------------------------------------------

(def ^:private entries
  "One profile holding both kinds. `adapt-all` is the only place that knows the difference, and it
  leaves the converted tool untouched."
  (tools/entries
   (tools.legacy/adapt-all [#'old-plain-tool #'old-rich-tool #'old-agent-error-tool
                            #'old-terminal-error-tool #'old-terminal-result-tool #'old-crash-tool
                            #'old-quiet-failure-tool
                            new-widget-tool])))

(defn- invoke
  ([tool-name args] (invoke #{"search"} tool-name args))
  ([extra-tool-names tool-name args]
   (binding [scope/*current-user-scope* #{"*"}]
     (tools.runtime/invoke entries
                           {:profile-id :nlq :metabot-id nil
                            :tool-names (into extra-tool-names (keys entries))}
                           tool-name args))))

;;; ------------------------------------------------ Coexistence ---------------------------------------------------

(deftest ^:parallel both-kinds-live-in-one-profile-test
  (testing "entries accepts a var and a record side by side"
    (is (= #{"old_plain" "old_rich" "old_agent_error" "old_terminal_error" "old_terminal_result"
             "old_crash" "old_quiet_failure" "new_widget"}
           (set (keys entries)))))
  (testing "and one call path reaches both"
    (is (= {:output "plain 1"} (invoke "old_plain" {:n 1})))
    (is (= {:output "widget 2"} (invoke "new_widget" {:id 2}))))
  (testing "after adapting, both are the same kind of thing"
    (is (every? #(satisfies? tools/Tool %)
                (tools.legacy/adapt-all [#'old-plain-tool new-widget-tool])))
    (is (not-any? tools/batched?
                  (tools.legacy/adapt-all [#'old-plain-tool new-widget-tool])))))

(deftest ^:parallel a-real-unconverted-tool-adapts-test
  (let [adapted (tools.legacy/adapt #'tools.timelines/get-timeline-details-tool)]
    (testing "an untouched tool from the codebase needs no edit"
      (is (= {:name  "get_timeline_details"
              :args  [:map {:closed true} [:timeline_id :int]]
              :scope "agent:timelines:read"}
             (dissoc (tools/declaration adapted) :description))))
    (testing "with the mu/defn preamble stripped from its description"
      (let [{:keys [description]} (tools/declaration adapted)]
        (is (str/starts-with? description "Get the full details of a timeline"))
        (is (not (str/includes? description "Inputs:")))
        (is (not (str/includes? description "Return:")))))))

;;; -------------------------------------------- What is a tool ----------------------------------------------------

(deftest ^:parallel a-var-is-not-a-tool-test
  (testing "the protocol is not extended to clojure.lang.Var. Doing that would make every var in
           the codebase satisfy `Tool`, so the predicate would mean nothing and a var passed in by
           mistake would fail somewhere inside a protocol method instead of where it was registered."
    (is (not (satisfies? tools/Tool #'clojure.core/map)))
    (is (not (satisfies? tools/Tool #'old-plain-tool)))
    (testing "a wrapped one does"
      (is (satisfies? tools/Tool (tools.legacy/adapt #'old-plain-tool))))))

(deftest ^:parallel adapt-refuses-what-is-not-a-tool-test
  (testing "a var with no :tool-name is refused by name, at the call site"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"clojure.core/map is not a tool"
                          (tools.legacy/adapt #'clojure.core/map))))
  (testing "and so is anything that is neither a tool nor a var"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not a tool"
                          (tools.legacy/adapt 42)))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not a tool"
                          (tools.legacy/adapt {:name "looks like a declaration"}))))
  (testing "a converted tool passes through untouched, so adapt-all is safe on a mixed list"
    (is (identical? new-widget-tool (tools.legacy/adapt new-widget-tool))))
  (testing "legacy-tool? answers the same question without wrapping"
    (is (tools.legacy/legacy-tool? #'old-plain-tool))
    (is (not (tools.legacy/legacy-tool? #'clojure.core/map)))
    (is (not (tools.legacy/legacy-tool? new-widget-tool)))))

;;; --------------------------------------------- Result adaptation ------------------------------------------------

(deftest ^:parallel a-loose-return-value-becomes-a-result-test
  (testing "a plain string"
    (is (= {:output "plain 3"} (invoke "old_plain" {:n 3}))))
  (testing "the full old map: snake_case folded, instructions appended, status-code dropped"
    (is (= {:output            "rich 4\nShow the user the result."
            :structured-output {:n 4}
            :data-parts        [{:type :data :data-type "viz"}]}
           (invoke "old_rich" {:n 4}))))
  (testing "and the result validates as a new-shape result"
    (is (mr/validate ::tools/result (invoke "old_rich" {:n 4})))))

;;; ----------------------------------------------- Error mapping --------------------------------------------------

(deftest ^:parallel an-agent-error-still-reaches-the-model-test
  (testing "the flag means the author wrote the sentence for a model, so it is relayed"
    (let [outcome (invoke "old_agent_error" {})]
      (is (= "Card 7 is not in this conversation." (:output outcome)))
      (is (=? {:class :recoverable
               :code  :metabase.metabot.tools.recoverable.legacy/agent-error}
              (:error outcome))))))

(deftest ^:parallel a-terminal-error-still-ends-the-turn-test
  (doseq [[label tool] {"thrown"   "old_terminal_error"
                        "returned" "old_terminal_result"}]
    (testing label
      (let [outcome (invoke tool {})]
        (is (=? {:class        :unrecoverable
                 :user-message "You do not have permission to write SQL queries against this database."}
                (:error outcome)))
        (testing "and the model is told only that it failed"
          (is (str/starts-with? (:output outcome) "This call failed and the user was shown"))
          (is (not (str/includes? (:output outcome) "permission"))))))))

(deftest ^:parallel an-unflagged-exception-is-unrecoverable-test
  (testing "nobody wrote that text for anyone, so it does not reach the model"
    (let [outcome (invoke "old_crash" {})]
      (is (= {:class :unrecoverable :code :internal} (:error outcome)))
      (doseq [leak ["H2" "mb_admin" "SELECT"]]
        (is (not (str/includes? (:output outcome) leak)) (str "leaked " leak))))))

(deftest ^:parallel behaviour-is-preserved-not-improved-test
  (testing "a tool that catches its own error and returns it as `:output` still looks like a
           success. Nothing here can tell that string from a real result. Converting the tool is
           what fixes it — this test records the limitation rather than hiding it."
    (is (= {:output "Failed to read the card."} (invoke "old_quiet_failure" {})))
    (is (nil? (:error (invoke "old_quiet_failure" {}))))))

;;; ------------------------------------------- The runtime's checks -----------------------------------------------

(deftest ^:parallel unconverted-tools-get-the-new-checks-test
  (testing "arguments are validated against the schema from the var's metadata"
    (is (=? {:error {:class :validation :code :invalid-arguments}}
            (invoke "old_plain" {:m 1}))))
  (testing "and the scope is checked from the declaration"
    (is (=? {:error {:class :unrecoverable :code :scope-denied}}
            (binding [scope/*current-user-scope* #{"agent:nothing"}]
              (tools.runtime/invoke entries
                                    {:profile-id :nlq :metabot-id nil
                                     :tool-names (set (keys entries))}
                                    "old_plain" {:n 1})))))
  (testing "a converted tool's recovery steps are filtered the same way"
    (is (= ["Widget 3 does not exist." "Call `search` to find a widget id."]
           (str/split-lines (:output (invoke "new_widget" {:id 3})))))
    (is (= ["Widget 3 does not exist."]
           (str/split-lines (:output (invoke #{} "new_widget" {:id 3})))))))
