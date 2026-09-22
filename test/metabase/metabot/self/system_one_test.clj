(ns metabase.metabot.self.system-one-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.system-one :as s1]
   [metabase.metabot.usage :as usage]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private questions
  {:urgent (s1/noul "Does this convey urgency?")
   :topic  (s1/choice "What is this about?" [:billing :technical])
   :anger  (s1/score "How angry?" ["Calm" "Angry"])})

(def ^:private ok-body
  (json/encode {"model"   "jev-1.13.0"
                "answers" {"urgent" {"type" "noul" "noul" 0.92}
                           "topic"  {"type"          "choice"
                                     "choice"        "billing"
                                     "probabilities" {"billing" 0.8 "technical" 0.2}
                                     "confidence"    0.7}
                           "anger"  {"type"          "score"
                                     "score"         0.3
                                     "probabilities" {"0" 0.7 "1" 0.3}
                                     "legend"        {"0" "Calm" "1" "Angry"}
                                     "confidence"    0.6}}
                "usage"   {"input_tokens" 41 "output_tokens" 0}}))

(defn- do-with-typesafe-server!
  "Run `thunk` with every HTTP request answered by `respond`, passing it the requests made so far."
  [respond thunk]
  (let [requests (atom [])]
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (swap! requests conj req)
                                               (respond req))]
      (thunk requests))))

;;; ──────────────────────────────────────────────────────────────────
;;; Constructors
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel constructors-test
  (is (= {:type :noul :instructions "?"} (s1/noul "?")))
  (is (= {:type :noul :instructions "?" :criteria {:true "yes" :false "no"}}
         (s1/noul "?" {:true "yes" :false "no"})))
  (testing "choice options as a sequence are left undescribed"
    (is (= {:type :choice :instructions "?" :criteria {:a nil :b nil}}
           (s1/choice "?" [:a :b]))))
  (is (= {:type :choice :instructions "?" :criteria {:a "the first"}}
         (s1/choice "?" {:a "the first"})))
  (is (= {:type :score :instructions "?" :criteria ["low" "high"]}
         (s1/score "?" '("low" "high"))))
  (is (mr/validate ::s1/questions questions)))

;;; ──────────────────────────────────────────────────────────────────
;;; ask
;;; ──────────────────────────────────────────────────────────────────

(deftest ask-test
  (llm.tu/with-connections [(llm.tu/connection "anthropic") (llm.tu/connection "typesafe")]
    (do-with-typesafe-server!
     (constantly {:status 200 :body ok-body})
     (fn [requests]
       (is (= {:model   "jev-1.13.0"
               :answers {:urgent {:type :noul :noul 0.92}
                         :topic  {:type :choice :choice :billing :probabilities {:billing 0.8 :technical 0.2}
                                  :confidence 0.7}
                         :anger  {:type :score :score 0.3 :probabilities {0 0.7 1 0.3} :legend {0 "Calm" 1 "Angry"}
                                  :confidence 0.6}}
               :usage   {:input-tokens 41 :output-tokens 0}}
              (s1/ask "Help!" questions)))
       (testing "runs on the first usable System One connection, on its provider's default model"
         (is (=? {:url     "https://api.typesafe.ai/v1/systemone"
                  :headers {"Authorization" "Bearer ts-test-key"}}
                 (first @requests)))
         (is (= "jev-latest" (get (json/decode (:body (first @requests))) "model"))))))))

(deftest ask-model-ref-test
  (llm.tu/with-connections [(llm.tu/connection "typesafe")
                            (assoc (llm.tu/connection "typesafe" {:api-key "ts-other"}) :key "typesafe-2")]
    (do-with-typesafe-server!
     (constantly {:status 200 :body ok-body})
     (fn [requests]
       (s1/ask "Help!" questions {:model-ref "typesafe-2/jev-1.12"})
       (is (=? {:headers {"Authorization" "Bearer ts-other"}} (first @requests)))
       (is (= "jev-1.12" (get (json/decode (:body (first @requests))) "model")))))))

(deftest ask-rejects-an-invalid-batch-test
  (llm.tu/with-connections [(llm.tu/connection "typesafe")]
    (do-with-typesafe-server!
     (fn [_] (throw (ex-info "should never be called" {})))
     (fn [_]
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"should have at least 1 elements"
                             (s1/ask "Help!" {:topic {:type :choice :criteria {}}})))
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input"
                             (s1/ask "Help!" {})))))))

