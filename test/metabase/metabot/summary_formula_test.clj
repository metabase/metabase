(ns metabase.metabot.summary-formula-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.test :as mt]))

(def ^:private endpoint "metabot/summary-formula")

(defn- request-body
  ([]
   (request-body {}))
  ([overrides]
   (merge {:mode        "aggregation"
           :prompt      "average total"
           :columns     [{:name "Total" :type "number"}
                         {:name "Created At" :type "date"}
                         {:name "User → Name" :type "text"}]
           :metrics     ["Revenue"]
           :table_name  "Orders"}
          overrides)))

(defn- do-with-llm
  "Call `f` with the LLM stubbed to return `response`, or throw it if it is an exception.
  Passes `f` an atom containing the messages from each recorded LLM call."
  [response f]
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                metabot.self/call-llm-structured         (fn [_model messages & _]
                                                                           (swap! calls conj messages)
                                                                           (if (instance? Exception response)
                                                                             (throw response)
                                                                             response))]
      (f calls))))

(defn- llm-prompts
  "Return the system and user prompts from the sole LLM call recorded in the `calls` atom."
  [calls]
  (is (= 1 (count @calls)))
  (zipmap [:system :user] (map :content (first @calls))))

(defn- sent-to-llm
  "Return the user prompt sent to the LLM for a request with `overrides` merged into the default request."
  [overrides]
  (do-with-llm {:expression "Count" :name "Count"}
               (fn [calls]
                 (mt/user-http-request :rasta :post 200 endpoint (request-body overrides))
                 (:user (llm-prompts calls)))))

(defn- check-error
  "Check that a request with `overrides` gets `status` with the plain-text body `message`, without reaching the LLM."
  ([status message]
   (check-error status message {}))
  ([status message overrides]
   (do-with-llm
    {:expression "Count" :name "Count"}
    (fn [calls]
      (is (= message
             (mt/user-http-request :rasta :post status endpoint (request-body overrides))))
      (is (empty? @calls))))))

;;; -------------------------------------------------- Success --------------------------------------------------

(deftest summary-formula-aggregation-mode-test
  (testing "POST /api/metabot/summary-formula drafts an aggregation from the columns"
    (do-with-llm
     {:expression "Average([Total])" :name "Average total"}
     (fn [calls]
       (is (= {:expression "Average([Total])" :name "Average total"}
              (mt/user-http-request :rasta :post 200 endpoint (request-body))))
       (is (str/starts-with? (:system (llm-prompts calls)) "You write one Metabase custom aggregation"))))))

(deftest summary-formula-expression-mode-test
  (testing "POST /api/metabot/summary-formula drafts a custom column in expression mode"
    (do-with-llm
     {:expression "year([Created At])" :name "Year created"}
     (fn [calls]
       (is (= {:expression "year([Created At])" :name "Year created"}
              (mt/user-http-request :rasta :post 200 endpoint (request-body {:mode "expression"}))))
       (is (str/starts-with? (:system (llm-prompts calls)) "You write one Metabase custom column expression"))))))

(deftest summary-formula-cleans-llm-output-test
  (testing "POST /api/metabot/summary-formula cleans the expression and name the LLM returns"
    (do-with-llm
     {:expression " = `Sum([Total])` " :name "  \"Total   revenue.\" "}
     (fn [_calls]
       (is (= {:expression "Sum([Total])" :name "Total revenue"}
              (mt/user-http-request :rasta :post 200 endpoint (request-body))))))))

(deftest summary-formula-blank-name-test
  (testing "POST /api/metabot/summary-formula names the result after the prompt when nothing is left of the LLM's name"
    (do-with-llm
     {:expression "Count" :name " \"\" "}
     (fn [_calls]
       (is (= {:expression "Count" :name "average total"}
              (mt/user-http-request :rasta :post 200 endpoint (request-body))))))))

(deftest summary-formula-blank-name-and-prompt-test
  (testing "POST /api/metabot/summary-formula returns a 422 when neither the LLM's name nor the prompt leaves a name"
    (do-with-llm
     {:expression "Count" :name "..."}
     (fn [_calls]
       (is (= "Nothing in this data matches that."
              (mt/user-http-request :rasta :post 422 endpoint (request-body {:prompt "???"}))))))))

;;; ------------------------------------------------- LLM input -------------------------------------------------

(deftest summary-formula-llm-input-test
  (testing "POST /api/metabot/summary-formula sends the LLM the table, columns, metrics and prompt"
    (is (= (str "<columns>\n"
                "Table: Orders\n"
                "[Total] (number)\n"
                "[Created At] (date)\n"
                "[User → Name] (text)\n"
                "Metrics:\n"
                "[Revenue]\n"
                "</columns>\n"
                "<request>\n"
                "average total\n"
                "</request>")
           (sent-to-llm {})))))

