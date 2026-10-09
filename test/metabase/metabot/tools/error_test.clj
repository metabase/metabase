(ns metabase.metabot.tools.error-test
  (:require
   [clojure.test :refer :all]
   [malli.generator :as mg]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.recoverable.common]
   [metabase.metabot.tools.recoverable.pipeline]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; The declarations these tests use live here rather than being generated per-test, so that the
;;; catalog test below covers them too — a declaration that only exists inside a `testing` block is
;;; a declaration the catalog test never sees.

(tools.error/defrecoverable test-no-widget!
  "There is no widget with that id."
  {:payload [:map {:closed true}
             [:id        :int]
             [:available [:sequential :int]]]}
  [{:keys [id available]}]
  {:message  (str "Widget " id " does not exist. Available ids: " (pr-str available) ".")
   :recovery [{:uses #{"search"} :text "Call `search` to find a widget id."}]})

(tools.error/defrecoverable test-custom-status!
  "A declaration that overrides the default status code."
  {:payload     [:map {:closed true} [:id :int]]
   :status-code 404}
  [{:keys [id]}]
  {:message (str "Widget " id " is gone.") :recovery []})

(deftest ^:parallel constructor-throws-a-recoverable-tool-error-test
  (testing "the constructor throws, carrying the declared code and the body's text"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (test-no-widget! {:id 7 :available [1 2]})))]
      (is (= {:class    :recoverable
              :code     ::test-no-widget
              :message  "Widget 7 does not exist. Available ids: [1 2]."
              :recovery [{:uses #{"search"} :text "Call `search` to find a widget id."}]
              :data     {:id 7 :available [1 2]}}
             (tools.error/classify e)))
      (testing "the exception message is the model-facing message"
        (is (= "Widget 7 does not exist. Available ids: [1 2]." (ex-message e))))
      (testing "and the ex-data keeps the shape non-agent callers of shared tool helpers handle"
        (is (=? {:agent-error? true :status-code 400} (ex-data e)))))))

(deftest ^:parallel status-code-is-declarable-test
  (is (=? {:status-code 404}
          (ex-data (is (thrown? clojure.lang.ExceptionInfo (test-custom-status! {:id 1})))))))

(deftest ^:parallel invalid-payload-becomes-internal-test
  (testing "a payload that does not match the declaration never reaches the agent"
    (doseq [[label payload] {"wrong type"   {:id "7" :available []}
                             "missing key"  {:id 7}
                             "extra key"    {:id 7 :available [] :extra true}}]
      (testing label
        (is (= {:class :unrecoverable :code :internal
                :data  {:code ::test-no-widget :payload payload}}
               (tools.error/classify
                (is (thrown? clojure.lang.ExceptionInfo (test-no-widget! payload))))))))))

(deftest ^:parallel body-result-is-validated-test
  (testing "a body that returns the wrong shape is an internal error, not a malformed agent message"
    ;; Redefined rather than declared, because the catalog is global: a deliberately broken
    ;; declaration registered here would be picked up by the catalog test below, where it belongs to
    ;; nobody and fails for the wrong reason.
    (mt/with-dynamic-fn-redefs [tools.error/recoverables
                                (constantly {::bad-body {:code           ::bad-body
                                                         :var            #'test-no-widget!
                                                         :doc            "A declaration whose body is wrong."
                                                         :payload-schema [:map {:closed true}]
                                                         :status-code    400
                                                         :build-fn       (constantly {:message "no recovery key"})}})]
      (is (= :internal
             (:code (tools.error/classify
                     (is (thrown? clojure.lang.ExceptionInfo
                                  (tools.error/throw-recoverable! ::bad-body {}))))))))))

(deftest ^:parallel unknown-code-is-internal-test
  (is (= :internal
         (:code (tools.error/classify
                 (is (thrown? clojure.lang.ExceptionInfo
                              (tools.error/throw-recoverable! ::nothing-declares-this {}))))))))

(deftest ^:parallel unrecoverable-carries-no-model-facing-message-test
  (testing "the schema makes it impossible to attach agent-bound text to an unrecoverable error"
    (is (mr/validate ::tools.error/tool-error {:class :unrecoverable :code :internal}))
    (is (not (mr/validate ::tools.error/tool-error
                          {:class :unrecoverable :code :internal :message "leaked"}))))
  (testing "a :user-message is the exception message, so nothing unauthored ends up there"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (tools.error/unrecoverable! ::denied {:user-message "Ask an admin."})))]
      (is (= "Ask an admin." (ex-message e)))
      (is (= {:class :unrecoverable :code ::denied :user-message "Ask an admin."}
             (tools.error/classify e)))
      (testing "and it is not flagged as an agent error"
        (is (not (:agent-error? (ex-data e)))))))
  (testing "without one the message is the code, so logs still identify the failure"
    (is (= ":metabase.metabot.tools.error-test/denied"
           (ex-message (is (thrown? clojure.lang.ExceptionInfo
                                    (tools.error/unrecoverable! ::denied))))))))

(deftest ^:parallel classify-test
  (testing "an exception with no ToolError is unrecoverable :internal"
    (is (= {:class :unrecoverable :code :internal}
           (tools.error/classify (ex-info "a plain failure" {:status-code 500}))))
    (is (= {:class :unrecoverable :code :internal}
           (tools.error/classify (RuntimeException. "boom")))))
  (testing "classify reads the top-level exception only — wrapping a declared error demotes it,
           which is the safe direction"
    (let [declared (is (thrown? clojure.lang.ExceptionInfo (test-custom-status! {:id 1})))]
      (is (= :recoverable (:class (tools.error/classify declared))))
      (is (= :unrecoverable
             (:class (tools.error/classify (ex-info "wrapped" {} declared))))))))

