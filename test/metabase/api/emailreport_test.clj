(ns metabase.api.emailreport-test
  "Tests for /api/emailreport endpoints."
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :as common]
                             [database :refer [Database]]
                             [pulse :refer [EmailReport] :as emailreport])
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name with-temp]]
            [metabase.test-data :refer :all]))

;; ## Helper Fns

(defn create-email-report [& {:as kwargs}]
  ((user->client :rasta) :post 200 "emailreport"
   (merge {:name "My Cool Email Report"
           :mode (emailreport/mode->id :active)
           :public_perms common/perms-readwrite
           :email_addresses ""
           :recipients [(user->id :lucky)]
           :dataset_query {:type "query"
                           :query {:source_table (table->id :venues)
                                   :filter [nil nil]
                                   :aggregation ["rows"]
                                   :breakout [nil]
                                   :limit nil}
                           :database (:id @test-db)}
           :schedule {:days_of_week {:mon true
                                     :tue true
                                     :wed true
                                     :thu true
                                     :fri true
                                     :sat true
                                     :sun true}
                      :time_of_day "morning"
                      :timezone ""}
           :organization @org-id}
          kwargs)))

;; ## GET /api/emailreport/form_input
;; Test that we can get the form input options for the Test Org
(expect-let [_ @test-db ; force lazy loading of Test Data / Metabase DB
             _ (cascade-delete Database :name [not= "Test Database"])] ; Delete all Databases that aren't the Test DB
  {:users #{{:id (user->id :rasta),     :name "Rasta Toucan"}
            {:id (user->id :crowberto), :name "Crowberto Corv"}
            {:id (user->id :lucky),     :name "Lucky Pigeon"}
            {:id (user->id :trashbird), :name "Trash Bird"}}
   :databases [{:id (:id @test-db)
                :name "Test Database"}],
   :timezones ["GMT"
               "UTC"
               "US/Alaska"
               "US/Arizona"
               "US/Central"
               "US/Eastern"
               "US/Hawaii"
               "US/Mountain"
               "US/Pacific"
               "America/Costa_Rica"]
   :times_of_day [{:id "morning",   :realhour 8,  :name "Morning"}
                  {:id "midday",    :realhour 12, :name "Midday"}
                  {:id "afternoon", :realhour 16, :name "Afternoon"}
                  {:id "evening",   :realhour 20, :name "Evening"}
                  {:id "midnight",  :realhour 0,  :name "Midnight"}]
   :days_of_week [{:id "sun", :name "Sun"}
                  {:id "mon", :name "Mon"}
                  {:id "tue", :name "Tue"}
                  {:id "wed", :name "Wed"}
                  {:id "thu", :name "Thu"}
                  {:id "fri", :name "Fri"}
                  {:id "sat", :name "Sat"}]
   :modes [{:name "Active", :id 1}
           {:name "Disabled", :id 2}]
   :permissions [{:name "None",         :id 0}
                 {:name "Read Only",    :id 1}
                 {:name "Read & Write", :id 2}]}
  (-> ((user->client :rasta) :get 200 "emailreport/form_input" :org @org-id) ; convert to a set so test doesn't fail if order differs
        (update-in [:users] set)))


;; ## POST /api/emailreport
(expect-eval-actual-first
    (match-$ (sel :one EmailReport (order :id :DESC))
      {:description nil
       :email_addresses ""
       :schedule {:days_of_week {:mon true
                                 :tue true
                                 :wed true
                                 :thu true
                                 :fri true
                                 :sat true
                                 :sun true}
                  :timezone ""
                  :time_of_day "morning"}
       :recipients [(match-$ (fetch-user :lucky)
                      {:email "lucky@metabase.com"
                       :first_name "Lucky"
                       :last_login $
                       :is_superuser false
                       :id $
                       :last_name "Pigeon"
                       :date_joined $
                       :common_name "Lucky Pigeon"})]
       :organization_id @org-id
       :name "My Cool Email Report"
       :mode (emailreport/mode->id :active)
       :creator_id (user->id :rasta)
       :updated_at $
       :dataset_query {:database (:id @test-db)
                       :query {:limit nil
                               :breakout [nil]
                               :aggregation ["rows"]
                               :filter [nil nil]
                               :source_table (table->id :venues)}
                       :type "query"}
       :id $
       :version 1
       :public_perms common/perms-readwrite
       :created_at $})
  (create-email-report))

;; ## GET /api/emailreport/:id
(expect-eval-actual-first
    (match-$ (sel :one EmailReport (order :id :DESC))
      {:description nil
       :email_addresses ""
       :can_read true
       :schedule {:days_of_week {:mon true
                                 :tue true
                                 :wed true
                                 :thu true
                                 :fri true
                                 :sat true
                                 :sun true}
                  :timezone ""
                  :time_of_day "morning"}
       :creator (match-$ (fetch-user :rasta)
                  {:common_name "Rasta Toucan"
                   :date_joined $
                   :last_name "Toucan"
                   :id $
                   :is_superuser false
                   :last_login $
                   :first_name "Rasta"
                   :email "rasta@metabase.com"})
       :recipients [(match-$ (fetch-user :lucky)
                      {:email "lucky@metabase.com"
                       :first_name "Lucky"
                       :last_login $
                       :is_superuser false
                       :id $
                       :last_name "Pigeon"
                       :date_joined $
                       :common_name "Lucky Pigeon"})]
       :can_write true
       :organization_id @org-id
       :name "My Cool Email Report"
       :mode (emailreport/mode->id :active)
       :organization {:id @org-id
                      :slug "test"
                      :name "Test Organization"
                      :description nil
                      :logo_url nil
                      :report_timezone nil
                      :inherits true}
       :creator_id (user->id :rasta)
       :updated_at $
       :dataset_query {:database (:id @test-db)
                       :query {:limit nil
                               :breakout [nil]
                               :aggregation ["rows"]
                               :filter [nil nil]
                               :source_table (table->id :venues)}
                       :type "query"}
       :id $
       :version 1
       :public_perms common/perms-readwrite
       :created_at $})
  (let [{id :id} (create-email-report)]
    ((user->client :rasta) :get 200 (format "emailreport/%d" id))))

;; ## DELETE /api/emailreport/:id
(let [er-name (random-name)
      er-exists? (fn [] (exists? EmailReport :name er-name))]
  (expect-eval-actual-first
      [false
       true
       false]
    [(er-exists?)
     (do (create-email-report :name er-name)
         (er-exists?))
     (let [{id :id} (sel :one EmailReport :name er-name)]
       ((user->client :rasta) :delete 204 (format "emailreport/%d" id))
       (er-exists?))]))


;; ## RECPIENTS-RELATED TESTS
;; *  Check that recipients are returned by GET /api/emailreport/:id
;; *  Check that we can set them via PUT /api/emailreport/:id
(expect
    [#{}
     #{:rasta}
     #{:crowberto :lucky}
     #{}]
  (with-temp EmailReport [{:keys [id]} {:creator_id      (user->id :rasta)
                                        :name            (random-name)
                                        :organization_id @org-id
                                        :dataset_query   {}
                                        :schedule        {}}]
    (symbol-macrolet [get-recipients (->> ((user->client :rasta) :get 200 (format "emailreport/%d" id))
                                          :recipients
                                          (map :id)
                                          (map id->user)
                                          set)]
      (let [put-recipients (fn [& user-kws]
                             ((user->client :rasta) :put 200 (format "emailreport/%d" id) {:recipients (map user->id user-kws)})
                             get-recipients)]
        [get-recipients
         (put-recipients :rasta)
         (put-recipients :lucky :crowberto)
         (put-recipients)]))))
