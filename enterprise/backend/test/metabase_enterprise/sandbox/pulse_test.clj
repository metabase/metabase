(ns metabase-enterprise.sandbox.pulse-test
  (:require [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase-enterprise.sandbox.test-util :as mt.tu]
            [metabase.email.messages :as messages]
            [metabase.models :refer [Card Pulse PulseCard PulseChannel PulseChannelRecipient]]
            [metabase.models.pulse :as models.pulse]
            [metabase.pulse :as pulse]
            [metabase.pulse.test-util :as pulse.tu]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest sandboxed-pulse-test
  (testing "Pulses should get sent with the row-level restrictions of the User that created them."
    (letfn [(send-pulse-created-by-user! [user-kw]
              (mt/with-gtaps {:gtaps      {:venues {:query      (mt/mbql-query venues)
                                                    :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                              :attributes {"cat" 50}}
                (mt/with-temp Card [card {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
                  ;; `with-gtaps` binds the current test user; we don't want that falsely affecting results
                  (mt/with-test-user nil
                    (pulse.tu/send-pulse-created-by-user! user-kw card)))))]
      (is (= [[100]]
             (send-pulse-created-by-user! :crowberto)))
      (is (= [[10]]
             (send-pulse-created-by-user! :rasta))))))

(defn- pulse-results
  "Results for creating and running a Pulse."
  [query]
  (mt/with-temp* [Card                  [pulse-card {:dataset_query query}]
                  Pulse                 [pulse {:name "Test Pulse"}]
                  PulseCard             [_ {:pulse_id (:id pulse), :card_id (:id pulse-card)}]
                  PulseChannel          [pc {:channel_type :email
                                             :pulse_id     (:id pulse)
                                             :enabled      true}]
                  PulseChannelRecipient [_ {:pulse_channel_id (:id pc)
                                            :user_id          (mt/user->id :rasta)}]]
    (mt/with-temporary-setting-values [email-from-address "metamailman@metabase.com"]
      (mt/with-fake-inbox
        (with-redefs [messages/render-pulse-email (fn [_ _ [{:keys [result]}]]
                                                    [{:result result}])]
          (mt/with-test-user nil
            (pulse/send-pulse! pulse)))
        (let [results @mt/inbox]
          (is (= {"rasta@metabase.com" [{:from    "metamailman@metabase.com"
                                         :to      ["rasta@metabase.com"]
                                         :subject "Pulse: Test Pulse"}]}
                 (m/dissoc-in results ["rasta@metabase.com" 0 :body])))
          (get-in results ["rasta@metabase.com" 0 :body 0 :result]))))))

(deftest e2e-sandboxed-pulse-test
  (testing "Sending Pulses w/ sandboxing, end-to-end"
    (mt/with-gtaps {:gtaps {:venues {:query (mt/mbql-query venues
                                                           {:filter [:= $price 3]})}}}
      (let [query (mt/mbql-query venues
                                 {:aggregation [[:count]]
                                  :breakout    [$price]})]
        (is (= [[3 13]]
               (mt/formatted-rows [int int]
                                  (mt/with-test-user :rasta
                                    (qp/process-query query))))
            "Basic sanity check: make sure the query is properly set up to apply GTAPs")
        (testing "GTAPs should apply to Pulses — they should get the same results as if running that query normally"
          (is (= [[3 13]]
                 (mt/rows
                  (pulse-results query)))))))))

(defn- html->row-count [html]
  (or (some->> html (re-find #"of <strong.+>(\d+)</strong> rows") second Integer/parseUnsignedInt)
      html))

(defn- csv->row-count [attachment-url]
  (when attachment-url
    (with-open [reader (io/reader attachment-url)]
      (count (csv/read-csv reader)))))

(deftest user-attributes-test
  (testing "Pulses should be sandboxed correctly by User login_attributes"
    (mt/with-gtaps {:gtaps      {:venues {:remappings {:price [:dimension [:field (mt/id :venues :price) nil]]}}}
                    :attributes {"price" "1"}}
      (let [query (mt/mbql-query venues)]
        (mt/with-test-user :rasta
          (mt/with-temp Card [card {:dataset_query query}]
            (testing "Sanity check: make sure user is seeing sandboxed results outside of Pulses"
              (testing "ad-hoc query"
                (is (= 22
                       (count (mt/rows (qp/process-query query))))))

              (testing "in a Saved Question"
                (is (= 22
                       (count (mt/rows (mt/user-http-request :rasta :post 202 (format "card/%d/query" (u/the-id card)))))))))

            (testing "Pulse should be sandboxed"
              (is (= 22
                     (count (mt/rows (pulse-results query))))))))))))

(deftest pulse-preview-test
  (testing "Pulse preview endpoints should be sandboxed"
    (mt/with-gtaps {:gtaps      {:venues {:remappings {:price [:dimension [:field (mt/id :venues :price) nil]]}}}
                    :attributes {"price" "1"}}
      (let [query (mt/mbql-query venues)]
        (mt/with-test-user :rasta
          (mt/with-temp Card [card {:dataset_query query}]
            (testing "GET /api/pulse/preview_card/:id"
              (is (= 22
                     (html->row-count (mt/user-http-request :rasta :get 200 (format "pulse/preview_card/%d" (u/the-id card)))))))
            (testing "POST /api/pulse/test"
              (mt/with-fake-inbox
                (mt/user-http-request :rasta :post 200 "pulse/test" {:name     "venues"
                                                                     :cards    [{:id          (u/the-id card)
                                                                                 :include_csv true
                                                                                 :include_xls false}]
                                                                     :channels [{:channel_type :email
                                                                                 :enabled      :true
                                                                                 :recipients   [{:id    (mt/user->id :rasta)
                                                                                                 :email "rasta@metabase.com"}]}]})
                (let [[{html :content} {attachment :content}] (get-in @mt/inbox ["rasta@metabase.com" 0 :body])]
                  (testing "email"
                    (is (= 22
                           (html->row-count html))))
                  (testing "CSV attachment"
                    ;; one extra row because first row is column names
                    (is (= 23
                           (csv->row-count attachment)))))))))))))

(deftest csv-downloads-test
  (testing "CSV/XLSX downloads should be sandboxed"
    (mt/with-gtaps {:gtaps      {:venues {:remappings {:price [:dimension [:field (mt/id :venues :price) nil]]}}}
                    :attributes {"price" "1"}}
      (let [query (mt/mbql-query venues)]
        (mt/with-test-user :rasta
          (mt/with-temp* [Card                 [{card-id :id}  {:dataset_query query}]
                          Pulse                [{pulse-id :id} {:name          "Pulse Name"
                                                                :skip_if_empty false}]
                          PulseCard             [_             {:pulse_id pulse-id
                                                                :card_id  card-id
                                                                :position 0}]
                          PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                          PulseChannelRecipient [_             {:user_id          (mt/user->id :rasta)
                                                                :pulse_channel_id pc-id}]]
            (mt/with-fake-inbox
              (mt/with-test-user nil
                (pulse/send-pulse! (models.pulse/retrieve-pulse pulse-id)))
              (let [email-results                           @mt/inbox
                    [{html :content} {attachment :content}] (get-in email-results ["rasta@metabase.com" 0 :body])]
                (testing "email"
                  (is (= 22
                         (html->row-count html))))
                (testing "CSV attachment"
                  (is (= 23
                         (csv->row-count attachment))))))))))))
