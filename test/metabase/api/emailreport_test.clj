(ns metabase.api.emailreport-test
  "Tests for /api/emailreport endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [emailreport :refer [EmailReport]])
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name]]
            [metabase.test-data :refer :all]))

;; ## GET /api/emailreport/form_input
;; Test that we can get the form input options for the Test Org
(expect-let [_ @test-db                                                ; force lazy loading of Test Data / Metabase DB
             _ (cascade-delete Database :name [not= "Test Database"])] ; Delete all Databases that aren't the Test DB
  {:users [{:id (user->id :rasta)
            :name "Rasta Toucan"}
           {:id (user->id :crowberto)
            :name "Crowberto Corv"}
           {:id (user->id :lucky)
            :name "Lucky Pigeon"}
           {:id (user->id :trashbird)
            :name "Trash Bird"}],
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
                  {:id "midnight",  :realhour 0,  :name "Midnight"}],
   :days_of_week [{:id "sun", :name "Sun"}
                  {:id "mon", :name "Mon"}
                  {:id "tue", :name "Tue"}
                  {:id "wed", :name "Wed"}
                  {:id "thu", :name "Thu"}
                  {:id "fri", :name "Fri"}
                  {:id "sat", :name "Sat"}],
   :modes [{:name "Active", :id 0}
           {:name "Disabled", :id 1}]
   :permissions [{:name "None",         :id 0}
                 {:name "Read Only",    :id 1}
                 {:name "Read & Write", :id 2}]}
  ((user->client :rasta) :get 200 "emailreport/form_input" :org (:id @test-org)))
