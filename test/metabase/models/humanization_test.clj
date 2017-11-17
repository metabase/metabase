(ns metabase.models.humanization-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer [Field]]
             [humanization :refer :all]
             [table :refer [Table]]]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(tu/resolve-private-vars metabase.models.humanization
  name->human-readable-name:simple name->human-readable-name:advanced)

;;; name->human-readable-name:advanced
(expect nil                           (name->human-readable-name:advanced nil))
(expect nil                           (name->human-readable-name:advanced ""))
(expect ""                            (name->human-readable-name:advanced "_"))
(expect ""                            (name->human-readable-name:advanced "-"))
(expect "ID"                          (name->human-readable-name:advanced "_id"))
(expect "UID"                         (name->human-readable-name:advanced "uid"))
(expect "UUID"                        (name->human-readable-name:advanced "uuid"))
(expect "GUID"                        (name->human-readable-name:advanced "guid"))
(expect "IP"                          (name->human-readable-name:advanced "ip"))
(expect "URL"                         (name->human-readable-name:advanced "url"))
(expect "Agent Invite Migration"      (name->human-readable-name:advanced "_agent_invite_migration"))
(expect "Agent Invite Migration"      (name->human-readable-name:advanced "-agent-invite-migration"))
(expect "Foo Bar"                     (name->human-readable-name:advanced "fooBar"))
(expect "Foo Bar"                     (name->human-readable-name:advanced "foo-bar"))
(expect "Foo Bar"                     (name->human-readable-name:advanced "foo_bar"))
(expect "Foo Bar"                     (name->human-readable-name:advanced "foo bar"))
(expect "Dashboard Card Subscription" (name->human-readable-name:advanced "dashboardcardsubscription"))
(expect "Foo ID"                      (name->human-readable-name:advanced "foo_id"))
(expect "Receiver ID"                 (name->human-readable-name:advanced "receiver_id"))
(expect "Inbox"                       (name->human-readable-name:advanced "inbox"))
(expect "Acquirer"                    (name->human-readable-name:advanced "acquirer"))
(expect "Auth Authenticator"          (name->human-readable-name:advanced "auth_authenticator"))
(expect "Auth Provider"               (name->human-readable-name:advanced "authprovider"))
(expect "User Social Auth"            (name->human-readable-name:advanced "usersocialauth"))


;;; name->human-readable-name:simple
(expect nil                         (name->human-readable-name:simple nil))
(expect nil                         (name->human-readable-name:simple ""))
(expect ""                          (name->human-readable-name:simple "_"))
(expect ""                          (name->human-readable-name:simple "-"))
(expect "ID"                        (name->human-readable-name:simple "_id"))
(expect "UID"                       (name->human-readable-name:simple "uid"))
(expect "UUID"                      (name->human-readable-name:simple "uuid"))
(expect "GUID"                      (name->human-readable-name:simple "guid"))
(expect "IP"                        (name->human-readable-name:simple "ip"))
(expect "URL"                       (name->human-readable-name:simple "url"))
(expect "Agent Invite Migration"    (name->human-readable-name:simple "_agent_invite_migration"))
(expect "Agent Invite Migration"    (name->human-readable-name:simple "-agent-invite-migration"))
(expect "Foobar"                    (name->human-readable-name:simple "fooBar"))
(expect "Foo Bar"                   (name->human-readable-name:simple "foo-bar"))
(expect "Foo Bar"                   (name->human-readable-name:simple "foo_bar"))
(expect "Foo Bar"                   (name->human-readable-name:simple "foo bar"))
(expect "Dashboardcardsubscription" (name->human-readable-name:simple "dashboardcardsubscription"))
(expect "Foo ID"                    (name->human-readable-name:simple "foo_id"))
(expect "Receiver ID"               (name->human-readable-name:simple "receiver_id"))
(expect "Inbox"                     (name->human-readable-name:simple "inbox"))
(expect "Acquirer"                  (name->human-readable-name:simple "acquirer"))
(expect "Auth Authenticator"        (name->human-readable-name:simple "auth_authenticator"))
(expect "Authprovider"              (name->human-readable-name:simple "authprovider"))
(expect "Usersocialauth"            (name->human-readable-name:simple "usersocialauth"))


