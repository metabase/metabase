(ns metabase.pulse-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [pulse :refer [Pulse retrieve-pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.pulse :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data
             [dataset-definitions :as defs]
             [users :as users]]
            [toucan.util.test :as tt]))

(defn- email-body? [{message-type :type content :content}]
  (and (= "text/html; charset=utf-8" message-type)
       (string? content)
       (.startsWith content "<html>")))

(defn- attachment? [{message-type :type content-type :content-type content :content}]
  (and (= :inline message-type)
       (= "image/png" content-type)
       (instance? java.io.File content)))

(defn- checkins-query [query-map]
  {:dataset_query {:database (data/id)
                   :type     :query
                   :query (merge {:source_table (data/id :checkins)
                                  :aggregation [["count"]]}
                                 query-map)}})

(defn- rasta-id []
  (users/user->id :rasta))

(defmacro ^:private test-setup
  "Macro that ensures test-data is present and disables sending of notifications"
  [& body]
  `(data/with-db (data/get-or-create-database! defs/test-data)
     (with-redefs [metabase.pulse/send-notifications! identity]
       ~@body)))

;; Basic test, 1 card, 1 receipient
(expect
  [true
   {:subject "Pulse: Pulse Name"
    :recipients [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true]
  (test-setup
   (tt/with-temp* [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                   Pulse                [{pulse-id :id} {:name "Pulse Name"
                                                         :skip_if_empty false}]
                   PulseCard             [_             {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                   PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                   PulseChannelRecipient [_             {:user_id (rasta-id)
                                                         :pulse_channel_id pc-id}]]
     (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
       [(empty? no-more-results)
        (select-keys result [:subject :recipients :message-type])
        (count (:message result))
        (email-body? (first (:message result)))
        (attachment? (second (:message result)))]))))

;; Pulse should be sent to two receipients
(expect
  [true
   {:subject "Pulse: Pulse Name"
    :recipients (set (map (comp :email users/fetch-user) [:rasta :crowberto]))
    :message-type :attachments}
   2
   true
   true]
  (test-setup
   (tt/with-temp* [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
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
     (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
       [(empty? no-more-results)
        (-> result
            (select-keys [:subject :recipients :message-type])
            (update :recipients set))
        (count (:message result))
        (email-body? (first (:message result)))
        (attachment? (second (:message result)))]))))

;; 1 pulse that has 2 cards, should contain two attachments
(expect
  [true
   {:subject "Pulse: Pulse Name"
    :recipients [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   3
   true
   true]
  (test-setup
   (tt/with-temp* [Card                 [{card-id-1 :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
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
     (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
       [(empty? no-more-results)
        (select-keys result [:subject :recipients :message-type])
        (count (:message result))
        (email-body? (first (:message result)))
        (attachment? (second (:message result)))]))))

;; Pulse where the card has no results, but skip_if_empty is false, so should still send
(expect
  [true
   {:subject      "Pulse: Pulse Name"
    :recipients   [(:email (users/fetch-user :rasta))]
    :message-type :attachments}
   2
   true
   true]
  (test-setup
   (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                          :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                   Pulse                 [{pulse-id :id} {:name          "Pulse Name"
                                                          :skip_if_empty false}]
                   PulseCard             [pulse-card     {:pulse_id pulse-id
                                                          :card_id  card-id
                                                          :position 0}]
                   PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                   PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                          :pulse_channel_id pc-id}]]
     (let [[result & no-more-results] (send-pulse! (retrieve-pulse pulse-id))]
       [(empty? no-more-results)
        (select-keys result [:subject :recipients :message-type])
        (count (:message result))
        (email-body? (first (:message result)))
        (attachment? (second (:message result)))]))))

;; Pulse where the card has no results, skip_if_empty is true, so no pulse should be sent
(expect
  nil
  (test-setup
   (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                          :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                   Pulse                 [{pulse-id :id} {:name          "Pulse Name"
                                                          :skip_if_empty true}]
                   PulseCard             [pulse-card     {:pulse_id pulse-id
                                                          :card_id  card-id
                                                          :position 0}]
                   PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                   PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                          :pulse_channel_id pc-id}]]
     (send-pulse! (retrieve-pulse pulse-id)))))
