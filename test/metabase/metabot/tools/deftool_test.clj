(ns metabase.metabot.tools.deftool-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.tools.deftool :as deftool]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

;;; ---------------------------------------------------- invoke-tool tests ----------------------------------------------------

(deftest ^:parallel invoke-tool-no-args-test
  (testing "tools receive the resolved Metabot"
    (let [received-args (atom nil)
          handler       (fn [args]
                          (reset! received-args args)
                          {:structured_output {:message "hello"}})
          body          {:conversation_id "conv-123"}
          request       {:metabot/metabot {:id 456 :entity_id "bot-456"}}
          opts          {:api-name      :test-tool
                         :handler       handler
                         :result-schema nil}
          result (deftool/invoke-tool body request opts)]
      (is (= {:metabot {:id 456 :entity_id "bot-456"}} @received-args) "Handler receives the Metabot row")
      (is (= "conv-123" (:conversation_id result)))
      (is (= {:message "hello"} (:structured_output result)))))
  (testing "An omitted id uses the default Metabot"
    (let [received-args (atom nil)
          handler       (fn [args]
                          (reset! received-args args)
                          {:structured_output {:message "hello"}})
          body          {:conversation_id "conv-123"}
          request       {}
          opts          {:api-name      :test-tool
                         :handler       handler
                         :result-schema nil}
          result (deftool/invoke-tool body request opts)]
      (is (= {:metabot (metabot.config/resolve-metabot nil)} @received-args))
      (is (= "conv-123" (:conversation_id result))))))

(deftest ^:parallel invoke-tool-with-args-test
  (testing "invoke-tool with arguments schema that encodes keys"
    (mr/def ::test-args
      [:map {:closed true, :encode/tool-api-request #(set/rename-keys % {:user_id :user-id})}
       [:user_id :int]])
    (let [received-args (atom nil)
          handler       (fn [args]
                          (reset! received-args args)
                          {:structured_output {:processed true}})
          body          {:arguments       {:user_id 42}
                         :conversation_id "conv-456"}
          request       {:metabot/metabot {:id 789 :entity_id "bot-789"}}
          opts          {:api-name      :test-tool
                         :args-schema   ::test-args
                         :handler       handler
                         :result-schema nil}
          result (deftool/invoke-tool body request opts)]
      (is (= {:user-id 42, :metabot {:id 789 :entity_id "bot-789"}} @received-args)
          "Arguments include the Metabot row")
      (is (= "conv-456" (:conversation_id result))))))

(deftest ^:parallel invoke-tool-with-result-decoding-test
  (testing "invoke-tool decodes results using result-schema"
    (mr/def ::test-result
      [:map {:decode/tool-api-response #(set/rename-keys % {:user-name :user_name})}
       [:user_name :string]])
    (let [handler (fn [_args]
                    {:user-name "Alice"})
          body    {:conversation_id "conv-789"}
          request {}
          opts    {:api-name      :test-tool
                   :handler       handler
                   :result-schema ::test-result}
          result (deftool/invoke-tool body request opts)]
      (is (= "Alice" (:user_name result)) "Result should be decoded with schema transformer")
      (is (= "conv-789" (:conversation_id result))))))

(deftest invoke-tool-metabot-resolution-test
  (mt/with-temp [:model/Metabot metabot {:name "Tool sources"}]
    (doseq [metabot-id [nil metabot.config/internal-metabot-id (:entity_id metabot)]]
      (let [received (atom nil)]
        (deftool/invoke-tool {:conversation_id "conv-123" :metabot_id metabot-id}
                             {}
                             {:api-name :test-tool :handler #(do (reset! received %) {})})
        (is (= (metabot.config/resolve-metabot metabot-id) (:metabot @received))))))
  (is (= 400
         (try
           (deftool/invoke-tool {:conversation_id "conv-123" :metabot_id "nonexistent-entity-id"}
                                {} {:api-name :test-tool :handler identity})
           (catch clojure.lang.ExceptionInfo e
             (:status-code (ex-data e)))))))

;;; ---------------------------------------------------- deftool macro tests ----------------------------------------------------

(deftest ^:parallel deftool-macro-expansion-test
  (testing "deftool macro expands to a defendpoint form"
    (let [expansion (macroexpand-1 '(metabase.metabot.tools.deftool/deftool "/test-endpoint"
                                      "Test docstring"
                                      {:args-schema   ::my-args
                                       :result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion) "Should expand to a form")
      (is (= 'metabase.api.macros/defendpoint (first expansion)))
      (is (= :post (second expansion)))
      (is (= "/test-endpoint" (nth expansion 2)))))
  (testing "deftool macro expands correctly for no-args tool"
    (let [expansion (macroexpand-1 '(metabase.metabot.tools.deftool/deftool "/no-args"
                                      "No args tool"
                                      {:result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion))
      (is (= 'metabase.api.macros/defendpoint (first expansion)))))
  (testing "deftool macro always includes request in binding vector"
    (let [expansion (macroexpand-1 '(metabase.metabot.tools.deftool/deftool "/test"
                                      "Test"
                                      {:result-schema ::my-result
                                       :handler       identity}))]
      (is (seq? expansion))
      ;; The expansion should include 'request' in the binding vector
      (let [binding-vec (nth expansion 6)]
        (is (some #{'request} binding-vec) "Should include request binding")))))
