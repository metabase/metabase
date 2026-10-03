(ns metabase.product-feedback.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.product-feedback.api :as product-feedback.api]
   [metabase.test :as mt]))

(deftest ^:parallel product-feedback-test
  (testing "requires non-blank source"
    (let [payload  {:comments "foo"
                    :email    "foo"}
          response (mt/user-http-request :crowberto :post 400 "product-feedback/" payload)]
      (testing (str "without " :source)
        (is (= {:errors          {:source "value must be a non-blank string with at most 500 characters."},
                :specific-errors {:source ["missing required key, received: nil"]}}
               response))))))

(deftest product-feedback-test-2
  (testing "fires the proxy in background"
    (let [sent? (promise)]
      (mt/with-dynamic-fn-redefs [product-feedback.api/send-feedback! (fn [comments source email]
                                                                        (doseq [prop [comments source email]]
                                                                          (is (not (str/blank? prop)) "got a blank property to send-feedback!"))
                                                                        (deliver sent? true))]
        (mt/user-http-request :crowberto :post 204 "product-feedback/"
                              {:comments "I like Metabase"
                               :email    "happy_user@test.com"
                               :source   "Analytics Inc"})
        (is (true? (deref sent? 2000 ::timedout)))))))

(deftest ^:parallel product-feedback-payload-length-test
  (testing "limits the length of the content passed to the endpoint"
    (doseq [[field max-length errors-message]
            [[:comments 300000 "nullable value must be a non-blank string with at most 300000 characters."]
             [:source   500    "value must be a non-blank string with at most 500 characters."]
             [:email    320    "nullable value must be a non-blank string with at most 320 characters."]]]
      (testing (format "%s longer than %d characters is rejected" (name field) max-length)
        (let [oversized (str/join (repeat (inc max-length) "x"))
              payload   {:comments "I like Metabase"
                         :source   "embedding-homepage-dismiss"
                         :email    "happy_user@test.com"}
              payload   (assoc payload field oversized)
              response  (mt/user-http-request :crowberto :post 400 "product-feedback/" payload)]
          (is (= {:errors          {field errors-message}
                  :specific-errors {field [(str "should be at most " max-length
                                                " characters, received: " (pr-str oversized))]}}
                 response)))))))