(deftest ask-without-a-system-one-connection-test
  (llm.tu/with-connections [(llm.tu/connection "anthropic") (llm.tu/connection "typesafe" {:api-key nil})]
    (is (=? {:error-code :llm-not-configured}
            (try (s1/ask "Help!" questions)
                 (catch Exception e (ex-data e)))))))

(deftest ask-rejects-a-chat-model-ref-test
  (llm.tu/with-connections [(llm.tu/connection "anthropic")]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not serve System One models"
                          (s1/ask "Help!" questions {:model-ref "anthropic/claude-sonnet-4-6"})))))

(deftest ask-retries-a-rate-limit-test
  (llm.tu/with-connections [(llm.tu/connection "typesafe")]
    (let [attempts (atom 0)]
      (do-with-typesafe-server!
       (fn [_]
         (if (= 1 (swap! attempts inc))
           (throw (ex-info "HTTP error" {:status 429 :headers {"retry-after" "0"} :body "{}"}))
           {:status 200 :body ok-body}))
       (fn [requests]
         (is (= :billing (get-in (s1/ask "Help!" questions) [:answers :topic :choice])))
         (is (= 2 (count @requests))))))))

(deftest ask-reports-usage-test
  (llm.tu/with-connections [(llm.tu/connection "typesafe")]
    (let [reported (atom nil)]
      (mt/with-dynamic-fn-redefs [http/request             (constantly {:status 200 :body ok-body})
                                  self/report-token-usage! (fn [tracking-opts usage _] (reset! reported [tracking-opts usage]))]
        (s1/ask "Help!" questions {:tracking-opts {:source "metabot_agent"}})
        (is (= [{:source "metabot_agent" :tag "system-one" :model "typesafe/jev-latest" :ai-proxy? false}
                {:promptTokens 41 :completionTokens 0}]
               @reported))))))

(deftest ask-over-the-usage-limit-test
  (llm.tu/with-connections [(llm.tu/connection "typesafe")]
    (mt/with-dynamic-fn-redefs [usage/check-usage-limits! (constantly "You've used all of your AI tokens.")
                                http/request              (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"used all of your AI tokens"
                            (s1/ask "Help!" questions))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Reading answers
;;; ──────────────────────────────────────────────────────────────────

(def ^:private response
  {:model   "jev-1.13.0"
   :answers {:urgent {:type :noul :noul 0.92}
             :topic  {:type :choice :choice :billing :probabilities {:billing 0.8 :technical 0.2} :confidence 0.7}
             :anger  {:type :score :score 0.3 :probabilities {0 0.7 1 0.3} :legend {0 "Calm" 1 "Angry"}
                      :confidence 0.6}}
   :usage   {:input-tokens 41 :output-tokens 0}})

(deftest ^:parallel answers-by-type-test
  (is (= [:urgent] (keys (s1/nouls response))))
  (is (= [:topic] (keys (s1/choices response))))
  (is (= [:anger] (keys (s1/scores response)))))

(deftest ^:parallel values-test
  (is (= {:urgent 0.92 :topic :billing :anger 0.3} (s1/values response))))

(deftest ^:parallel ranked-test
  (is (= [[:billing 0.8] [:technical 0.2]] (s1/ranked (get-in response [:answers :topic]))))
  (is (= [[0 0.7] [1 0.3]] (s1/ranked (get-in response [:answers :anger])))))
