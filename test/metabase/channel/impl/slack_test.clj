(ns metabase.channel.impl.slack-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.impl.slack :as channel.slack]
   [metabase.integrations.slack :as slack]))

(deftest create-and-upload-slack-attachments!-test
  (let [slack-uploader (fn [storage]
                         (fn [_bytes attachment-name _channel-id]
                           (swap! storage conj attachment-name)
                           (str "http://uploaded/" attachment-name)))]
    (testing "Uploads files"
      (let [titles         (atom [])
            attachments    [{:title           "a"
                             :attachment-name "a.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi"]}
                             :channel-id      "FOO"}
                            {:title           "b"
                             :attachment-name "b.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi again"]}
                             :channel-id      "FOO"}]
            processed      (with-redefs [slack/upload-file! (slack-uploader titles)]
                             (#'channel.slack/create-and-upload-slack-attachments! attachments))]
        (is (= [{:title "a", :image_url "http://uploaded/a.png"}
                {:title "b", :image_url "http://uploaded/b.png"}]
               processed))
        (is (= @titles ["a.png" "b.png"]))))
    (testing "Uses the raw text when present"
      (let [titles         (atom [])
            attachments    [{:title           "a"
                             :attachment-name "a.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi"]}
                             :channel-id      "FOO"}
                            {:title           "b"
                             :attachment-name "b.png"
                             :rendered-info   {:attachments nil
                                               :content     [:div "hi again"]
                                               :render/text "hi again"}
                             :channel-id      "FOO"}]
            processed      (with-redefs [slack/upload-file! (slack-uploader titles)]
                             (#'channel.slack/create-and-upload-slack-attachments! attachments))]
        (is (= [{:title "a", :image_url "http://uploaded/a.png"}
                {:title "b", :text "hi again"}]
               processed))
        (is (= @titles ["a.png"]))))))
