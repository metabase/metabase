(ns metabase.metabot.tools.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]))

(set! *warn-on-reflection* true)

(tools/deftool widget-tool
  "Reports a widget."
  {:name "widget" :args [:map {:closed true} [:id :int]]}
  [{:keys [id]} _ctx]
  {:output (str "widget " id)})

(tools/deftool widget-tool'
  "A second handler claiming the same model-facing name."
  {:name "widget" :args [:map {:closed true}]}
  [_args _ctx]
  {:output "other"})

(tools/deftool scoped-tool
  "Needs a scope and a capability."
  {:name         "scoped"
   :args         [:map {:closed true}]
   :scope        "agent:sql:create"
   :capabilities #{:permission-write-sql-queries}}
  [_args _ctx]
  {:output "ok"})

;;; ------------------------------------------------ deftool -------------------------------------------------------

(deftest ^:parallel deftool-defines-a-callable-var-test
  (testing "the var is the handler, so tests and other tools call it directly"
    (is (= {:output "widget 4"} (widget-tool {:id 4} {})))))

(deftest ^:parallel deftool-records-its-declaration-test
  (is (= {:name "widget" :args [:map {:closed true} [:id :int]]}
         (tools/definition #'widget-tool)))
  (is (= {:name         "scoped"
          :args         [:map {:closed true}]
          :scope        "agent:sql:create"
          :capabilities #{:permission-write-sql-queries}}
         (tools/definition #'scoped-tool)))
  (testing "and a plain fn has none"
    (is (nil? (tools/definition #'tools/entries)))))

(deftest ^:parallel deftool-rejects-a-bad-declaration-test
  (testing "unknown options fail at load time rather than silently dropping a gate"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid tool declaration"
         (tools/validate-tool! {:name "x" :args :any :capability #{:typo}}))))
  (testing "a missing :name or :args fails"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid tool declaration"
                          (tools/validate-tool! {:args :any})))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid tool declaration"
                          (tools/validate-tool! {:name "x"}))))
  (testing "a name a provider might reject fails here, where it is cheap to find"
    (doseq [bad ["Widget" "read-resource" "2fast" "read resource"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not snake_case"
                            (tools/validate-tool! {:name bad :args :any})))))
  (testing "an :args schema that does not resolve fails at load time, not on the first call"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #":args schema that does not compile"
                          (tools/validate-tool! {:name "x" :args ::nothing-registers-this})))))

;;; ------------------------------------------------ entries -------------------------------------------------------

(deftest ^:parallel entries-test
  (is (= {"widget" {:name    "widget"
                    :args    [:map {:closed true} [:id :int]]
                    :doc     "Reports a widget."
                    :handler #'widget-tool}}
         (tools/entries [#'widget-tool])))
  (testing "a var that never went through deftool is refused, rather than being called unchecked"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not a deftool var"
                          (tools/entries [#'tools/entries]))))
  (testing "two handlers claiming one name is refused: one of them would be unreachable"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Two handlers claim the tool name"
                          (tools/entries [#'widget-tool #'widget-tool'])))))

;;; ------------------------------------------------- attempt -----------------------------------------------------

(tools/deftool partial-read-tool
  "Reads several cards, reporting the ones that failed beside the ones that worked."
  {:name "read_many" :args [:map {:closed true} [:ids [:sequential :int]]]}
  [{:keys [ids]} ctx]
  (let [{:keys [ok failed]} (->> (for [id ids]
                                   (assoc (tools/attempt
                                           (tools/with-entity {:kind :card :id id}
                                             (if (even? id)
                                               (str "card " id " contents")
                                               (throw (ex-info "nope" {:status-code 404})))))
                                          :id id))
                                 (group-by #(if (:error %) :failed :ok)))]
    {:output (str/join "\n"
                       (concat (map :value ok)
                               (for [{:keys [id error]} failed]
                                 (str "card " id ": "
                                      (tools/recoverable-text error (:tool-names ctx))))))}))

(deftest ^:parallel attempt-returns-the-value-on-success-test
  (is (= {:value 42} (tools/attempt (+ 40 2))))
  (testing "a nil result is still a success — :error is the only discriminator, as for an outcome"
    (is (= {:value nil} (tools/attempt nil)))))

(deftest ^:parallel attempt-captures-a-declared-recoverable-test
  (let [{:keys [error] :as result} (tools/attempt
                                    (tools/with-entity {:kind :card :id 7}
                                      (throw (ex-info "nope" {:status-code 404}))))]
    (is (not (contains? result :value)))
    (is (=? {:class :recoverable
             :code  :metabase.metabot.tools.recoverable.common/not-found
             :data  {:kind :card :id 7}}
            error))))

(deftest ^:parallel attempt-rethrows-anything-undeclared-test
  (testing "an undeclared exception is not a modelling decision anybody made, so it bubbles out and
           ends the turn rather than becoming a silent half-answer"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"a real bug"
                          (tools/attempt (throw (ex-info "a real bug" {:secret "hunter2"}))))))
  (testing "and so does an explicit give-up: `unrecoverable!` means the user has to act"
    (is (thrown? clojure.lang.ExceptionInfo
                 (tools/attempt (tools.error/unrecoverable! ::nope {:user-message "Ask an admin."})))))
  (testing "a validation error cannot occur inside a handler, but would bubble too"
    (is (thrown? clojure.lang.ExceptionInfo
                 (tools/attempt
                  (throw (ex-info "v" {tools.error/error-key {:class   :validation
                                                              :code    :invalid-arguments
                                                              :message "v"}})))))))

(deftest ^:parallel recoverable-text-test
  (let [error {:message  "Widget 7 does not exist."
               :recovery [{:uses #{"search"}        :text "Call `search` to find one."}
                          {:uses #{"read_resource"} :text "Or call `read_resource`."}]}]
    (is (= "Widget 7 does not exist.\nCall `search` to find one.\nOr call `read_resource`."
           (tools/recoverable-text error #{"search" "read_resource"})))
    (testing "steps are filtered by the profile, exactly as for a failed call"
      (is (= "Widget 7 does not exist.\nCall `search` to find one."
             (tools/recoverable-text error #{"search"})))
      (is (= "Widget 7 does not exist."
             (tools/recoverable-text error #{}))))))

;;; ------------------------------------------------ with-entity ---------------------------------------------------

(deftest ^:parallel with-entity-converts-read-refusals-test
  (doseq [status [403 404]]
    (testing (str "a " status " becomes the declared not-found error, naming the entity")
      (let [e (is (thrown? clojure.lang.ExceptionInfo
                           (tools/with-entity {:kind :timeline :id 5}
                             (throw (ex-info "nope" {:status-code status})))))]
        (is (=? {:class   :recoverable
                 :code    :metabase.metabot.tools.recoverable.common/not-found
                 :message "Timeline 5 was not found. It may not exist, or you may not have access to it."
                 :data    {:kind :timeline :id 5}}
                (tools.error/classify e)))))))

(deftest ^:parallel with-entity-passes-everything-else-through-test
  (testing "a real failure inside the body stays unrecoverable instead of being reported as a miss"
    (doseq [data [{:status-code 500} {} {:status-code 400}]]
      (let [e (is (thrown? clojure.lang.ExceptionInfo
                           (tools/with-entity {:kind :timeline :id 5}
                             (throw (ex-info "a real bug" data)))))]
        (is (= "a real bug" (ex-message e)))
        (is (= :unrecoverable (:class (tools.error/classify e)))))))
  (testing "and a successful body is returned untouched"
    (is (= :fine (tools/with-entity {:kind :timeline :id 5} :fine)))))

;;; -------------------------------------------- with-pipeline-errors ----------------------------------------------

(defn- pipeline-failure
  "Raise `data` from inside `with-pipeline-errors` and return the resulting ToolError."
  [message data]
  (try
    (tools/with-pipeline-errors (throw (ex-info message data)))
    (catch Throwable e
      (assoc (tools.error/classify e) ::ex-message (ex-message e)))))

(deftest ^:parallel with-pipeline-errors-converts-declared-codes-test
  (testing "an :agent-error? with a declared :error code becomes that error, keeping the pipeline's
           own sentence as the message"
    (is (=? {:class    :recoverable
             :code     :metabase.metabot.tools.recoverable.pipeline/unknown-table
             :message  "No table found matching portable FK [\"db\" nil \"t\"]."
             :recovery [{:uses #{"read_resource"}}]}
            (pipeline-failure "No table found matching portable FK [\"db\" nil \"t\"]."
                              {:agent-error? true :status-code 400 :error :unknown-table}))))
  (testing "the payload carries the keys a declaration's recovery branches on"
    (let [error (pipeline-failure "A URI is not a source."
                                  {:agent-error? true :error :uri-in-source-table
                                   :entity-type  "metric" :entity-id 7})]
      (is (=? {:code :metabase.metabot.tools.recoverable.pipeline/uri-in-source-table
               :data {:entity-type "metric" :entity-id 7}}
              error))
      (testing "so the metric branch is chosen rather than the generic one"
        (is (str/starts-with? (:text (first (:recovery error)))
                              "Metrics are aggregations, not sources."))))))

(deftest ^:parallel with-pipeline-errors-converts-refusals-test
  (doseq [status [403 404]]
    (testing (str "a " status " from inside the pipeline becomes not-found, without inventing a kind")
      (is (=? {:class   :recoverable
               :code    :metabase.metabot.tools.recoverable.common/not-found
               :message (str "The entity referenced here was not found. It may not exist, or you "
                             "may not have access to it.")
               :data    {}}
              (pipeline-failure "no" {:status-code status}))))))

(deftest ^:parallel with-pipeline-errors-does-not-relay-foreign-messages-test
  (testing "`as-agent-input-error` stamps :agent-error? onto exceptions from lib, toucan2 and JDBC
           too. Without an :error code there is nothing to say the message was written for a model,
           so it stays unrecoverable and the model never sees it."
    (is (=? {:class       :unrecoverable
             :code        :internal
             ::ex-message "No matching clause: :whatever"}
            (pipeline-failure "No matching clause: :whatever"
                              {:agent-error? true :status-code 400}))))
  (testing "an :error code with no declaration is not converted either — the pipeline-code test is
           what stops that case reaching production"
    (is (=? {:class :unrecoverable :code :internal}
            (pipeline-failure "a brand new pipeline failure"
                              {:agent-error? true :error :no-declaration-for-this}))))
  (testing "and an ordinary exception passes straight through"
    (is (=? {:class :unrecoverable :code :internal}
            (pipeline-failure "boom" {}))))
  (testing "a successful body is returned untouched"
    (is (= :fine (tools/with-pipeline-errors :fine)))))

;;; ------------------------------------------- Recovery-step filtering --------------------------------------------

(deftest ^:parallel recovery-steps-for-tools-test
  (let [steps [{:uses #{} :text "Always applies."}
               {:uses #{"search"} :text "Call `search`."}
               {:uses #{"search" "read_resource"} :text "Call `search` then `read_resource`."}]]
    (is (= [(first steps)]
           (tools/recovery-steps-for-tools steps #{})))
    (is (= (take 2 steps)
           (tools/recovery-steps-for-tools steps #{"search"})))
    (is (= steps
           (tools/recovery-steps-for-tools steps #{"search" "read_resource" "widget"})))))

(deftest ^:parallel names-a-tool?-test
  (testing "only a backticked name counts, so prose mentioning a word is not a tool reference"
    (is (tools/names-a-tool? "Call `search` first." "search"))
    (is (not (tools/names-a-tool? "Use the search results." "search")))
    (is (not (tools/names-a-tool? nil "search")))))
