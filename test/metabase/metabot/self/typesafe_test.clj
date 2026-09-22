(ns metabase.metabot.self.typesafe-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.self.system-one :as s1]
   [metabase.metabot.self.typesafe :as typesafe]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private credentials {:api-key "ts-byok" :base-url "https://api.typesafe.ai"})

(def ^:private questions
  {:urgent        (s1/noul "Does this convey urgency?" {:true "time-sensitive" :false "no urgency"})
   :topic         (s1/choice "What is this about?" [:billing "tech support"])
   "anger level"  (s1/score "How angry?" ["Calm" {:summary "Frustrated" :signals ["caps"]} "Very angry"])})

(def ^:private wire-response
  {"model"   "jev-1.13.0"
   "answers" {"urgent"      {"type" "noul" "noul" 0.92}
              "topic"       {"type"          "choice"
                             "choice"        "billing"
                             "probabilities" {"billing" 0.85 "tech support" 0.15}
                             "confidence"    0.82}
              "anger level" {"type"          "score"
                             "score"         1.6
                             "probabilities" {"0" 0.05 "1" 0.3 "2" 0.65}
                             "legend"        {"0" "Calm" "1" {"summary" "Frustrated" "signals" ["caps"]} "2" "Very angry"}
                             "confidence"    0.78}}
   "usage"   {"input_tokens" 41 "output_tokens" 0}})

;;; ──────────────────────────────────────────────────────────────────
;;; Request body
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-test
  (is (= {:model     "jev-latest"
          :state     {:ticket "Help!"}
          :questions {"urgent"      {:type         "noul"
                                     :instructions "Does this convey urgency?"
                                     :criteria     {:true "time-sensitive" :false "no urgency"}}
                      "topic"       {:type         "choice"
                                     :instructions "What is this about?"
                                     :criteria     {"billing" nil "tech support" nil}}
                      "anger level" {:type         "score"
                                     :instructions "How angry?"
                                     :criteria     ["Calm" {:summary "Frustrated" :signals ["caps"]} "Very angry"]}}}
         (typesafe/request-body {:state {:ticket "Help!"} :questions questions}))))

(deftest ^:parallel request-body-model-test
  (is (= "jev-1.12" (:model (typesafe/request-body {:state "s" :questions questions :model "jev-1.12"})))))

(deftest ^:parallel request-body-namespaced-keys-test
  (is (= #{"ticket/urgent"}
         (set (keys (:questions (typesafe/request-body {:state "s" :questions {:ticket/urgent (s1/noul "?")}})))))))

(deftest ^:parallel request-body-colliding-keys-test
  (testing "question keys"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must stay distinct"
                          (typesafe/request-body {:state "s" :questions {:a (s1/noul "?") "a" (s1/noul "?")}}))))
  (testing "choice options"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must stay distinct"
                          (typesafe/request-body {:state "s" :questions {:q (s1/choice "?" {:a nil "a" nil})}})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Response translation
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel response->answers-test
  (is (= {:model   "jev-1.13.0"
          :answers {:urgent       {:type :noul :noul 0.92}
                    :topic        {:type          :choice
                                   :choice        :billing
                                   :probabilities {:billing 0.85 "tech support" 0.15}
                                   :confidence    0.82}
                    "anger level" {:type          :score
                                   :score         1.6
                                   :probabilities {0 0.05 1 0.3 2 0.65}
                                   :legend        {0 "Calm" 1 {:summary "Frustrated" :signals ["caps"]} 2 "Very angry"}
                                   :confidence    0.78}}
          :usage   {:input-tokens 41 :output-tokens 0}}
         (typesafe/response->answers questions wire-response))))

(deftest ^:parallel response->answers-unasked-question-test
  (testing "answers to questions we did not ask are dropped"
    (is (= #{:urgent}
           (set (keys (:answers (typesafe/response->answers
                                 {:urgent (s1/noul "?")}
                                 (assoc-in wire-response ["answers" "extra"] {"type" "noul" "noul" 0.1})))))))))

(deftest ^:parallel response->answers-unreported-usage-test
  (is (= {:input-tokens nil :output-tokens nil}
         (:usage (typesafe/response->answers questions (dissoc wire-response "usage"))))))

(deftest ^:parallel response->answers-unknown-type-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unknown type \"ranking\""
                        (typesafe/response->answers {:urgent (s1/noul "?")}
                                                    {"answers" {"urgent" {"type" "ranking"}}}))))

;;; ──────────────────────────────────────────────────────────────────
;;; HTTP
;;; ──────────────────────────────────────────────────────────────────

(deftest system-one-test
  (let [requests (atom [])]
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (swap! requests conj req)
                                               {:status 200 :body (json/encode wire-response)})]
      (is (= :billing
             (get-in (typesafe/system-one {:state "Help!" :questions questions :credentials credentials})
                     [:answers :topic :choice])))
      (testing "every question travels in one request"
        (is (= 1 (count @requests)))
        (is (=? {:method  :post
                 :url     "https://api.typesafe.ai/v1/systemone"
                 :headers {"Authorization" "Bearer ts-byok"}}
                (first @requests)))
        (is (= #{"urgent" "topic" "anger level"}
               (set (keys (get (json/decode (:body (first @requests))) "questions")))))))))

(deftest system-one-missing-key-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No TypeSafe API key is set"
                        (typesafe/system-one {:state "s" :questions questions :credentials {:api-key ""}}))))

(deftest system-one-ai-proxy-unsupported-test
  (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"AI proxy is not supported for TypeSafe"
                          (typesafe/system-one {:state "s" :questions questions :ai-proxy? true})))))

(defn- error-message!
  [status]
  (with-redefs [http/request (fn [_] (throw (ex-info "HTTP error"
                                                     {:status  status
                                                      :headers {"content-type" "application/json"}
                                                      :body    "{\"detail\":\"nope\"}"})))]
    (try
      (typesafe/system-one {:state "s" :questions questions :credentials credentials})
      (catch Exception e
        (ex-message e)))))

(deftest error-status-messages-test
  (is (str/starts-with? (error-message! 422) "TypeSafe rejected the request parameters"))
  (testing "auth failures keep the canonical message and withhold the upstream body"
    (is (= "TypeSafe API key expired or invalid" (error-message! 401))))
  (is (str/starts-with? (error-message! 429) "TypeSafe has rate limited us"))
  (is (str/starts-with? (error-message! 529) "TypeSafe is overloaded"))
  (is (str/starts-with? (error-message! 418) "TypeSafe API error (HTTP 418)")))

(deftest list-models-test
  (testing "the catalog is fetched to verify the key, but no model is offered"
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (=? {:method  :get
                                                        :url     "https://api.typesafe.ai/v1/models"
                                                        :headers {"Authorization" "Bearer ts-byok"}}
                                                       req))
                                               {:status 200 :body "{\"models\":[{\"name\":\"jev-1.13.0\"}]}"})]
      (is (= {:models []} (typesafe/list-models {:credentials credentials})))))
  (testing "a rejected key surfaces as an api error"
    (with-redefs [http/request (fn [_] (throw (ex-info "HTTP error" {:status 401 :body "{}"})))]
      (is (=? {:api-error true :status 401}
              (try (typesafe/list-models {:credentials credentials})
                   (catch Exception e (ex-data e))))))))
