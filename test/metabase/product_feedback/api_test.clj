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
        (is (= {:errors          {:source "value must be a non-blank string."},
                :specific-errors {:source ["missing required key, received: nil"]}}
               response))))))

(deftest product-feedback-test-2
  (testing "fires the proxy in background"
    (let [sent? (promise)]
      (with-redefs [product-feedback.api/send-feedback! (fn [comments source email]
                                                          (doseq [prop [comments source email]]
                                                            (is (not (str/blank? prop)) "got a blank property to send-feedback!"))
                                                          (deliver sent? true))]
        (mt/user-http-request :crowberto :post 204 "product-feedback/"
                              {:comments "I like Metabase"
                               :email    "happy_user@test.com"
                               :source   "Analytics Inc"})
        (is (true? (deref sent? 2000 ::timedout)))))))
