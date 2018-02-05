(ns metabase.pulse-test
  (:require [clojure.walk :as walk]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase.integrations.slack :as slack]
            [metabase
             [email-test :as et]
             [pulse :refer :all]]
            [metabase.models
             [card :refer [Card]]
             [pulse :refer [Pulse retrieve-pulse retrieve-pulse-or-alert]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [users :as users]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

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

(defn- pulse-test-fixture
  [f]
  (data/with-db (data/get-or-create-database! defs/test-data)
    (tu/with-temporary-setting-values [site-url "https://metabase.com/testmb"]
      (f))))

(defmacro ^:private slack-test-setup
  "Macro that ensures test-data is present and disables sending of all notifications"
  [& body]
  `(with-redefs [metabase.pulse/send-notifications! realize-lazy-seqs
                 slack/channels-list                (constantly [{:name "metabase_files"
                                                                  :id   "FOO"}])]
     (pulse-test-fixture (fn [] ~@body))))

(defmacro ^:private email-test-setup
  "Macro that ensures test-data is present and will use a fake inbox for emails"
  [& body]
  `(et/with-fake-inbox
     (pulse-test-fixture (fn [] ~@body))))

(def ^:private png-attachment
  {:type :inline,
   :content-id true,
   :content-type "image/png",
   :content java.net.URL})

(defn- rasta-pulse-email [& [email]]
  (et/email-to :rasta (merge {:subject "Pulse: Pulse Name",
                              :body  [{"Pulse Name" true}
                                      png-attachment]}
                             email)))

;; Basic test, 1 card, 1 recipient
(expect
  (rasta-pulse-email)
  (tt/with-temp* [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                [{pulse-id :id} {:name "Pulse Name"
                                                        :skip_if_empty false}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     (et/summarize-multipart-email #"Pulse Name"))))

;; Pulse should be sent to two recipients
(expect
  (into {} (map (fn [user-kwd]
                  (et/email-to user-kwd {:subject "Pulse: Pulse Name",
                                         :to #{"rasta@metabase.com" "crowberto@metabase.com"}
                                         :body [{"Pulse Name" true}
                                                png-attachment]}))
                [:rasta :crowberto]))
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
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     (et/summarize-multipart-email #"Pulse Name"))))

;; 1 pulse that has 2 cards, should contain two attachments
(expect
  (rasta-pulse-email {:body [{"Pulse Name" true}
                             png-attachment
                             png-attachment]})
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
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     (et/summarize-multipart-email #"Pulse Name"))))

;; Pulse where the card has no results, but skip_if_empty is false, so should still send
(expect
  (rasta-pulse-email)
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
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     (et/summarize-multipart-email #"Pulse Name"))))

;; Pulse where the card has no results, skip_if_empty is true, so no pulse should be sent
(expect
  {}
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
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     @et/inbox)))

;; Rows alert with no data
(expect
  {}
  (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                         :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                  Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only false}]
                  PulseCard             [pulse-card     {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                  PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                  PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                         :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     @et/inbox)))

(defn- rasta-alert-email
  [subject email-body]
  (et/email-to :rasta {:subject subject
                       :body email-body}))

;; Rows alert with data
(expect
  (rasta-alert-email "Metabase alert: Test card has results"
                     [{"Test card.*has results for you to see" true}, png-attachment])
  (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only false}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has results for you to see"))))

;; Above goal alert with data
(expect
  (rasta-alert-email "Metabase alert: Test card has reached its goal"
                     [{"Test card.*has reached its goal" true}, png-attachment])
  (tt/with-temp* [Card                  [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-04-01" "2014-06-01"]
                                                                                :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                               {:display :line
                                                                :visualization_settings {:graph.show_goal true :graph.goal_value 5.9}})]
                  Pulse                 [{pulse-id :id} {:alert_condition   "goal"
                                                         :alert_first_only  false
                                                         :alert_above_goal  true}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has reached its goal"))))

;; Native query with user-specified x and y axis
(expect
  (rasta-alert-email "Metabase alert: Test card has reached its goal"
                     [{"Test card.*has reached its goal" true}, png-attachment])
  (tt/with-temp* [Card                  [{card-id :id}  {:name          "Test card"
                                                         :dataset_query {:database (data/id)
                                                                         :type     :native
                                                                         :native   {:query (str "select count(*) as total_per_day, date as the_day "
                                                                                                "from checkins "
                                                                                                "group by date")}}
                                                         :display :line
                                                         :visualization_settings {:graph.show_goal true
                                                                                  :graph.goal_value 5.9
                                                                                  :graph.dimensions ["the_day"]
                                                                                  :graph.metrics ["total_per_day"]}}]
                  Pulse                 [{pulse-id :id} {:alert_condition  "goal"
                                                         :alert_first_only false
                                                         :alert_above_goal true}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has reached its goal"))))

;; Above goal alert, with no data above goal
(expect
  {}
  (tt/with-temp* [Card                  [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-02-01" "2014-04-01"]
                                                                                :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                               {:display :area
                                                                :visualization_settings {:graph.show_goal true :graph.goal_value 5.9}})]
                  Pulse                 [{pulse-id :id} {:alert_condition   "goal"
                                                         :alert_first_only  false
                                                         :alert_above_goal  true}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     @et/inbox)))

;; Below goal alert with no satisfying data
(expect
  {}
  (tt/with-temp* [Card                  [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-02-10" "2014-02-12"]
                                                                                :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                               {:display :bar
                                                                :visualization_settings {:graph.show_goal true :graph.goal_value 1.1}})]
                  Pulse                 [{pulse-id :id} {:alert_condition   "goal"
                                                         :alert_first_only  false
                                                         :alert_above_goal  false}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     @et/inbox)))

;; Below goal alert with data
(expect
  (rasta-alert-email "Metabase alert: Test card has gone below its goal"
                     [{"Test card.*has gone below its goal of 1.1" true}, png-attachment])
  (tt/with-temp* [Card                  [{card-id :id}  (merge (checkins-query {:filter   ["between",["field-id" (data/id :checkins :date)],"2014-02-12" "2014-02-17"]
                                                                                :breakout [["datetime-field" (data/id :checkins :date) "day"]]})
                                                               {:display                :line
                                                                :visualization_settings {:graph.show_goal true :graph.goal_value 1.1}})]
                  Pulse                 [{pulse-id :id} {:alert_condition   "goal"
                                                         :alert_first_only  false
                                                         :alert_above_goal  false}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]

    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has gone below its goal of 1.1"))))

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
  (slack-test-setup
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
  (slack-test-setup
   (let [[slack-data] (send-pulse! (retrieve-pulse pulse-id))]
     [(thunk->boolean slack-data)
      (every? produces-bytes? (:attachments slack-data))])))

(defn- email-body? [{message-type :type content :content}]
  (and (= "text/html; charset=utf-8" message-type)
       (string? content)
       (.startsWith content "<html>")))

(defn- attachment? [{message-type :type content-type :content-type content :content}]
  (and (= :inline message-type)
       (= "image/png" content-type)
       (instance? java.net.URL content)))

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
  (slack-test-setup
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
  (slack-test-setup
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
  (rasta-alert-email "Metabase alert: Test card has reached its goal"
                     [{"Test card.*has reached its goal of 3" true}])
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
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has reached its goal of 3"))))

;; Below goal alert with progress bar
(expect
  (rasta-alert-email "Metabase alert: Test card has gone below its goal"
                     [{"Test card.*has gone below its goal of 2" true}])
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
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has gone below its goal of 2"))))

;; Rows alert, first run only with data
(expect
  (rasta-alert-email "Metabase alert: Test card has results"
                     [{"Test card.*has results for you to see" true
                       "stop sending you alerts"               true}
                      png-attachment])
  (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only true}]
                  PulseCard             [_             {:pulse_id pulse-id
                                                        :card_id  card-id
                                                        :position 0}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has results for you to see"
                                   #"stop sending you alerts"))))

;; First run alert with no data
(expect
  [{} true]
  (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                         :breakout [["datetime-field" ["field-id" (data/id :checkins :date)] "hour"]]})]
                  Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only true}]
                  PulseCard             [pulse-card     {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                  PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                  PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                         :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     [@et/inbox
      (db/exists? Pulse :id pulse-id)])))

(def ^:private csv-attachment
  {:type :attachment, :content-type "text/csv", :file-name "Test card.csv",
   :content java.net.URL, :description "Full results for 'Test card'", :content-id false})

(def ^:private xls-attachment
  {:type :attachment, :file-name "Test card.xlsx",
   :content-type "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
   :content java.net.URL, :description "Full results for 'Test card'", :content-id false})

(defn- add-rasta-attachment
  "Append `ATTACHMENT` to the first email found for Rasta"
  [email attachment]
  (update-in email ["rasta@metabase.com" 0] #(update % :body conj attachment)))

;; Basic test, 1 card, 1 recipient, with CSV attachment
(expect
  (add-rasta-attachment (rasta-pulse-email) csv-attachment)

  (tt/with-temp* [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                [{pulse-id :id} {:name          "Pulse Name"
                                                        :skip_if_empty false}]
                  PulseCard             [_             {:pulse_id    pulse-id
                                                        :card_id     card-id
                                                        :position    0
                                                        :include_csv true}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     (et/summarize-multipart-email #"Pulse Name"))))

;; Basic alert test, 1 card, 1 recipient, with CSV attachment
(expect
  (rasta-alert-email "Metabase alert: Test card has results"
                     [{"Test card.*has results for you to see" true}, png-attachment, csv-attachment])
  (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only false}]
                  PulseCard             [_              {:pulse_id    pulse-id
                                                         :card_id     card-id
                                                         :position    0
                                                         :include_csv true}]
                  PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                  PulseChannelRecipient [_              {:user_id          (rasta-id)
                                                         :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has results for you to see"))))

;; Basic test of card with CSV and XLS attachments, but no data. Should not include an attachment
(expect
  (rasta-pulse-email)

  (tt/with-temp* [Card                 [{card-id :id}  (checkins-query {:filter   [">",["field-id" (data/id :checkins :date)],"2017-10-24"]
                                                                        :breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                [{pulse-id :id} {:name          "Pulse Name"
                                                        :skip_if_empty false}]
                  PulseCard             [_             {:pulse_id    pulse-id
                                                        :card_id     card-id
                                                        :position    0
                                                        :include_csv true
                                                        :include_xls true}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     (et/summarize-multipart-email #"Pulse Name"))))

;; Basic test, 1 card, 1 recipient, with XLS attachment
(expect
  (add-rasta-attachment (rasta-pulse-email) xls-attachment)

  (tt/with-temp* [Card                 [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                [{pulse-id :id} {:name          "Pulse Name"
                                                        :skip_if_empty false}]
                  PulseCard             [_             {:pulse_id    pulse-id
                                                        :card_id     card-id
                                                        :position    0
                                                        :include_xls true}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse pulse-id))
     (et/summarize-multipart-email #"Pulse Name"))))

;; Rows alert with data and a CSV + XLS attachment
(expect
  (rasta-alert-email "Metabase alert: Test card has results"
                     [{"Test card.*has results for you to see" true}, png-attachment, csv-attachment, xls-attachment])
  (tt/with-temp* [Card                  [{card-id :id}  (checkins-query {:breakout [["datetime-field" (data/id :checkins :date) "hour"]]})]
                  Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only false}]
                  PulseCard             [_             {:pulse_id    pulse-id
                                                        :card_id     card-id
                                                        :position    0
                                                        :include_csv true
                                                        :include_xls true}]
                  PulseChannel          [{pc-id :id}   {:pulse_id pulse-id}]
                  PulseChannelRecipient [_             {:user_id          (rasta-id)
                                                        :pulse_channel_id pc-id}]]
    (email-test-setup
     (send-pulse! (retrieve-pulse-or-alert pulse-id))
     (et/summarize-multipart-email #"Test card.*has results for you to see"))))
