(ns metabase-enterprise.metabot-v3.tools.deftool-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot-v3.context :as context]
   [metabase-enterprise.metabot-v3.tools.deftool :as deftool]
   [metabase.util.malli.registry :as mr]))

;;; ---------------------------------------------------- invoke-tool tests ----------------------------------------------------

(deftest invoke-tool-no-args-test
  (testing "invoke-tool with no arguments schema"
    (let [handler-called? (atom false)
          handler         (fn []
                            (reset! handler-called? true)
                            {:structured_output {:message "hello"}})
          body            {:conversation_id "conv-123"}
          opts            {:api-name      :test-tool
                           :handler       handler
                           :result-schema nil}]
      (with-redefs [context/log (fn [& _] nil)]
        (let [result (deftool/invoke-tool body opts)]
          (is @handler-called? "Handler should have been called")
          (is (= "conv-123" (:conversation_id result)))
          (is (= {:message "hello"} (:structured_output result))))))))

(deftest invoke-tool-with-args-test
  (testing "invoke-tool with arguments schema that encodes keys"
    ;; Define a test schema that transforms snake_case to kebab-case
    (mr/def ::test-args
      [:and
       [:map [:user_id :int]]
       [:map {:encode/tool-api-request #(set/rename-keys % {:user_id :user-id})}]])

    (let [received-args (atom nil)
          handler       (fn [args]
                          (reset! received-args args)
                          {:structured_output {:processed true}})
          body          {:arguments       {:user_id 42}
                         :conversation_id "conv-456"}
          opts          {:api-name      :test-tool
                         :args-schema   ::test-args
                         :handler       handler
                         :result-schema nil}]
      (with-redefs [context/log (fn [& _] nil)]
        (let [result (deftool/invoke-tool body opts)]
          (is (= {:user-id 42} @received-args) "Arguments should be encoded with schema transformer")
          (is (= "conv-456" (:conversation_id result))))))))

(deftest invoke-tool-with-result-decoding-test
  (testing "invoke-tool decodes results using result-schema"
    ;; Define a test schema that transforms kebab-case to snake_case
    (mr/def ::test-result
      [:map {:decode/tool-api-response #(set/rename-keys % {:user-name :user_name})}
       [:user_name :string]])

    (let [handler (fn []
                    {:user-name "Alice"})
          body    {:conversation_id "conv-789"}
          opts    {:api-name      :test-tool
                   :handler       handler
                   :result-schema ::test-result}]
      (with-redefs [context/log (fn [& _] nil)]
        (let [result (deftool/invoke-tool body opts)]
          (is (= "Alice" (:user_name result)) "Result should be decoded with schema transformer")
          (is (= "conv-789" (:conversation_id result))))))))

(deftest invoke-tool-skip-decode-test
  (testing "invoke-tool with skip-decode? true"
    (mr/def ::test-result-skip
      [:map {:decode/tool-api-response #(assoc % :should-not-appear true)}
       [:data :any]])

    (let [handler (fn []
                    {:data "raw"})
          body    {:conversation_id "conv-skip"}
          opts    {:api-name      :test-tool
                   :handler       handler
                   :result-schema ::test-result-skip
                   :skip-decode?  true}]
      (with-redefs [context/log (fn [& _] nil)]
        (let [result (deftool/invoke-tool body opts)]
          (is (= "raw" (:data result)))
          (is (nil? (:should-not-appear result)) "Decoding should be skipped")
          (is (= "conv-skip" (:conversation_id result))))))))

;;; ---------------------------------------------------- invoke-tool-with-request tests ----------------------------------------------------

(deftest invoke-tool-with-request-test
  (testing "invoke-tool-with-request passes request to handler"
    (let [received-args (atom nil)
          handler       (fn [args conv-id request]
                          (reset! received-args {:args args :conv-id conv-id :request request})
                          {:output "done"})
          body          {:arguments       {:query "test"}
                         :conversation_id "conv-req"}
          request       {:metabot-v3/metabot-id "bot-123"}
          opts          {:api-name      :test-tool
                         :args-schema   [:map [:query :string]]
                         :handler       handler
                         :result-schema nil}]
      (with-redefs [context/log (fn [& _] nil)]
        (let [result (deftool/invoke-tool-with-request body request opts)]
          (is (= {:query "test"} (:args @received-args)))
          (is (= "conv-req" (:conv-id @received-args)))
          (is (= "bot-123" (get-in @received-args [:request :metabot-v3/metabot-id])))
          (is (= "conv-req" (:conversation_id result))))))))

;;; ---------------------------------------------------- deftool macro tests ----------------------------------------------------

(deftest deftool-macro-expansion-test
  (testing "deftool macro expands to a defendpoint form"
    (let [expansion (macroexpand-1 '(metabase-enterprise.metabot-v3.tools.deftool/deftool "/test-endpoint"
                                      "Test docstring"
                                      {:args-schema   ::my-args
                                       :result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion) "Should expand to a form")
      (is (= 'metabase.api.macros/defendpoint (first expansion)))
      (is (= :post (second expansion)))
      (is (= "/test-endpoint" (nth expansion 2)))))

  (testing "deftool macro expands correctly for no-args tool"
    (let [expansion (macroexpand-1 '(metabase-enterprise.metabot-v3.tools.deftool/deftool "/no-args"
                                      "No args tool"
                                      {:result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion))
      (is (= 'metabase.api.macros/defendpoint (first expansion)))))

  (testing "deftool macro expands correctly for needs-request tool"
    (let [expansion (macroexpand-1 '(metabase-enterprise.metabot-v3.tools.deftool/deftool "/with-request"
                                      "Needs request"
                                      {:args-schema    ::my-args
                                       :result-schema  ::my-result
                                       :handler        identity
                                       :needs-request? true}))]
      (is (seq? expansion))
      ;; The expansion should include 'request' in the binding vector
      (let [binding-vec (nth expansion 6)]
        (is (some #{'request} binding-vec) "Should include request binding")))))