(deftest summary-formula-optional-input-test
  (testing "POST /api/metabot/summary-formula leaves out the table, column types and metrics it doesn't get"
    (is (= "<columns>\n[Total]\n[Tax]\n</columns>\n<request>\naverage total\n</request>"
           (sent-to-llm {:columns    [{:name "Total"} {:name "Tax" :type nil}]
                         :metrics    nil
                         :table_name nil})))))

;;; -------------------------------------------------- No match --------------------------------------------------

(deftest summary-formula-no-match-test
  (testing "POST /api/metabot/summary-formula returns a 422 when the LLM finds nothing that matches"
    (do-with-llm
     {:expression "" :name "Whatever"}
     (fn [calls]
       (is (= "Nothing in this data matches that."
              (mt/user-http-request :rasta :post 422 endpoint (request-body))))
       (is (= 1 (count @calls)))))))

;;; --------------------------------------------------- Errors ---------------------------------------------------

(deftest summary-formula-requires-authentication-test
  (testing "POST /api/metabot/summary-formula requires authentication"
    (is (= "Unauthenticated"
           (mt/client :post 401 endpoint (request-body))))))

(deftest summary-formula-metabot-disabled-test
  (testing "POST /api/metabot/summary-formula returns a 403 when Metabot is turned off"
    (mt/with-temporary-setting-values [metabot-enabled? false]
      (check-error 403 "AI features are not enabled."))))

(deftest summary-formula-no-llm-test
  (testing "POST /api/metabot/summary-formula returns a 503 when no LLM is configured"
    (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
      (is (= "No AI provider is connected."
             (mt/user-http-request :rasta :post 503 endpoint (request-body)))))))

(deftest summary-formula-managed-lock-test
  (testing "POST /api/metabot/summary-formula returns the managed AI lock's 402 without calling the LLM"
    (do-with-llm
     {:expression "Count" :name "Count"}
     (fn [calls]
       (mt/with-dynamic-fn-redefs [metabot.usage/managed-free-limit-reached? (constantly true)]
         (is (=? {:error-code "metabase_ai_managed_locked"}
                 (mt/user-http-request :rasta :post 402 endpoint (request-body))))
         (is (empty? @calls)))))))

(deftest summary-formula-usage-limit-test
  (testing "POST /api/metabot/summary-formula returns a 429 with the quota message when the usage limit is reached before the call"
    (mt/with-dynamic-fn-redefs [metabot.usage/check-usage-limits! (constantly "Over the limit")]
      (check-error 429 "Over the limit"))))

(deftest summary-formula-usage-limit-during-call-test
  (testing "POST /api/metabot/summary-formula returns a 429 with the quota message when the LLM call hits the usage limit"
    (do-with-llm
     (ex-info "Over the limit" {:type       :metabot/usage-limit-reached
                                :error-code "ai_usage_limit_reached"
                                :message    "Over the limit"})
     (fn [_calls]
       (is (= "Over the limit"
              (mt/user-http-request :rasta :post 429 endpoint (request-body))))))))

(deftest summary-formula-unknown-unavailable-reason-test
  (testing "POST /api/metabot/summary-formula returns a 503 for an unavailable reason it doesn't know"
    (mt/with-dynamic-fn-redefs [metabot.self/llm-call-unavailable-reason (constantly :some-new-reason)]
      (check-error 503 "AI features aren't available right now."))))

(deftest summary-formula-metabot-permission-test
  (testing "POST /api/metabot/summary-formula returns a 403 without the metabot permission"
    (mt/with-dynamic-fn-redefs [scope/resolve-user-permissions (constantly {:permission/metabot     :yes
                                                                            :permission/metabot-nlq :no})]
      (check-error 403 "You don't have access to AI features."))))

(deftest summary-formula-metabot-permission-during-call-test
  (testing "POST /api/metabot/summary-formula returns a 403 when the LLM call denies the metabot permission"
    (do-with-llm
     (ex-info "Permission denied" {:type :metabot/permission-denied})
     (fn [_calls]
       (is (= "You don't have access to AI features."
              (mt/user-http-request :rasta :post 403 endpoint (request-body))))))))

(defn- provider-api-error
  "Return a mock provider exception with HTTP `status`."
  [status]
  (ex-info "OpenAI API error — Rate limit reached — {\"error\":{\"message\":\"org-secret\"}}"
           {:api-error  true
            :provider   "openai"
            :error-code :provider-api-error
            :status     status
            :body       {:error {:message "org-secret"}}}))

