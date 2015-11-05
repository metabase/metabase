(ns metabase.api.pulse-test
  "Tests for /api/pulse endpoints."
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            (metabase [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [card :refer [Card]]
                             [common :as common]
                             [database :refer [Database]]
                             [pulse :refer [Pulse create-pulse] :as pulse])
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name with-temp]]
            [metabase.test.data.users :refer :all]
            [metabase.test.data :refer :all]
            [metabase.util :as u]))

;; ## Helper Fns

(defn- new-card []
  (db/ins Card
    :name                   (random-name)
    :creator_id             (user->id :crowberto)
    :public_perms           common/perms-readwrite
    :display                "table"
    :dataset_query          {}
    :visualization_settings {}))

(defn new-pulse []
  (let [cards    [(new-card), (new-card)]
        card-ids (filter identity (map :id cards))]
    (pulse/create-pulse (random-name) (user->id :crowberto) card-ids [])))

;; ## GET /api/emailreport/form_input
;; Test that we can get the form input options for the Test Org
;(expect-let [_ @test-db ; force lazy loading of Test Data / Metabase DB
;             _ (cascade-delete Database :name [not= "Test Database"])] ; Delete all Databases that aren't the Test DB
;  {:users #{{:id (user->id :rasta),     :name "Rasta Toucan"}
;            {:id (user->id :crowberto), :name "Crowberto Corv"}
;            {:id (user->id :lucky),     :name "Lucky Pigeon"}
;            {:id (user->id :trashbird), :name "Trash Bird"}}
;   :databases [{:id (:id @test-db)
;                :name "Test Database"}],
;   :timezones ["GMT"
;               "UTC"
;               "US/Alaska"
;               "US/Arizona"
;               "US/Central"
;               "US/Eastern"
;               "US/Hawaii"
;               "US/Mountain"
;               "US/Pacific"
;               "America/Costa_Rica"]
;   :times_of_day [{:id "morning",   :realhour 8,  :name "Morning"}
;                  {:id "midday",    :realhour 12, :name "Midday"}
;                  {:id "afternoon", :realhour 16, :name "Afternoon"}
;                  {:id "evening",   :realhour 20, :name "Evening"}
;                  {:id "midnight",  :realhour 0,  :name "Midnight"}]
;   :days_of_week [{:id "sun", :name "Sun"}
;                  {:id "mon", :name "Mon"}
;                  {:id "tue", :name "Tue"}
;                  {:id "wed", :name "Wed"}
;                  {:id "thu", :name "Thu"}
;                  {:id "fri", :name "Fri"}
;                  {:id "sat", :name "Sat"}]
;   :modes [{:name "Active", :id 1}
;           {:name "Disabled", :id 2}]
;   :permissions [{:name "None",         :id 0}
;                 {:name "Read Only",    :id 1}
;                 {:name "Read & Write", :id 2}]}
;  (-> ((user->client :rasta) :get 200 "emailreport/form_input" :org @org-id) ; convert to a set so test doesn't fail if order differs
;        (update-in [:users] set)))

;; ## /api/pulse/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "pulse"))
(expect (get middleware/response-unauthentic :body) (http/client :put 401 "pulse/13"))

(defn user-details [user]
  (match-$ user
    {:id $
     :email $
     :date_joined $
     :first_name $
     :last_name $
     :last_login $
     :is_superuser $
     :common_name $}))

(defn pulse-card-details [card]
  (-> (select-keys card [:id :name :description])
      (assoc :display (name (:display card)))))

(defn pulse-channel-details [channel]
  (match-$ channel
    {:id               $
     :pulse_id         $
     :channel_type     $
     :details          $
     :schedule_type    $
     :schedule_details $
     :created_at       $
     :updated_at       $}))

(defn pulse-details [pulse]
  (match-$ pulse
    {:id           $
     :name         $
     :public_perms $
     :created_at   $
     :updated_at   $
     :creator_id   $
     :creator      (user-details @(:creator pulse))
     :cards        (mapv pulse-card-details @(:cards pulse))
     :channels     (mapv pulse-channel-details @(:channels pulse))}))

(defn pulse-response [{:keys [created_at updated_at] :as pulse}]
  (-> pulse
      (dissoc :id)
      (assoc :created_at (not (nil? created_at)))
      (assoc :updated_at (not (nil? updated_at)))))


;; ## POST /api/pulse

(expect {:errors {:name "field is a required param."}}
  ((user->client :rasta) :post 400 "pulse" {}))

