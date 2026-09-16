(ns metabase.metabot.attachments-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.common :as api]
   [metabase.metabot.attachments :as attachments]
   [metabase.metabot.db :as metabot.db]
   [metabase.test :as mt]))

(def ^:private attachment
  {:card_id 12 :filename "birds.csv" :size 123 :media_type "text/csv"})

(deftest ^:parallel message-parts-test
  (let [message {:role :user :content "Count the birds" :attachments [attachment]}]
    (is (= [{:type "text" :text "Count the birds"}
            {:type "data-uploaded-file" :data attachment}]
           (attachments/message-parts message)))
    (is (= [attachment] (attachments/from-parts (attachments/message-parts message))))))

(deftest attachment-validation-test
  (mt/with-dynamic-fn-redefs [metabot.db/card (constantly {:id 12 :type :model :archived false})
                              api/read-check identity]
    (is (= [attachment] (attachments/validate! [attachment]))))
  (deftest unavailable-attachment-test
    (mt/with-dynamic-fn-redefs [metabot.db/card (constantly nil)]
      (is (thrown? clojure.lang.ExceptionInfo (attachments/validate! [attachment])))
      (is (re-find #"unavailable" (:content (attachments/llm-message
                                             {:role :user :content "" :attachments [attachment]})))))))

(deftest attachment-context-test
  (mt/with-dynamic-fn-redefs [metabot.db/card (constantly {:id 12 :type :model :name "Bird sightings"
                                                           :collection_id 3 :archived false})
                              api/read-check identity]
    (testing "the model reference accompanies the original question"
      (let [content (:content (attachments/llm-message
                               {:role :user :content "By month" :attachments [attachment]}))]
        (is (re-find #"By month" content))
        (is (re-find #"metabase://model/12" content))
        (is (re-find #"Bird sightings" content))))
    (testing "text-only messages are unchanged"
      (is (= {:role :user :content "Hello"}
             (attachments/llm-message {:role :user :content "Hello"}))))))