;;; The two tests below write the global catalog, so they are not `^:parallel`.

(deftest duplicate-declaration-is-rejected-test
  (testing "a second var claiming an existing code fails loudly rather than shadowing by load order"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"already declared by"
         (tools.error/declare-recoverable! {:code           ::test-no-widget
                                            :var            #'test-custom-status!
                                            :doc            "An impostor."
                                            :payload-schema [:map {:closed true}]
                                            :status-code    400
                                            :build-fn       (constantly {:message "x" :recovery []})}))))
  (testing "but redeclaring the same var is fine, so namespace reloads work"
    (is (= ::test-no-widget
           (tools.error/declare-recoverable!
            (get (tools.error/recoverables) ::test-no-widget))))))

(deftest declaration-requires-a-var-and-a-schema-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"qualified keyword"
                        (tools.error/declare-recoverable! {:code :unqualified :var #'test-no-widget!})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"constructor var"
                        (tools.error/declare-recoverable! {:code ::x :var 'not-a-var})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"without a payload schema"
                        (tools.error/declare-recoverable! {:code ::x :var #'test-no-widget!}))))

;;; ------------------------------------- Reading a recoverable error ----------------------------------------------

(deftest ^:parallel recovery-steps-for-tools-test
  (let [steps [{:uses #{} :text "Always applies."}
               {:uses #{"search"} :text "Call `search`."}
               {:uses #{"search" "read_resource"} :text "Call `search` then `read_resource`."}]]
    (is (= [(first steps)] (tools.error/recovery-steps-for-tools steps #{})))
    (is (= (take 2 steps)  (tools.error/recovery-steps-for-tools steps #{"search"})))
    (is (= steps (tools.error/recovery-steps-for-tools steps #{"search" "read_resource" "widget"})))))

(deftest ^:parallel names-a-tool?-test
  (testing "only a backticked name counts, so prose mentioning a word is not a tool reference"
    (is (tools.error/names-a-tool? "Call `search` first." "search"))
    (is (not (tools.error/names-a-tool? "Use the search results." "search")))
    (is (not (tools.error/names-a-tool? nil "search")))))

(deftest ^:parallel recoverable-text-test
  (testing "one function for both places a recoverable error becomes text — a failed call, and one
           item of a batched call — so the wording cannot drift between them"
    (let [error {:message  "Widget 7 does not exist."
                 :recovery [{:uses #{"search"}        :text "Call `search` to find one."}
                            {:uses #{"read_resource"} :text "Or call `read_resource`."}]}]
      (is (= "Widget 7 does not exist.\nCall `search` to find one.\nOr call `read_resource`."
             (tools.error/recoverable-text error #{"search" "read_resource"})))
      (is (= "Widget 7 does not exist.\nCall `search` to find one."
             (tools.error/recoverable-text error #{"search"})))
      (is (= "Widget 7 does not exist." (tools.error/recoverable-text error #{}))))))

;;; ------------------------------------------- The catalog --------------------------------------------------------

(def ^:private catalog-sample-count
  "How many payloads to generate per declaration. Enough to exercise branching on payload values —
  `recoverable.pipeline/uri-in-source-table!` picks its recovery step from `:entity-type` — without
  making the suite's runtime depend on the size of the catalog."
  20)

(def ^:private catalog-seed
  "Fixed so the generated payloads are the same on every run. Malli's string generator can emit
  control characters, which `render`'s authored-text assertions would (correctly) reject, and an
  unseeded generator would surface that as a test that fails one run in a few hundred. With a seed,
  either it fails every time and says something real, or it never does."
  20261007)

(deftest ^:parallel every-declared-error-produces-a-valid-tool-error-test
  (testing "one test for the whole catalog: generate payloads from each declaration's own schema,
           raise it, and check what comes out"
    (doseq [[code {:keys [payload-schema var]}] (tools.error/recoverables)]
      (testing (str code " (" (symbol var) ")")
        (doseq [payload (mg/sample payload-schema {:size catalog-sample-count :seed catalog-seed})]
          (let [e     (try
                        (tools.error/throw-recoverable! code payload)
                        (catch Throwable e e))
                error (tools.error/classify e)]
            (testing (str "payload " (pr-str payload))
              (is (= :recoverable (:class error))
                  "a generated payload must satisfy its own declaration")
              (is (mr/validate ::tools.error/tool-error error))
              (is (= code (:code error)))
              (is (= payload (:data error)))
              (testing "and rendering it passes the authored-text assertions, for any profile"
                (doseq [tool-names [#{} #{"search"} #{"search" "read_resource"}]]
                  (is (some? (:output (tools.runtime/render error tool-names)))))))))))))

(deftest ^:parallel recoverable-codes-match-their-constructors-test
  (testing "a code is its constructor's name without the !, so a code says where to look"
    (doseq [[code {:keys [var]}] (tools.error/recoverables)]
      (testing (str code)
        (is (= code (tools.error/code-for (:ns (meta var)) (:name (meta var)))))
        (is (re-find #"!$" (name (:name (meta var))))
            "a constructor always throws, so its name ends with !")))))