(deftest summary-formula-provider-rate-limit-test
  (testing "POST /api/metabot/summary-formula returns a 429 without the provider's message when the provider rate limits"
    (do-with-llm
     (provider-api-error 429)
     (fn [_calls]
       (is (= "The AI provider is rate limiting requests right now. Please try again in a moment."
              (mt/user-http-request :rasta :post 429 endpoint (request-body))))))))

(deftest summary-formula-provider-overloaded-test
  (testing "POST /api/metabot/summary-formula returns a 503 without the provider's message when the provider is overloaded"
    (do-with-llm
     (provider-api-error 529)
     (fn [_calls]
       (is (= "The AI provider is having problems right now. Please try again in a few minutes."
              (mt/user-http-request :rasta :post 503 endpoint (request-body))))))))

(deftest summary-formula-provider-request-failed-test
  (testing "POST /api/metabot/summary-formula returns a 502 with a generic message when the provider request fails"
    (do-with-llm
     (ex-info "openai API request failed: Connection reset" {:api-error  true
                                                             :provider   "openai"
                                                             :error-code :provider-request-failed})
     (fn [_calls]
       (is (= "The AI provider couldn't draft a formula. Please try again."
              (mt/user-http-request :rasta :post 502 endpoint (request-body))))))))

(deftest summary-formula-incomplete-output-test
  (testing "POST /api/metabot/summary-formula returns a 502 with a generic message when the LLM stops before its answer"
    (do-with-llm
     (ex-info "LLM stopped before completing its structured response" {:error-code    "structured-output-incomplete"
                                                                       :finish-reason "length"})
     (fn [_calls]
       (is (= "The AI provider couldn't draft a formula. Please try again."
              (mt/user-http-request :rasta :post 502 endpoint (request-body))))))))

(defn- adapter-error
  "Return a mock adapter exception with its own HTTP status, like a failed Google credential refresh."
  []
  (ex-info "Could not obtain a Google access token: invalid_grant"
           {:api-error   true
            :status-code 400
            :error-code  :google-token-refresh-failed}))

(deftest summary-formula-adapter-error-test
  (testing "POST /api/metabot/summary-formula returns a 502 with a generic message when the provider adapter fails with its own status"
    (do-with-llm
     (adapter-error)
     (fn [_calls]
       (is (= "The AI provider couldn't draft a formula. Please try again."
              (mt/user-http-request :rasta :post 502 endpoint (request-body))))))))

(deftest summary-formula-adapter-error-admin-test
  (testing "POST /api/metabot/summary-formula shows admins the provider adapter's message, with a 502"
    (do-with-llm
     (adapter-error)
     (fn [_calls]
       (is (= "Could not obtain a Google access token: invalid_grant"
              (mt/user-http-request :crowberto :post 502 endpoint (request-body))))))))

;;; ------------------------------------------------- Validation -------------------------------------------------

(deftest summary-formula-validation-test
  (testing "POST /api/metabot/summary-formula rejects an invalid body"
    (do-with-llm
     {:expression "Count" :name "Count"}
     (fn [calls]
       (doseq [[description body] {"missing mode"         (dissoc (request-body) :mode)
                                   "missing prompt"       (dissoc (request-body) :prompt)
                                   "missing columns"      (dissoc (request-body) :columns)
                                   "blank prompt"         (request-body {:prompt "   "})
                                   "invalid mode"         (request-body {:mode "filter"})
                                   "blank column name"    (request-body {:columns [{:name " "}]})
                                   "blank metric name"    (request-body {:metrics [" "]})}]
         (testing description
           (is (=? {:errors some?}
                   (mt/user-http-request :rasta :post 400 endpoint body)))))
       (is (empty? @calls))))))

;;; ------------------------------------------------ Localization ------------------------------------------------

(deftest summary-formula-localized-no-match-test
  (testing "POST /api/metabot/summary-formula localizes the no-match message"
    (mt/with-mock-i18n-bundles! {"es" {:messages {"Nothing in this data matches that." "Nada coincide."}}}
      (mt/with-temporary-setting-values [site-locale "es"]
        (do-with-llm
         {:expression "" :name ""}
         (fn [_calls]
           (is (= "Nada coincide."
                  (mt/user-http-request :rasta :post 422 endpoint (request-body))))))))))

(deftest summary-formula-localized-unavailable-test
  (testing "POST /api/metabot/summary-formula localizes the unavailable messages"
    (mt/with-mock-i18n-bundles! {"es" {:messages {"AI features are not enabled." "IA desactivada."}}}
      (mt/with-temporary-setting-values [site-locale "es"
                                         metabot-enabled? false]
        (check-error 403 "IA desactivada.")))))
