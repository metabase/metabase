(ns metabase.models.humanization-test
  (:require [clojure.test :refer :all]
            [metabase.models
             [humanization :as humanization]
             [table :refer [Table]]]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest advanced-humanization-test
  (doseq [[input expected] {nil                         nil
                            ""                          nil
                            "_"                         ""
                            "-"                         ""
                            "_id"                       "ID"
                            "uid"                       "UID"
                            "uuid"                      "UUID"
                            "guid"                      "GUID"
                            "ip"                        "IP"
                            "url"                       "URL"
                            "_agent_invite_migration"   "Agent Invite Migration"
                            "-agent-invite-migration"   "Agent Invite Migration"
                            "fooBar"                    "Foo Bar"
                            "foo-bar"                   "Foo Bar"
                            "foo_bar"                   "Foo Bar"
                            "foo bar"                   "Foo Bar"
                            "dashboardcardsubscription" "Dashboard Card Subscription"
                            "foo_id"                    "Foo ID"
                            "receiver_id"               "Receiver ID"
                            "inbox"                     "Inbox"
                            "acquirer"                  "Acquirer"
                            "auth_authenticator"        "Auth Authenticator"
                            "authprovider"              "Auth Provider"
                            "usersocialauth"            "User Social Auth"
                            "allalter"                  "All Alter"
                            "alterall"                  "Alter All"
                            "andanyor"                  "And Any Or"
                            "ascdesc"                   "Ascdesc"
                            "decimaldefaultdelete"      "Decimal Default Delete"
                            "elseendexist"              "Else End Exist"
                            "forfrom"                   "For From"
                            "gotograntgroup"            "Goto Grant Group"
                            "ifininsertis"              "If In Insert Is"
                            "notnull"                   "Not Null"
                            "ofonorder"                 "Of On Order"
                            "rangeselect"               "Range Select"
                            "tablethentotype"           "Table Then To Type"
                            "unionuniqueupdate"         "Union Unique Update"
                            "valueswherewith"           "Values Where With"
                            "changelog"                 "Changelog"
                            "dataflow"                  "Dataflow"
                            "bestseller"                "Bestseller"
                            "uniques"                   "Uniques"
                            "cpi"                       "Cpi"
                            "ctr"                       "Ctr"
                            "paid_to_sparkify"          "Paid To Sparkify"
                            "paidtosparkify"            "Paid To Sparkify"
                            "assassinate"               "Assassinate"
                            "analbumcover"              "An Album Cover"}]
    (testing (pr-str (list 'name->human-readable-name :advanced input))
      (is (= expected
             (humanization/name->human-readable-name :advanced input))))))

(deftest simple-humanization-test
  (doseq [[input expected] {nil                         nil
                            ""                          nil
                            "_"                         ""
                            "-"                         ""
                            "_id"                       "ID"
                            "uid"                       "UID"
                            "uuid"                      "UUID"
                            "guid"                      "GUID"
                            "ip"                        "IP"
                            "url"                       "URL"
                            "_agent_invite_migration"   "Agent Invite Migration"
                            "-agent-invite-migration"   "Agent Invite Migration"
                            "fooBar"                    "Foobar"
                            "foo-bar"                   "Foo Bar"
                            "foo_bar"                   "Foo Bar"
                            "foo bar"                   "Foo Bar"
                            "dashboardcardsubscription" "Dashboardcardsubscription"
                            "foo_id"                    "Foo ID"
                            "receiver_id"               "Receiver ID"
                            "inbox"                     "Inbox"
                            "acquirer"                  "Acquirer"
                            "auth_authenticator"        "Auth Authenticator"
                            "authprovider"              "Authprovider"
                            "usersocialauth"            "Usersocialauth"}]
    (testing (pr-str (list 'name->human-readable-name :simple input))
      (is (= expected
             (humanization/name->human-readable-name :simple input))))))

(deftest none-humanization-test
  (doseq [input [nil
                 ""
                 "_"
                 "-"
                 "_id"
                 "uid"
                 "uuid"
                 "guid"
                 "ip"
                 "url"
                 "_agent_invite_migration"
                 "-agent-invite-migration"
                 "fooBar"
                 "foo-bar"
                 "foo_bar"
                 "foo bar"
                 "dashboardcardsubscription"
                 "foo_id"
                 "receiver_id"
                 "inbox"
                 "acquirer"
                 "auth_authenticator"
                 "authprovider"
                 "usersocialauth"]]
    (testing (pr-str (list 'name->human-readable-name :none input))
      (is (= input
             (humanization/name->human-readable-name :none input))))))

(deftest db-inspired-test
  (doseq [[input strategy->expected] {"sumsubtotal"           {:advanced "Sum Subtotal"}
                                      "sum(subtotal)"         {:advanced "Sum(subtotal)"
                                                               :simple   "Sum(subtotal)"
                                                               :none     "sum(subtotal)"}
                                      "created_at::date"      {:advanced "Created At::date"
                                                               :simple   "Created At::date"
                                                               :none     "created_at::date"}
                                      "datecreated"           {:advanced "Date Created"
                                                               :simple   "Datecreated"
                                                               :none     "datecreated"}
                                      "createdat"             {:advanced "Created At"
                                                               :simple   "Createdat"
                                                               :none     "createdat"}
                                      "createat"              {:advanced "Create At"}
                                      "updatedat"             {:advanced "Updated At"
                                                               :simple   "Updatedat"
                                                               :none     "updatedat"}
                                      "updateat"              {:advanced "Update At"}
                                      "castcreatedatasdate"   {:advanced "Cast Created At As Date"}
                                      "cast(createdatasdate)" {:simple "Cast(createdatasdate)"
                                                               :none   "cast(createdatasdate)"}}
          [strategy expected]        strategy->expected]
    (testing (pr-str (list 'name->human-readable-name strategy input))
      (is (= expected
             (humanization/name->human-readable-name strategy input))))))

(defn- get-humanized-display-name [actual-name strategy]
  (with-redefs [humanization/humanization-strategy (constantly strategy)]
    (tt/with-temp Table [{table-id :id} {:name actual-name}]
      (db/select-one-field :display_name Table, :id table-id))))

(deftest humanized-display-name-test
  (testing "check that we get the expected :display_name with advanced humanization *enabled*"
    (doseq [[input strategy->expected] {"toucansare_cool"     {"advanced" "Toucans Are Cool"
                                                               "simple"   "Toucansare Cool"
                                                               "none"     "toucansare_cool"}
                                        "fussybird_sightings" {"advanced" "Fussy Bird Sightings"
                                                               "simple"   "Fussybird Sightings"
                                                               "none"     "fussybird_sightings"}}
            [strategy expected]        strategy->expected]
      (testing (pr-str (list 'get-humanized-display-name input strategy))
        (is (= expected
               (get-humanized-display-name input strategy)))))))

(deftest rehumanize-test
  (testing "check that existing tables have their :display_names updated appropriately when strategy is changed"
    (doseq [[actual-name expected] {"toucansare_cool"     {:initial  "Toucans Are Cool"
                                                           :simple   "Toucansare Cool"
                                                           :advanced "Toucans Are Cool"
                                                           :none     "toucansare_cool"}
                                    "fussybird_sightings" {:initial  "Fussy Bird Sightings"
                                                           :simple   "Fussybird Sightings"
                                                           :advanced "Fussy Bird Sightings"
                                                           :none     "fussybird_sightings"}}]
      (tu/with-temporary-setting-values [humanization-strategy "advanced"]
        (tt/with-temp Table [{table-id :id} {:name actual-name}]
          (letfn [(display-name [] (db/select-one-field :display_name Table, :id table-id))]
            (testing "initial display name"
              (is (= (:initial expected)
                     (display-name))))
            (testing "switch to :simple"
              (humanization/humanization-strategy "simple")
              (is (= (:simple expected)
                     (display-name))))
            (testing "switch to :advanced"
              (humanization/humanization-strategy "advanced")
              (is (= (:advanced expected)
                     (display-name))))
            (testing "switch to :none"
              (humanization/humanization-strategy "none")
              (is (= (:none expected)
                     (display-name))))))))))

(deftest do-not-overwrite-custom-names-test
  (testing "check that if we give a field a custom display_name that changing strategy doesn't overwrite it"
    (doseq [initial-strategy ["advanced" "simple" "none"]]
      (tu/with-temporary-setting-values [humanization-strategy initial-strategy]
        (tt/with-temp Table [{table-id :id} {:name "toucansare_cool", :display_name "My Favorite Table"}]
          (doseq [new-strategy ["advanced" "simple" "none"]]
            (testing (format "switch from %s -> %s" initial-strategy new-strategy)
              (humanization/humanization-strategy new-strategy)
              (is (= "My Favorite Table"
                     (db/select-one-field :display_name Table, :id table-id))))))))))
