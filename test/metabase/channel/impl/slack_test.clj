(ns metabase.channel.impl.slack-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.impl.slack :as channel.slack]
   [metabase.integrations.slack :as slack]))

(deftest create-and-upload-slack-attachments!-test
  (let [slack-uploader (fn [storage]
                         (fn [_bytes attachment-name]
                           (swap! storage conj attachment-name)
                           {:url (str "http://uploaded/" attachment-name)
                            :id (str "ID_" attachment-name)}))]
    (testing "Uploads files"
      (let [titles         (atom [])
            attachments    [{:title           "a"
                             :title_link      "a.com"
                             :attachment-name "a.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi"]}}
                            {:title           "b"
                             :title_link      "b.com"
                             :attachment-name "b.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi again"]}}]
            processed      (with-redefs [slack/upload-file! (slack-uploader titles)]
                             (#'channel.slack/create-and-upload-slack-attachments! attachments))]
        (is (= [{:blocks [{:type "section"
                           :text {:type "mrkdwn", :text "<a.com|a>"}}
                          {:type "image"
                           :alt_text "a",
                           :slack_file {:id "ID_a.png"}}]}
                {:blocks [{:type "section" :text {:type "mrkdwn", :text "<b.com|b>"}}
                          {:type "image"
                           :alt_text "b",
                           :slack_file {:id "ID_b.png"}}]}]
               processed))
        (is (= ["a.png" "b.png"]
               @titles))))
    (testing "Uses the raw text when present"
      (let [titles         (atom [])
            attachments    [{:title           "a"
                             :title_link      "a.com"
                             :attachment-name "a.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi"]}}
                            {:title           "b"
                             :title_link      "b.com"
                             :attachment-name "b.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi again"]
                                               :render/text "hi again"}}]
            processed      (with-redefs [slack/upload-file! (slack-uploader titles)]
                             (#'channel.slack/create-and-upload-slack-attachments! attachments))]
        (is (= [{:blocks [{:type "section"
                           :text {:text "<a.com|a>", :type "mrkdwn"}}
                          {:type "image"
                           :alt_text "a",
                           :slack_file {:id "ID_a.png"}}]}
                {:blocks [{:type "section"
                           :text {:text "<b.com|b>", :type "mrkdwn"}}
                          {:type "section"
                           :text {:type "plain_text", :text "hi again"}}]}]
               processed))
        (is (= ["a.png"]
               @titles))))))