(expect {:errors {:cards "field is a required param."}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"}))

(expect {:errors {:cards "Invalid value 'foobar' for 'cards': value must be an array."}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards "foobar"}))

(expect {:errors {:cards "Invalid value 'abc' for 'cards': array value must be a map."}}
  ((user->client :rasta) :post 400 "pulse" {:name  "abc"
                                            :cards ["abc"]}))

(expect {:errors {:channels "field is a required param."}}
  ((user->client :rasta) :post 400 "pulse" {:name "abc"
                                            :cards [{:id 100} {:id 200}]}))

(expect {:errors {:channels "Invalid value 'foobar' for 'channels': value must be an array."}}
  ((user->client :rasta) :post 400 "pulse" {:name    "abc"
                                            :cards   [{:id 100} {:id 200}]
                                            :channels "foobar"}))

(expect {:errors {:channels "Invalid value 'abc' for 'channels': array value must be a map."}}
  ((user->client :rasta) :post 400 "pulse" {:name     "abc"
                                            :cards    [{:id 100} {:id 200}]
                                            :channels ["abc"]}))

(expect-let [card1 (new-card)
             card2 (new-card)]
  {:name         "A Pulse"
   :public_perms common/perms-readwrite
   :creator_id   (user->id :rasta)
   :created_at   true
   :updated_at   true
   :cards        (into [] (map pulse-card-details [card1 card2]))}
  (pulse-response ((user->client :rasta) :post 200 "pulse" {:name     "A Pulse"
                                                            :cards    [{:id (:id card1)} {:id (:id card2)}]
                                                            :channels [{:channel_type  "email"
                                                                        :schedule_type "daily"}]})))

;; ## GET /api/pulse

(expect-let [pulse1 (new-pulse)
             ;pulse2 (new-pulse)
             ]
  [(pulse-details pulse1)]
  ((user->client :rasta) :get 200 "pulse"))

;(expect-eval-actual-first
;    (match-$ (sel :one EmailReport (order :id :DESC))
;      {:description nil
;       :email_addresses ""
;       :schedule {:days_of_week {:mon true
;                                 :tue true
;                                 :wed true
;                                 :thu true
;                                 :fri true
;                                 :sat true
;                                 :sun true}
;                  :timezone ""
;                  :time_of_day "morning"}
;       :recipients [(match-$ (fetch-user :lucky)
;                      {:email "lucky@metabase.com"
;                       :first_name "Lucky"
;                       :last_login $
;                       :is_superuser false
;                       :id $
;                       :last_name "Pigeon"
;                       :date_joined $
;                       :common_name "Lucky Pigeon"})]
;       :organization_id @org-id
;       :name "My Cool Email Report"
;       :mode (emailreport/mode->id :active)
;       :creator_id (user->id :rasta)
;       :updated_at $
;       :dataset_query {:database (:id @test-db)
;                       :query {:limit nil
;                               :breakout [nil]
;                               :aggregation ["rows"]
;                               :filter [nil nil]
;                               :source_table (table->id :venues)}
;                       :type "query"}
;       :id $
;       :version 1
;       :public_perms common/perms-readwrite
;       :created_at $})
;  (create-email-report))

;;; ## GET /api/emailreport/:id
;(expect-eval-actual-first
;    (match-$ (sel :one EmailReport (order :id :DESC))
;      {:description nil
;       :email_addresses ""
;       :can_read true
;       :schedule {:days_of_week {:mon true
;                                 :tue true
;                                 :wed true
;                                 :thu true
;                                 :fri true
;                                 :sat true
;                                 :sun true}
;                  :timezone ""
;                  :time_of_day "morning"}
;       :creator (match-$ (fetch-user :rasta)
;                  {:common_name "Rasta Toucan"
;                   :date_joined $
;                   :last_name "Toucan"
;                   :id $
;                   :is_superuser false
;                   :last_login $
;                   :first_name "Rasta"
;                   :email "rasta@metabase.com"})
;       :recipients [(match-$ (fetch-user :lucky)
;                      {:email "lucky@metabase.com"
;                       :first_name "Lucky"
;                       :last_login $
;                       :is_superuser false
;                       :id $
;                       :last_name "Pigeon"
;                       :date_joined $
;                       :common_name "Lucky Pigeon"})]
;       :can_write true
;       :organization_id @org-id
;       :name "My Cool Email Report"
;       :mode (emailreport/mode->id :active)
;       :organization {:id @org-id
;                      :slug "test"
;                      :name "Test Organization"
;                      :description nil
;                      :logo_url nil
;                      :report_timezone nil
;                      :inherits true}
;       :creator_id (user->id :rasta)
;       :updated_at $
;       :dataset_query {:database (:id @test-db)
;                       :query {:limit nil
;                               :breakout [nil]
;                               :aggregation ["rows"]
;                               :filter [nil nil]
;                               :source_table (table->id :venues)}
;                       :type "query"}
;       :id $
;       :version 1
;       :public_perms common/perms-readwrite
;       :created_at $})
;  (let [{id :id} (create-email-report)]
;    ((user->client :rasta) :get 200 (format "emailreport/%d" id))))
;
;;; ## DELETE /api/emailreport/:id
;(let [er-name (random-name)
;      er-exists? (fn [] (exists? EmailReport :name er-name))]
;  (expect-eval-actual-first
;      [false
;       true
;       false]
;    [(er-exists?)
;     (do (create-email-report :name er-name)
;         (er-exists?))
;     (let [{id :id} (sel :one EmailReport :name er-name)]
;       ((user->client :rasta) :delete 204 (format "emailreport/%d" id))
;       (er-exists?))]))
;
;
;;; ## RECPIENTS-RELATED TESTS
;;; *  Check that recipients are returned by GET /api/emailreport/:id
;;; *  Check that we can set them via PUT /api/emailreport/:id
;(expect
;    [#{}
;     #{:rasta}
;     #{:crowberto :lucky}
;     #{}]
;  (with-temp EmailReport [{:keys [id]} {:creator_id      (user->id :rasta)
;                                        :name            (random-name)
;                                        :organization_id @org-id
;                                        :dataset_query   {}
;                                        :schedule        {}}]
;    (symbol-macrolet [get-recipients (->> ((user->client :rasta) :get 200 (format "emailreport/%d" id))
;                                          :recipients
;                                          (map :id)
;                                          (map id->user)
;                                          set)]
;      (let [put-recipients (fn [& user-kws]
;                             ((user->client :rasta) :put 200 (format "emailreport/%d" id) {:recipients (map user->id user-kws)})
;                             get-recipients)]
;        [get-recipients
;         (put-recipients :rasta)
;         (put-recipients :lucky :crowberto)
;         (put-recipients)]))))
