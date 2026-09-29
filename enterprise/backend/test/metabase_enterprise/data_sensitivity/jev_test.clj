(ns metabase-enterprise.data-sensitivity.jev-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.jev :as jev]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(defn- field
  [name & {:as overrides}]
  (merge {:id              (inc (mod (hash name) 1000000))
          :name            name
          :display_name    name
          :description     nil
          :base_type       :type/Text
          :database_type   "VARCHAR"
          :semantic_type   nil
          :position        0
          :visibility_type :normal
          :fk_target       nil
          :fingerprint     nil
          :human_set       #{}
          :current         {:data_sensitivity nil :human_set false}
          :cached_values   nil
          :sample_values   nil}
         overrides))

(defn- packet [fields]
  {:table  {:id 1 :name "PEOPLE" :schema "public" :display_name "People" :description "Registered users"
            :entity_type :entity/UserTable :db_id 1 :engine :postgres}
   :fields (vec fields)
   :sample {:rows 10 :truncation 120 :error nil}})

(defn- ok [body]
  {:status 200 :headers {} :body (json/encode body)})

(defn- error-response [status body & {:as headers}]
  {:status status :headers (or headers {}) :body (json/encode body)})

(defn canned-jev
  "A stand-in for the Jev HTTP call that answers every sensitivity question with `(answer-fn column-name)` merged
  over a confident PUBLIC answer, and every semantic question with `none`. `answer-fn` returning nil omits the
  answer."
  [answer-fn]
  (fn [_api-key {:keys [questions]} _opts]
    (ok {:model   "jev-1.13.0"
         :answers (into {}
                        (keep (fn [[id {:keys [instructions]}]]
                                (let [column (:column instructions)]
                                  (if (str/starts-with? id "s")
                                    (when-let [answer (answer-fn column)]
                                      [id (merge {:type          "choice"
                                                  :choice        "PUBLIC"
                                                  :confidence    0.95
                                                  :probabilities {"PUBLIC" 0.97 "PII" 0.03}}
                                                 answer)])
                                    [id {:type "choice" :choice "none" :confidence 0.9}]))))
                        questions)
         :usage   {:input_tokens (* 100 (count questions)) :output_tokens 10}})))

(defn do-with-jev!
  "Run `thunk` with `post-fn` standing in for the Jev HTTP call and a key configured."
  [post-fn thunk]
  (mt/with-temporary-setting-values [data-sensitivity-jev-api-key "apikey_test"]
    (mt/with-dynamic-fn-redefs [jev/post! post-fn]
      (thunk))))

