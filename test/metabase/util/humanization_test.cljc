(ns metabase.util.humanization-test
  (:require
   [clojure.test :refer [are deftest]]
   [metabase.util.humanization :as humanization.impl]))

(deftest ^:parallel simple-humanization-test
  (are [input expected] (= expected
                           (humanization.impl/name->human-readable-name :simple input))
    nil                         nil
    ""                          nil
    "_"                         "_"
    "-"                         "-"
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
    "usersocialauth"            "Usersocialauth"))

(deftest ^:parallel none-humanization-test
  (are [input] (= input
                  (humanization.impl/name->human-readable-name :none input))
    nil
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
    "usersocialauth"))

(deftest ^:parallel db-inspired-test
  (are [input strategy expected] (= expected
                                    (humanization.impl/name->human-readable-name strategy input))
    "sum(subtotal)"         :simple "Sum(subtotal)"
    "sum(subtotal)"         :none   "sum(subtotal)"
    "created_at::date"      :simple "Created At::date"
    "created_at::date"      :none   "created_at::date"
    "datecreated"           :simple "Datecreated"
    "datecreated"           :none   "datecreated"
    "createdat"             :simple "Createdat"
    "createdat"             :none   "createdat"
    "updatedat"             :simple "Updatedat"
    "updatedat"             :none   "updatedat"
    "cast(createdatasdate)" :simple "Cast(createdatasdate)"
    "cast(createdatasdate)" :none   "cast(createdatasdate)"))
