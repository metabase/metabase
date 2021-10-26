(ns metabase.models.humanization-test
  (:require [clojure.test :refer :all]
            [colorize.core :as colorize]
            [metabase.models.humanization :as humanization]
            [metabase.models.table :refer [Table]]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- do-with-temporary-humanization-strategy
  "Implementation for the `with-temporary-humanization-strategy` macro."
  [value thunk]
  (let [original-value (humanization/humanization-strategy)]
    (try
      (humanization/humanization-strategy value)
      (testing (colorize/blue (format "\nSetting :humanization-strategy = %s\n" (pr-str value)))
        (thunk))
      (catch Throwable e
        (throw (ex-info (str "Error in with-temporary-humanization-strategy: " (ex-message e))
                        {:setting :humanization-strategy
                         :value   value}
                        e)))
      (finally
        (humanization/humanization-strategy original-value)))))

(defmacro with-temporary-humanization-strategy
  "Temporarily set the `humanization-strategy` setting to the provided value, execute body, and re-establish the
  original setting. This should be used instead of `metabase.test.util/with-temporary-setting-values`
  to ensure that table names in the database are updated properly when restoring the setting.

     (with-temporary-humanization-strategy :simple
       ...)"
  [value & body]
  `(do-with-temporary-humanization-strategy ~value (fn [] ~@body)))


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
                            "fooBar"                    "FooBar"
                            "foo-bar"                   "Foo Bar"
                            "foo_bar"                   "Foo Bar"
                            "foo bar"                   "Foo Bar"
                            "dashboardcardsubscription" "Dashboardcardsubscription"
                            "foo_id"                    "Foo ID"
                            "fooID"                     "FooID"
                            "receiver_id"               "Receiver ID"
                            "inbox"                     "Inbox"
                            "acquirer"                  "Acquirer"
                            "auth_authenticator"        "Auth Authenticator"
                            "authprovider"              "Authprovider"
                            "usersocialauth"            "Usersocialauth"}]
    (testing (pr-str (list 'name->human-readable-name :simple input))
      (is (= expected
             (humanization/name->human-readable-name :simple input))))
    ;; there used to be an advanced mode but it should just act as simple mode now
    (testing (pr-str (list 'name->human-readable-name :advanced input))
      (is (= expected
             (humanization/name->human-readable-name :advanced input))))))

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
  (doseq [[input strategy->expected] {"sum(subtotal)"         {:simple   "Sum(subtotal)"
                                                               :none     "sum(subtotal)"}
                                      "created_at::date"      {:simple   "Created At::date"
                                                               :none     "created_at::date"}
                                      "datecreated"           {:simple   "Datecreated"
                                                               :none     "datecreated"}
                                      "createdat"             {:simple   "Createdat"
                                                               :none     "createdat"}
                                      "updatedat"             {:simple   "Updatedat"
                                                               :none     "updatedat"}
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
  (testing "check that we get the expected :display_name with humanization *enabled*"
    (doseq [[input strategy->expected] {"toucansare_cool"     {"simple"   "Toucansare Cool"
                                                               "advanced" "Toucansare Cool"
                                                               "none"     "toucansare_cool"}
                                        "fussybird_sightings" {"simple"   "Fussybird Sightings"
                                                               "advanced" "Fussybird Sightings"
                                                               "none"     "fussybird_sightings"}}
            [strategy expected]        strategy->expected]
      (testing (pr-str (list 'get-humanized-display-name input strategy))
        (is (= expected
               (get-humanized-display-name input strategy)))))))

(deftest rehumanize-test
  (testing "check that existing tables have their :display_names updated appropriately when strategy is changed"
    (doseq [[actual-name expected] {"toucansare_cool"     {:initial  "Toucansare Cool"
                                                           :simple   "Toucansare Cool"
                                                           :none     "toucansare_cool"}
                                    "fussybird_sightings" {:initial  "Fussybird Sightings"
                                                           :simple   "Fussybird Sightings"
                                                           :none     "fussybird_sightings"}}]
      (with-temporary-humanization-strategy :simple
        (tt/with-temp Table [{table-id :id} {:name actual-name}]
          (letfn [(display-name [] (db/select-one-field :display_name Table, :id table-id))]
            (testing "initial display name"
              (is (= (:initial expected)
                     (display-name))))
            (testing "switch to :simple"
              (humanization/humanization-strategy "simple")
              (is (= (:simple expected)
                     (display-name))))
            (testing "switch to :none"
              (humanization/humanization-strategy "none")
              (is (= (:none expected)
                     (display-name))))))))))

(deftest do-not-overwrite-custom-names-test
  (testing "check that if we give a field a custom display_name that changing strategy doesn't overwrite it"
    (doseq [initial-strategy ["simple" "none"]]
      (with-temporary-humanization-strategy (keyword initial-strategy)
        (tt/with-temp Table [{table-id :id} {:name "toucansare_cool", :display_name "My Favorite Table"}]
          (doseq [new-strategy ["simple" "none"]]
            (testing (format "switch from %s -> %s" initial-strategy new-strategy)
              (humanization/humanization-strategy new-strategy)
              (is (= "My Favorite Table"
                     (db/select-one-field :display_name Table, :id table-id))))))))))
