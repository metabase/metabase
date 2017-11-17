(ns metabase.pulse-test
  (:require [clojure.walk :as walk]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [card :refer [Card]]
             [pulse :refer [Pulse retrieve-pulse retrieve-pulse-or-alert]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.pulse :refer :all]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [users :as users]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- email-body? [{message-type :type content :content}]
  (and (= "text/html; charset=utf-8" message-type)
       (string? content)
       (.startsWith content "<html>")))

(defn- attachment? [{message-type :type content-type :content-type content :content}]
  (and (= :inline message-type)
       (= "image/png" content-type)
       (instance? java.io.File content)))

(defn checkins-query
  "Basic query that will return results for an alert"
  [query-map]
  {:name          "Test card"
   :dataset_query {:database (data/id)
                   :type     :query
                   :query    (merge {:source_table (data/id :checkins)
                                     :aggregation  [["count"]]}
                                    query-map)}})

(defn- rasta-id []
  (users/user->id :rasta))

(defn- realize-lazy-seqs
  "It's possible when data structures contain lazy sequences that the database will be torn down before the lazy seq
  is realized, causing the data returned to be nil. This function walks the datastructure, realizing all the lazy
  sequences it finds"
  [data]
  (walk/postwalk identity data))

(defmacro ^:private test-setup
  "Macro that ensures test-data is present and disables sending of notifications"
  [& body]
  `(data/with-db (data/get-or-create-database! defs/test-data)
     (tu/with-temporary-setting-values [~'site-url "https://metabase.com/testmb"]
       (with-redefs [metabase.pulse/send-notifications! realize-lazy-seqs
                     slack/channels-list                (constantly [{:name "metabase_files"
                                                                      :id   "FOO"}])]
         ~@body))))

;; Basic test, 1 card, 1 recipient
(tt/expect-with-temp [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Pulse                [{pulse-id :id} {:name "Pulse Name"
                                                            :skip_if_empty false}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id (rasta-id)
                                                            :pulse_channel_id pc-id}]]
  [true
   {:subject "Pulse: Pulse Name"
    :recipients [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true]
  (test-setup
   (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
     [(empty? no-more-results)
      (select-keys result [:subject :recipients :message-type])
      (count (:message result))
      (email-body? (first (:message result)))
      (attachment? (second (:message result)))])))

;; Pulse should be sent to two recipients
(tt/expect-with-temp [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Pulse                [{pulse-id :id} {:name "Pulse Name"
                                                            :skip_if_empty false}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id (rasta-id)
                                                            :pulse_channel_id pc-id}]
                      PulseChannelRecipient [_             {:user_id (users/user->id :crowberto)
                                                            :pulse_channel_id pc-id}]]
  [true
   {:subject "Pulse: Pulse Name"
    :recipients (set (map (comp :email users/fetch-user) [:rasta :crowberto]))
    :message-type :attachments}
   2
   true
   true]
  (test-setup
   (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
     [(empty? no-more-results)
      (-> result
          (select-keys [:subject :recipients :message-type])
          (update :recipients set))
      (count (:message result))
      (email-body? (first (:message result)))
      (attachment? (second (:message result)))])))

;; 1 pulse that has 2 cards, should contain two attachments
(tt/expect-with-temp [Card                 [{card-id-1 :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Card                 [{card-id-2 :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "day-of-week"]]})]
                      Pulse                [{pulse-id :id} {:name "Pulse Name"
                                                            :skip_if_empty false}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id-1
                                                            :position 0}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id-2
                                                            :position 1}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id (rasta-id)
                                                            :pulse_channel_id pc-id}]]
  [true
   {:subject "Pulse: Pulse Name"
    :recipients [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   3
   true
   true]
  (test-setup
   (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
     [(empty? no-more-results)
      (select-keys result [:subject :recipients :message-type])
      (count (:message result))
      (email-body? (first (:message result)))
      (attachment? (second (:message result)))])))

;; Pulse where the card has no results, but skip_if_empty is false, so should still send
(tt/expect-with-temp [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                             :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                      Pulse                 [{pulse-id :id} {:name          "Pulse Name"
                                                             :skip_if_empty false}]
                      PulseCard             [pulse-card     {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                             :pulse_channel_id pc-id}]]
  [true
   {:subject      "Pulse: Pulse Name"
    :recipients   [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true]
  (test-setup
   (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
     [(empty? no-more-results)
      (select-keys result [:subject :recipients :message-type])
      (count (:message result))
      (email-body? (first (:message result)))
      (attachment? (second (:message result)))])))

;; Pulse where the card has no results, skip_if_empty is true, so no pulse should be sent
(tt/expect-with-temp [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                             :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                      Pulse                 [{pulse-id :id} {:name          "Pulse Name"
                                                             :skip_if_empty true}]
                      PulseCard             [pulse-card     {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                             :pulse_channel_id pc-id}]]
  nil
  (test-setup
   (send-pulse! (retrieve-pulse pulse-id))))

;; Rows alert with no data
(tt/expect-with-temp [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                             :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                      Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                             :alert_first_only false}]
                      PulseCard             [pulse-card     {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                             :pulse_channel_id pc-id}]]
  nil
  (test-setup
   (send-pulse! (retrieve-pulse-or-alert pulse-id))))

(defn- rows-email-body?
  [{:keys [content] :as message}]
  (boolean (re-find #"has results for you" content)))

(defn- goal-above-email-body?
  [{:keys [content] :as message}]
  (boolean (re-find #"has reached" content)))

(defn- goal-below-email-body?
  [{:keys [content] :as message}]
  (boolean (re-find #"has gone below" content)))

(defn- first-run-email-body?
  [{:keys [content] :as message}]
  (boolean (re-find #"stop sending you alerts" content)))

;; Rows alert with data
(tt/expect-with-temp [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Pulse                [{pulse-id :id} {:alert_condition  "rows"
                                                            :alert_first_only false}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id (rasta-id)
                                                            :pulse_channel_id pc-id}]]
  [true
   {:subject "Metabase alert: Test card has results"
    :recipients [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true
   true]
  (test-setup
   (let [[result & no-more-results] (send-pulse! (retrieve-pulse-or-alert pulse-id))]
     [(empty? no-more-results)
      (select-keys result [:subject :recipients :message-type])
      (count (:message result))
      (email-body? (first (:message result)))
      (attachment? (second (:message result)))
      (rows-email-body? (first (:message result)))])))

;; Above goal alert with data
(tt/expect-with-temp [Card                 [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-04-01" "2014-06-01"]
                                                                                   :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                                  {:display :line
                                                                   :visualization_settings {:graph.show_goal true :graph.goal_value 5.9}})]
                      Pulse                [{pulse-id :id} {:alert_condition   "goal"
                                                            :alert_first_only  false
                                                            :alert_above_goal  true}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                            :pulse_channel_id pc-id}]]
  [true
   {:subject      "Metabase alert: Test card has reached its goal"
    :recipients   [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true
   true]
  (test-setup
   (let [[result & no-more-results] (send-pulse! (retrieve-pulse-or-alert pulse-id))]
     [(empty? no-more-results)
      (select-keys result [:subject :recipients :message-type])
      (count (:message result))
      (email-body? (first (:message result)))
      (attachment? (second (:message result)))
      (goal-above-email-body? (first (:message result)))])))

;; Above goal alert, with no data above goal
(tt/expect-with-temp [Card                 [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-02-01" "2014-04-01"]
                                                                                   :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                                  {:display :area
                                                                   :visualization_settings {:graph.show_goal true :graph.goal_value 5.9}})]
                      Pulse                [{pulse-id :id} {:alert_condition   "goal"
                                                            :alert_first_only  false
                                                            :alert_above_goal  true}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                            :pulse_channel_id pc-id}]]
  nil
  (test-setup
   (send-pulse! (retrieve-pulse-or-alert pulse-id))))

;; Below goal alert with no satisfying data
(tt/expect-with-temp [Card                 [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-02-10" "2014-02-12"]
                                                                                   :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                                  {:display :bar
                                                                   :visualization_settings {:graph.show_goal true :graph.goal_value 1.1}})]
                      Pulse                [{pulse-id :id} {:alert_condition   "goal"
                                                            :alert_first_only  false
                                                            :alert_above_goal  false}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                            :pulse_channel_id pc-id}]]
  nil
  (test-setup
   (send-pulse! (retrieve-pulse-or-alert pulse-id))))

;; Below goal alert with data
(tt/expect-with-temp [Card                 [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-02-12" "2014-02-17"]
                                                                                   :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                                  {:display                :line
                                                                   :visualization_settings {:graph.show_goal true :graph.goal_value 1.1}})]
                      Pulse                [{pulse-id :id} {:alert_condition   "goal"
                                                            :alert_first_only  false
                                                            :alert_above_goal  false}]
                      PulseCard             [_             {:pulse_id pulse-id
                                                            :card_id  card-id
                                                            :position 0}]
                      PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                      PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                            :pulse_channel_id pc-id}]]
  [true
   {:subject      "Metabase alert: Test card has gone below its goal"
    :recipients   [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true
   true]
  (test-setup
   (let [[result & no-more-results] (send-pulse! (retrieve-pulse-or-alert pulse-id))]
     [(empty? no-more-results)
      (select-keys result [:subject :recipients :message-type])
      (count (:message result))
      (email-body? (first (:message result)))
      (attachment? (second (:message result)))
      (goal-below-email-body? (first (:message result)))])))

(defn- thunk->boolean [{:keys [attachments] :as result}]
  (assoc result :attachments (for [attachment-info attachments]
                               (update attachment-info :attachment-bytes-thunk fn?))))

;; Basic slack test, 1 card, 1 recipient channel
(tt/expect-with-temp [Card         [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Pulse        [{pulse-id :id} {:name "Pulse Name"
                                                    :skip_if_empty false}]
                      PulseCard    [_              {:pulse_id pulse-id
                                                    :card_id  card-id
                                                    :position 0}]
                      PulseChannel [{pc-id :id}    {:pulse_id pulse-id
                                                    :channel_type "slack"
                                                    :details {:channel "#general"}}]]
  {:channel-id "#general",
   :message "Pulse: Pulse Name",
   :attachments
   [{:title "Test card",
     :attachment-bytes-thunk true
     :title_link (str "https://metabase.com/testmb/question/" card-id),
     :attachment-name "image.png",
     :channel-id "FOO",
     :fallback "Test card"}]}
  (test-setup
   (-> (send-pulse! (retrieve-pulse pulse-id))
       first
       thunk->boolean)))

(defn- produces-bytes? [{:keys [attachment-bytes-thunk]}]
  (< 0 (alength (attachment-bytes-thunk))))

;; Basic slack test, 2 cards, 1 recipient channel
(tt/expect-with-temp [Card         [{card-id-1 :id} (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Card         [{card-id-2 :id} (-> {:breakout [["datetime-field" (data/id :checkins :date) "minute"]]}
                                                        checkins-query
                                                        (assoc :name "Test card 2"))]
                      Pulse        [{pulse-id :id}  {:name "Pulse Name"
                                                              :skip_if_empty false}]
                      PulseCard    [_               {:pulse_id pulse-id
                                                              :card_id  card-id-1
                                                              :position 0}]
                      PulseCard    [_               {:pulse_id pulse-id
                                                              :card_id  card-id-2
                                                              :position 1}]
                      PulseChannel [{pc-id :id}     {:pulse_id pulse-id
                                                     :channel_type "slack"
                                                     :details {:channel "#general"}}]]
  [{:channel-id "#general",
    :message "Pulse: Pulse Name",
    :attachments
    [{:title "Test card",
      :attachment-bytes-thunk true
      :title_link (str "https://metabase.com/testmb/question/" card-id-1),
      :attachment-name "image.png",
      :channel-id "FOO",
      :fallback "Test card"}
     {:title "Test card 2",
      :attachment-bytes-thunk true
      :title_link (str "https://metabase.com/testmb/question/" card-id-2),
      :attachment-name "image.png",
      :channel-id "FOO",
      :fallback "Test card 2"}]}
   true]
  (test-setup
   (let [[slack-data] (send-pulse! (retrieve-pulse pulse-id))]
     [(thunk->boolean slack-data)
      (every? produces-bytes? (:attachments slack-data))])))

;; Test with a slack channel and an email
(tt/expect-with-temp [Card                  [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Pulse                 [{pulse-id :id} {:name "Pulse Name"
                                                             :skip_if_empty false}]
                      PulseCard             [_              {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id-1 :id}  {:pulse_id pulse-id
                                                             :channel_type "slack"
                                                             :details {:channel "#general"}}]
                      PulseChannel          [{pc-id-2 :id}  {:pulse_id pulse-id
                                                             :channel_type "email"
                                                             :details {}}]
                      PulseChannelRecipient [_              {:user_id (rasta-id)
                                                             :pulse_channel_id pc-id-2}]]
  [{:channel-id "#general",
     :message "Pulse: Pulse Name",
     :attachments [{:title "Test card", :attachment-bytes-thunk true
                    :title_link (str "https://metabase.com/testmb/question/" card-id),
                    :attachment-name "image.png", :channel-id "FOO",
                    :fallback "Test card"}]}
   true
   {:subject "Pulse: Pulse Name",
    :recipients ["rasta@metabase.com"],
    :message-type :attachments}
   2
   true
   true]
  (test-setup
   (let [pulse-data (send-pulse! (retrieve-pulse pulse-id))
         slack-data (m/find-first #(contains? % :channel-id) pulse-data)
         email-data (m/find-first #(contains? % :subject) pulse-data)]
     [(thunk->boolean slack-data)
      (every? produces-bytes? (:attachments slack-data))
      (select-keys email-data [:subject :recipients :message-type])
      (count (:message email-data))
      (email-body? (first (:message email-data)))
      (attachment? (second (:message email-data)))])))

;; Rows slack alert with data
(tt/expect-with-temp [Card         [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                      Pulse        [{pulse-id :id} {:alert_condition  "rows"
                                                    :alert_first_only false}]
                      PulseCard    [_             {:pulse_id pulse-id
                                                   :card_id  card-id
                                                   :position 0}]
                      PulseChannel [{pc-id :id}   {:pulse_id pulse-id
                                                   :channel_type "slack"
                                                   :details {:channel "#general"}}]]
  [{:channel-id "#general",
    :message "Alert: Test card",
    :attachments [{:title "Test card", :attachment-bytes-thunk true,
                   :title_link (str "https://metabase.com/testmb/question/" card-id)
                   :attachment-name "image.png", :channel-id "FOO",
                   :fallback "Test card"}]}
   true]
  (test-setup
   (let [[result] (send-pulse! (retrieve-pulse-or-alert pulse-id))]
     [(thunk->boolean result)
      (every? produces-bytes? (:attachments result))])))

(defn- venues-query [aggregation-op]
  {:name          "Test card"
   :dataset_query {:database (data/id)
                   :type     :query
                   :query    {:source_table (data/id :venues)
                              :aggregation  [[aggregation-op (data/id :venues :price)]]}}})

;; Above goal alert with a progress bar
(expect
  [true
   {:subject      "Metabase alert: Test card has reached its goal"
    :recipients   [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   1
   true]
  (test-setup
   (tt/with-temp* [Card                 [{card-id :id}  (merge (venues-query "max")
                                                               {:display                :progress
                                                                :visualization_settings {:progress.goal 3}})]
                   Pulse                [{pulse-id :id} {:alert_condition   "goal"
                                                         :alert_first_only  false
                                                         :alert_above_goal  true}]
                   PulseCard             [_             {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                   PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                   PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                         :pulse_channel_id pc-id}]]
     (let [[result & no-more-results] (send-pulse! (retrieve-pulse-or-alert pulse-id))]
       [(empty? no-more-results)
        (select-keys result [:subject :recipients :message-type])
        ;; The pulse code interprets progress graphs as just a scalar, so there are no attachments
        (count (:message result))
        (email-body? (first (:message result)))]))))

;; Below goal alert with progress bar
(expect
  [true
   {:subject      "Metabase alert: Test card has gone below its goal"
    :recipients   [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   1
   true
   false]
  (test-setup
   (tt/with-temp* [Card                 [{card-id :id}  (merge (venues-query "min")
                                                               {:display                :progress
                                                                :visualization_settings {:progress.goal 2}})]
                   Pulse                [{pulse-id :id} {:alert_condition   "goal"
                                                         :alert_first_only  false
                                                         :alert_above_goal  false}]
                   PulseCard             [_             {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                   PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                   PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                         :pulse_channel_id pc-id}]]
     (let [[result & no-more-results] (send-pulse! (retrieve-pulse-or-alert pulse-id))]
       [(empty? no-more-results)
        (select-keys result [:subject :recipients :message-type])
        (count (:message result))
        (email-body? (first (:message result)))
        (first-run-email-body? (first (:message result)))]))))


;; Rows alert, first run only with data
(expect
  [true
   {:subject "Metabase alert: Test card has results"
    :recipients [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true
   true
   false]
  (test-setup
   (tt/with-temp* [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                   Pulse                [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only true}]
                   PulseCard             [_             {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                   PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                   PulseChannelRecipient [_             {:user_id (rasta-id)
                                                         :pulse_channel_id pc-id}]]
     (let [[result & no-more-results] (send-pulse! (retrieve-pulse-or-alert pulse-id))]
       [(empty? no-more-results)
        (select-keys result [:subject :recipients :message-type])
        (count (:message result))
        (email-body? (first (:message result)))
        (first-run-email-body? (first (:message result)))
        (attachment? (second (:message result)))
        (db/exists? Pulse :id pulse-id)]))))

;; First run alert with no data
(tt/expect-with-temp [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                             :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                      Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                             :alert_first_only true}]
                      PulseCard             [pulse-card     {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                             :pulse_channel_id pc-id}]]
  [nil true]
  (test-setup
   [(send-pulse! (retrieve-pulse-or-alert pulse-id))
    (db/exists? Pulse :id pulse-id)]))