;;; Re-humanization

;; check that we get the expected :display_name with advanced humanization *enabled*
(expect
  "Toucans Are Cool"
  (tu/with-temporary-setting-values [enable-advanced-humanization true]
    (tt/with-temp Table [{table-id :id} {:name "toucansare_cool"}]
      (db/select-one-field :display_name Table, :id table-id))))

(expect
  "Fussy Bird Sightings"
  (tu/with-temporary-setting-values [enable-advanced-humanization true]
    (tt/with-temp Field [{field-id :id} {:name "fussybird_sightings"}]
      (db/select-one-field :display_name Field, :id field-id))))

;; check that we get the expected :display_name with advanced humanization *disabled*
(expect
  "Toucansare Cool"
  (tu/with-temporary-setting-values [enable-advanced-humanization false]
    (tt/with-temp Table [{table-id :id} {:name "toucansare_cool"}]
      (db/select-one-field :display_name Table, :id table-id))))

(expect
  "Fussybird Sightings"
  (tu/with-temporary-setting-values [enable-advanced-humanization false]
    (tt/with-temp Field [{field-id :id} {:name "fussybird_sightings"}]
      (db/select-one-field :display_name Field, :id field-id))))

;; now check that existing tables have their :display_names updated appropriately when the setting `enabled-advanced-humanization` is toggled
(expect
  ["Toucans Are Cool"
   "Toucansare Cool"
   "Toucans Are Cool"]
  (tu/with-temporary-setting-values [enable-advanced-humanization true]
    (tt/with-temp Table [{table-id :id} {:name "toucansare_cool"}]
      (let [display-name #(db/select-one-field :display_name Table, :id table-id)]
        [(display-name)
         (do (enable-advanced-humanization false)
             (display-name))
         (do (enable-advanced-humanization true)
             (display-name))]))))

(expect
  ["Fussy Bird Sightings"
   "Fussybird Sightings"
   "Fussy Bird Sightings"]
  (tu/with-temporary-setting-values [enable-advanced-humanization true]
    (tt/with-temp Field [{field-id :id} {:name "fussybird_sightings"}]
      (let [display-name #(db/select-one-field :display_name Field, :id field-id)]
        [(display-name)
         (do (enable-advanced-humanization false)
             (display-name))
         (do (enable-advanced-humanization true)
             (display-name))]))))

;; check that if we give a field a custom display_name that re-humanization doesn't overwrite it
(expect
  "My Favorite Table"
  (tu/with-temporary-setting-values [enable-advanced-humanization true]
    (tt/with-temp Table [{table-id :id} {:name "toucansare_cool"}]
      (db/update! Table table-id
        :display_name "My Favorite Table")
      (enable-advanced-humanization false)
      (db/select-one-field :display_name Table, :id table-id))))

(expect
  "My Favorite Field"
  (tu/with-temporary-setting-values [enable-advanced-humanization true]
    (tt/with-temp Field [{field-id :id} {:name "fussybird_sightings"}]
      (db/update! Field field-id
        :display_name "My Favorite Field")
      (enable-advanced-humanization false)
      (db/select-one-field :display_name Field, :id field-id))))

;; make sure switching in the other direction doesn't stomp all over custom names either
(expect
  "My Favorite Table"
  (tu/with-temporary-setting-values [enable-advanced-humanization false]
    (tt/with-temp Table [{table-id :id} {:name "toucansare_cool"}]
      (db/update! Table table-id
        :display_name "My Favorite Table")
      (enable-advanced-humanization true)
      (db/select-one-field :display_name Table, :id table-id))))

(expect
  "My Favorite Field"
  (tu/with-temporary-setting-values [enable-advanced-humanization false]
    (tt/with-temp Field [{field-id :id} {:name "fussybird_sightings"}]
      (db/update! Field field-id
        :display_name "My Favorite Field")
      (enable-advanced-humanization true)
      (db/select-one-field :display_name Field, :id field-id))))
