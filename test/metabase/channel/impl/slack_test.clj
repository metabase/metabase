(ns metabase.channel.impl.slack-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.slack :as channel.slack]
   [metabase.integrations.slack :as slack]))

(set! *warn-on-reflection* true)

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
                             (mapv #'channel.slack/create-and-upload-slack-attachment! attachments))]
        (is (= [{:blocks [{:type "section"
                           :text {:type "mrkdwn", :text "<a.com|a>", :verbatim true}}
                          {:type "image"
                           :alt_text "a",
                           :slack_file {:id "ID_a.png"}}]}
                {:blocks [{:type "section" :text {:type "mrkdwn", :text "<b.com|b>", :verbatim true}}
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
                             (mapv #'channel.slack/create-and-upload-slack-attachment! attachments))]
        (is (= [{:blocks [{:type "section"
                           :text {:text "<a.com|a>", :type "mrkdwn", :verbatim true}}
                          {:type "image"
                           :alt_text "a",
                           :slack_file {:id "ID_a.png"}}]}
                {:blocks [{:type "section"
                           :text {:text "<b.com|b>", :type "mrkdwn", :verbatim true}}
                          {:type "section"
                           :text {:type "plain_text", :text "hi again"}}]}]
               processed))
        (is (= ["a.png"]
               @titles))))))

(deftest slack-post-receives-at-most-50-blocks-test
  (let [block-inputs (atom [])]
    (with-redefs [slack/post-chat-message! (fn [_ _ message-content] (swap! block-inputs conj (mapcat :blocks message-content)))]
      (channel/send!
       {:type :channel/slack}
       {:channel-id "#not-a-channel"
        :attachments [{:blocks (repeat 423 [{:type "section", :text {:type "plain_text", :text ""}}])}]})
      (is (== (Math/ceil (/ 423 50)) (count @block-inputs)))
      (is (every? #(<= 1 (count %) 50) @block-inputs))
      (is (= 423 (reduce + (map count @block-inputs)))))))

(deftest mkdwn-link-escaping-test
  (let [mock-upload-file!
        (fn [_bytes attachment-name]
          {:url (str "http://uploaded/" attachment-name)
           :id (str "ID_" attachment-name)})
        attachments [{:title           "&amp;a"
                      :title_link      "a.com"
                      :attachment-name "a.png"
                      :rendered-info   {:attachments nil
                                        :content     [:div "hi"]}}
                     {:title           "> click <https://c.com|here>"
                      :title_link      "b.com"
                      :attachment-name "b.png"
                      :rendered-info   {:attachments nil
                                        :content     [:div "hi again"]
                                        :render/text "hi again"}}]
        processed   (with-redefs [slack/upload-file! mock-upload-file!]
                      (mapv #'channel.slack/create-and-upload-slack-attachment! attachments))]
    (is (= [{:blocks [{:type "section"
                       :text {:type "mrkdwn", :text "<a.com|&amp;amp;a>", :verbatim true}}
                      {:type "image"
                       :alt_text "&amp;a",
                       :slack_file {:id "ID_a.png"}}]}
            {:blocks [{:type "section"
                       :text {:text "<b.com|&gt; click &lt;https://c.com|here&gt;>", :type "mrkdwn", :verbatim true}}
                      {:type "section"
                       :text {:type "plain_text", :text "hi again"}}]}]
           processed))))