(defn- classify! [fields post-fn & {:as opts}]
  (do-with-jev! post-fn #(jev/classify-packet (packet fields) opts)))

(deftest table-request-test
  (let [fields [(field "EMAIL" :semantic_type :type/Email :human_set #{:semantic_type}
                       :current {:data_sensitivity :PHI :human_set false})
                (field "ID" :base_type :type/Integer)]]
    (doseq [criteria [:shared :tuned]]
      (testing (str criteria " criteria")
        (let [req (jev/table-request (packet fields) fields (assoc jev/default-options :criteria criteria))]
          (is (= #{"s0" "t0" "s1" "t1"} (set (keys (:questions req)))))
          (is (= llm/categories (keys (get-in req [:questions "s0" :criteria])))
              "sensitivity options are the categories in precedence order")
          (is (= (cons llm/no-semantic-type llm/semantic-types) (keys (get-in req [:questions "t1" :criteria]))))
          (is (= "ID" (get-in req [:questions "s1" :instructions :column])))
          (is (str/includes? (first (get-in req [:state :columns])) "[human-set]"))
          (is (not (str/includes? (json/encode (:state req)) "PHI"))
              "the current label is never sent"))))
    (testing "tuned definitions are shorter than the shared ones"
      (let [size #(count (json/encode (jev/table-request (packet fields) fields (assoc jev/default-options :criteria %))))]
        (is (< (size :tuned) (size :shared)))))))

(deftest field-request-test
  (let [fields [(field "FIRST") (field "LAST") (field "PAGE")]
        req    (jev/field-request (packet fields) (second fields) jev/default-options)]
    (is (= #{"s0" "t0"} (set (keys (:questions req)))))
    (is (str/starts-with? (get-in req [:state :column]) "- LAST ("))
    (is (= ["FIRST" "PAGE"] (get-in req [:state :other_columns])))))

(deftest parse-answers-test
  (let [fields [(field "A") (field "B") (field "C") (field "D") (field "E")]
        parsed (jev/parse-answers fields
                                  {"s0" {"choice" "PII" "confidence" 0.93 "probabilities" {"PII" 0.95 "PUBLIC" 0.05}}
                                   "t0" {"choice" "type/Email" "confidence" 0.95}
                                   "s1" {"choice" "PII" "confidence" 0.3 "probabilities" {"PII" 0.55 "PUBLIC" 0.45}}
                                   "t1" {"choice" "type/Email" "confidence" 0.5}
                                   "s2" {"choice" "NOT_A_CATEGORY" "confidence" 0.9}
                                   "s4" {"choice" "PUBLIC" "confidence" 0.7 "probabilities" {"PUBLIC" 0.8}}
                                   "t4" {"choice" "type/Bogus" "confidence" 0.99}}
                                  {:abstain-below 0.5 :semantic-min 0.7})]
    (testing "the argmax is the label"
      (is (=? {:data-sensitivity :PII :status :labeled :confidence "high" :semantic-type :type/Email
               :raw-label :PII :score 0.93 :reasoning "p=0.95; runner-up PUBLIC 0.05"}
              (get-in parsed [:fields "A"]))))
    (testing "below the cutoff the field abstains and keeps the distribution"
      (is (=? {:data-sensitivity nil :status :abstain :confidence "low" :raw-label :PII
               :probabilities {"PII" 0.55 "PUBLIC" 0.45} :semantic-type nil}
              (get-in parsed [:fields "B"]))))
    (testing "an unknown category or a missing answer drops the field"
      (is (= :dropped (get-in parsed [:fields "C" :status])))
      (is (= :dropped (get-in parsed [:fields "D" :status]))))
    (testing "an unknown semantic type is nulled and counted"
      (is (=? {:status :labeled :semantic-type nil} (get-in parsed [:fields "E"]))))
    (is (= {:dropped-unknown 0 :dropped-invalid 1 :dropped-missing 1 :semantic-dropped 1 :dropped-oversize 0}
           (:counts parsed)))))

(deftest classify-packet-table-shape-test
  (let [fields   (mapv #(field (str "F" %)) (range 100))
        requests (atom [])
        result   (classify! fields
                            (fn [& [_ body :as args]]
                              (swap! requests conj (count (:questions body)))
                              (apply (canned-jev #(get {"F7" {:choice "PII"}} % {})) args)))]
    (testing "a 100-field table is chunked at 40"
      (is (= [80 80 40] @requests))
      (is (= 3 (:requests result))))
    (is (=? {:model  "typesafe/jev-1.13.0"
             :usage  {:input_tokens 20000 :output_tokens 30 :cache_read_tokens 0 :total_tokens 20030}
             :fields {"F0" {:data-sensitivity :PUBLIC} "F7" {:data-sensitivity :PII}}}
            result))
    (is (= 100 (count (:fields result))))))

(deftest classify-packet-field-shape-test
  (let [fields   (mapv #(field (str "F" %)) (range 6))
        requests (atom 0)
        result   (classify! fields
                            (fn [& args]
                              (swap! requests inc)
                              (apply (canned-jev (constantly {})) args))
                            :request-shape :field)]
    (is (= 6 @requests (:requests result)))
    (is (= (set (map :name fields)) (set (keys (:fields result)))))))

(defn- oversize-response []
  (error-response 400 {:detail {:error_type "max_tokens_exceeded"}}))

(deftest classify-packet-oversize-test
  (let [fields  (mapv #(field (str "F" %)) (range 8))
        sizes   (atom [])
        answer  (canned-jev (constantly {}))
        result  (classify! fields
                           (fn [& [_ {:keys [questions]} :as args]]
                             (let [columns (set (map (comp :column :instructions) (vals questions)))]
                               (swap! sizes conj (count columns))
                               (if (or (> (count columns) 2) (contains? columns "F5"))
                                 (oversize-response)
                                 (apply answer args)))))]
    (testing "an oversize request is halved until it fits"
      (is (= [8 4 2 2 4 2 1 1 2] @sizes)))
    (testing "a single field still over the limit is dropped"
      (is (= :dropped (get-in result [:fields "F5" :status])))
      (is (= 1 (get-in result [:counts :dropped-oversize])))
      (is (= :labeled (get-in result [:fields "F4" :status]))))))

(deftest errors-test
  (let [fields [(field "A")]]
    (testing "a 401 is a provider error every table would repeat"
      (let [e (is (thrown? clojure.lang.ExceptionInfo
                           (classify! fields (constantly (error-response 401 {:detail {:error_type "authentication_error"
                                                                                       :message    "bad key"}})))))]
        (is (= {:api-error true :provider "typesafe" :status 401} (ex-data e)))
        (is (= "bad key" (ex-message e)))
        (is (core/fatal-error? e))))
    (testing "a 429 is retried"
      (let [calls  (atom 0)
            result (classify! fields (fn [& args]
                                       (if (= 1 (swap! calls inc))
                                         (error-response 429 {} "retry-after" "0")
                                         (apply (canned-jev (constantly {})) args))))]
        (is (= 2 @calls))
        (is (= 1 (:retries result)))
        (is (= 2 (count (:request-ms result))))))
    (testing "a 422 means the request builder is wrong, which fails the table but not the run"
      (let [e (is (thrown? clojure.lang.ExceptionInfo
                           (classify! fields (constantly (error-response 422 {:detail [{:loc ["body" "questions"]
                                                                                        :msg "Field required"}]})))))]
        (is (= "body.questions: Field required" (ex-message e)))
        (is (not (core/fatal-error? e)))))
    (testing "an oversize 400 is not a provider rejection"
      (let [e (is (thrown? clojure.lang.ExceptionInfo
                           (do-with-jev! (constantly (oversize-response))
                                         #(#'jev/request! "k" {} jev/default-options))))]
        (is (=? {:error-code :max-tokens-exceeded} (ex-data e)))
        (is (not (:api-error (ex-data e))))
        (is (not (core/fatal-error? e)))))
    (testing "a missing key is fatal"
      (mt/with-temporary-setting-values [data-sensitivity-jev-api-key nil]
        (let [e (is (thrown? clojure.lang.ExceptionInfo (jev/classify-packet (packet fields))))]
          (is (= :api-key-missing (:error-code (ex-data e))))
          (is (core/fatal-error? e)))))))

(deftest classify-packet-empty-test
  (let [called? (atom false)
        result  (classify! [] (fn [& _] (reset! called? true)))]
    (is (false? @called?))
    (is (=? {:requests 0 :fields {}} result))))
