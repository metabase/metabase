(ns metabase.models.humanization-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [humanization :as humanization]
             [table :refer [Table]]]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; :advanced humanization
(expect nil                           (humanization/name->human-readable-name :advanced nil))
(expect nil                           (humanization/name->human-readable-name :advanced ""))
(expect ""                            (humanization/name->human-readable-name :advanced "_"))
(expect ""                            (humanization/name->human-readable-name :advanced "-"))
(expect "ID"                          (humanization/name->human-readable-name :advanced "_id"))
(expect "UID"                         (humanization/name->human-readable-name :advanced "uid"))
(expect "UUID"                        (humanization/name->human-readable-name :advanced "uuid"))
(expect "GUID"                        (humanization/name->human-readable-name :advanced "guid"))
(expect "IP"                          (humanization/name->human-readable-name :advanced "ip"))
(expect "URL"                         (humanization/name->human-readable-name :advanced "url"))
(expect "Agent Invite Migration"      (humanization/name->human-readable-name :advanced "_agent_invite_migration"))
(expect "Agent Invite Migration"      (humanization/name->human-readable-name :advanced "-agent-invite-migration"))
(expect "Foo Bar"                     (humanization/name->human-readable-name :advanced "fooBar"))
(expect "Foo Bar"                     (humanization/name->human-readable-name :advanced "foo-bar"))
(expect "Foo Bar"                     (humanization/name->human-readable-name :advanced "foo_bar"))
(expect "Foo Bar"                     (humanization/name->human-readable-name :advanced "foo bar"))
(expect "Dashboard Card Subscription" (humanization/name->human-readable-name :advanced "dashboardcardsubscription"))
(expect "Foo ID"                      (humanization/name->human-readable-name :advanced "foo_id"))
(expect "Receiver ID"                 (humanization/name->human-readable-name :advanced "receiver_id"))
(expect "Inbox"                       (humanization/name->human-readable-name :advanced "inbox"))
(expect "Acquirer"                    (humanization/name->human-readable-name :advanced "acquirer"))
(expect "Auth Authenticator"          (humanization/name->human-readable-name :advanced "auth_authenticator"))
(expect "Auth Provider"               (humanization/name->human-readable-name :advanced "authprovider"))
(expect "User Social Auth"            (humanization/name->human-readable-name :advanced "usersocialauth"))


;;;  db-inspired
(expect "Sum Subtotal"                (humanization/name->human-readable-name :advanced "sumsubtotal"))
(expect "Sum(subtotal)"               (humanization/name->human-readable-name :advanced "sum(subtotal)"))
(expect "Sum(subtotal)"               (humanization/name->human-readable-name :simple "sum(subtotal)"))
(expect "sum(subtotal)"               (humanization/name->human-readable-name :none "sum(subtotal)"))
(expect "Created At::date"            (humanization/name->human-readable-name :advanced "created_at::date"))
(expect "Created At::date"            (humanization/name->human-readable-name :simple "created_at::date"))
(expect "created_at::date"            (humanization/name->human-readable-name :none "created_at::date"))
(expect "Date Created"                (humanization/name->human-readable-name :advanced "datecreated"))
(expect "Datecreated"                 (humanization/name->human-readable-name :simple "datecreated"))
(expect "datecreated"                 (humanization/name->human-readable-name :none "datecreated"))
(expect "Created At"                  (humanization/name->human-readable-name :advanced "createdat"))
(expect "Create At"                   (humanization/name->human-readable-name :advanced "createat"))
(expect "Createdat"                   (humanization/name->human-readable-name :simple "createdat"))
(expect "createdat"                   (humanization/name->human-readable-name :none "createdat"))
(expect "Updated At"                  (humanization/name->human-readable-name :advanced "updatedat"))
(expect "Update At"                   (humanization/name->human-readable-name :advanced "updateat"))
(expect "Updatedat"                   (humanization/name->human-readable-name :simple "updatedat"))
(expect "updatedat"                   (humanization/name->human-readable-name :none "updatedat"))
(expect "Cast Created At As Date"     (humanization/name->human-readable-name :advanced "castcreatedatasdate"))
(expect "Cast(createdatasdate)"       (humanization/name->human-readable-name :simple "cast(createdatasdate)"))
(expect "cast(createdatasdate)"       (humanization/name->human-readable-name :none "cast(createdatasdate)"))

(expect "All Alter"                   (humanization/name->human-readable-name :advanced "allalter"))
(expect "Alter All"                   (humanization/name->human-readable-name :advanced "alterall"))
(expect "And Any Or"                  (humanization/name->human-readable-name :advanced "andanyor"))
(expect "Ascdesc"                     (humanization/name->human-readable-name :advanced "ascdesc"))
(expect "Decimal Default Delete"      (humanization/name->human-readable-name :advanced "decimaldefaultdelete"))
(expect "Else End Exist"              (humanization/name->human-readable-name :advanced "elseendexist"))
(expect "For From"                    (humanization/name->human-readable-name :advanced "forfrom"))
(expect "Goto Grant Group"            (humanization/name->human-readable-name :advanced "gotograntgroup"))
(expect "If In Insert Is"             (humanization/name->human-readable-name :advanced "ifininsertis"))
(expect "Not Null"                    (humanization/name->human-readable-name :advanced "notnull"))
(expect "Of On Order"                 (humanization/name->human-readable-name :advanced "ofonorder"))
(expect "Range Select"                (humanization/name->human-readable-name :advanced "rangeselect"))
(expect "Table Then To Type"          (humanization/name->human-readable-name :advanced "tablethentotype"))
(expect "Union Unique Update"         (humanization/name->human-readable-name :advanced "unionuniqueupdate"))
(expect "Values Where With"           (humanization/name->human-readable-name :advanced "valueswherewith"))

(expect "Changelog"                   (humanization/name->human-readable-name :advanced "changelog"))
(expect "Dataflow"                    (humanization/name->human-readable-name :advanced "dataflow"))
(expect "Bestseller"                  (humanization/name->human-readable-name :advanced "bestseller"))
(expect "Uniques"                     (humanization/name->human-readable-name :advanced "uniques"))
(expect "Cpi"                         (humanization/name->human-readable-name :advanced "cpi"))
(expect "Ctr"                         (humanization/name->human-readable-name :advanced "ctr"))
(expect "Paid To Sparkify"            (humanization/name->human-readable-name :advanced "paid_to_sparkify"))
(expect "Paid To Sparkify"            (humanization/name->human-readable-name :advanced "paidtosparkify"))
(expect "Assassinate"                 (humanization/name->human-readable-name :advanced "assassinate"))
(expect "An Album Cover"              (humanization/name->human-readable-name :advanced "analbumcover"))


;;; :simple humanization
(expect nil                         (humanization/name->human-readable-name :simple nil))
(expect nil                         (humanization/name->human-readable-name :simple ""))
(expect ""                          (humanization/name->human-readable-name :simple "_"))
(expect ""                          (humanization/name->human-readable-name :simple "-"))
(expect "ID"                        (humanization/name->human-readable-name :simple "_id"))
(expect "UID"                       (humanization/name->human-readable-name :simple "uid"))
(expect "UUID"                      (humanization/name->human-readable-name :simple "uuid"))
(expect "GUID"                      (humanization/name->human-readable-name :simple "guid"))
(expect "IP"                        (humanization/name->human-readable-name :simple "ip"))
(expect "URL"                       (humanization/name->human-readable-name :simple "url"))
(expect "Agent Invite Migration"    (humanization/name->human-readable-name :simple "_agent_invite_migration"))
(expect "Agent Invite Migration"    (humanization/name->human-readable-name :simple "-agent-invite-migration"))
(expect "Foobar"                    (humanization/name->human-readable-name :simple "fooBar"))
(expect "Foo Bar"                   (humanization/name->human-readable-name :simple "foo-bar"))
(expect "Foo Bar"                   (humanization/name->human-readable-name :simple "foo_bar"))
(expect "Foo Bar"                   (humanization/name->human-readable-name :simple "foo bar"))
(expect "Dashboardcardsubscription" (humanization/name->human-readable-name :simple "dashboardcardsubscription"))
(expect "Foo ID"                    (humanization/name->human-readable-name :simple "foo_id"))
(expect "Receiver ID"               (humanization/name->human-readable-name :simple "receiver_id"))
(expect "Inbox"                     (humanization/name->human-readable-name :simple "inbox"))
(expect "Acquirer"                  (humanization/name->human-readable-name :simple "acquirer"))
(expect "Auth Authenticator"        (humanization/name->human-readable-name :simple "auth_authenticator"))
(expect "Authprovider"              (humanization/name->human-readable-name :simple "authprovider"))
(expect "Usersocialauth"            (humanization/name->human-readable-name :simple "usersocialauth"))


;;; :none humanization
(expect nil                         (humanization/name->human-readable-name :none nil))
(expect ""                          (humanization/name->human-readable-name :none ""))
(expect "_"                         (humanization/name->human-readable-name :none "_"))
(expect "-"                         (humanization/name->human-readable-name :none "-"))
(expect "_id"                       (humanization/name->human-readable-name :none "_id"))
(expect "uid"                       (humanization/name->human-readable-name :none "uid"))
(expect "uuid"                      (humanization/name->human-readable-name :none "uuid"))
(expect "guid"                      (humanization/name->human-readable-name :none "guid"))
(expect "ip"                        (humanization/name->human-readable-name :none "ip"))
(expect "url"                       (humanization/name->human-readable-name :none "url"))
(expect "_agent_invite_migration"   (humanization/name->human-readable-name :none "_agent_invite_migration"))
(expect "-agent-invite-migration"   (humanization/name->human-readable-name :none "-agent-invite-migration"))
(expect "fooBar"                    (humanization/name->human-readable-name :none "fooBar"))
(expect "foo-bar"                   (humanization/name->human-readable-name :none "foo-bar"))
(expect "foo_bar"                   (humanization/name->human-readable-name :none "foo_bar"))
(expect "foo bar"                   (humanization/name->human-readable-name :none "foo bar"))
(expect "dashboardcardsubscription" (humanization/name->human-readable-name :none "dashboardcardsubscription"))
(expect "foo_id"                    (humanization/name->human-readable-name :none "foo_id"))
(expect "receiver_id"               (humanization/name->human-readable-name :none "receiver_id"))
(expect "inbox"                     (humanization/name->human-readable-name :none "inbox"))
(expect "acquirer"                  (humanization/name->human-readable-name :none "acquirer"))
(expect "auth_authenticator"        (humanization/name->human-readable-name :none "auth_authenticator"))
(expect "authprovider"              (humanization/name->human-readable-name :none "authprovider"))
(expect "usersocialauth"            (humanization/name->human-readable-name :none "usersocialauth"))


;;; Re-humanization

(defn- get-humanized-display-name [actual-name strategy]
  (with-redefs [humanization/humanization-strategy (constantly strategy)]
    (tt/with-temp Table [{table-id :id} {:name actual-name}]
      (db/select-one-field :display_name Table, :id table-id))))

;; check that we get the expected :display_name with advanced humanization *enabled*
(expect "Toucans Are Cool" (get-humanized-display-name "toucansare_cool" "advanced"))
(expect "Toucansare Cool"  (get-humanized-display-name "toucansare_cool" "simple"))
(expect "toucansare_cool"  (get-humanized-display-name "toucansare_cool" "none"))

(expect "Fussy Bird Sightings" (get-humanized-display-name "fussybird_sightings" "advanced"))
(expect "Fussybird Sightings"  (get-humanized-display-name "fussybird_sightings" "simple"))
(expect "fussybird_sightings"  (get-humanized-display-name "fussybird_sightings" "none"))


;; now check that existing tables have their :display_names updated appropriately when the setting
;; `enabled-advanced-humanization` is changed
(defn- switch-strategies-and-get-display-names [actual-name]
  (tu/with-temporary-setting-values [humanization-strategy "advanced"]
    (tt/with-temp Table [{table-id :id} {:name actual-name}]
      (let [display-name #(db/select-one-field :display_name Table, :id table-id)]
        {:initial  (display-name)
         :simple   (do (humanization/humanization-strategy "simple")   (display-name))
         :advanced (do (humanization/humanization-strategy "advanced") (display-name))
         :none     (do (humanization/humanization-strategy "none")     (display-name))}))))
(expect
  {:initial  "Toucans Are Cool"
   :simple   "Toucansare Cool"
   :advanced "Toucans Are Cool"
   :none     "toucansare_cool"}
  (switch-strategies-and-get-display-names "toucansare_cool"))

(expect
  {:initial  "Fussy Bird Sightings"
   :simple   "Fussybird Sightings"
   :advanced "Fussy Bird Sightings"
   :none     "fussybird_sightings"}
  (switch-strategies-and-get-display-names "fussybird_sightings"))


;; check that if we give a field a custom display_name that changing strategy doesn't overwrite it
(defn- switch-strategies-and-get-display-name [initial-strategy new-strategy]
  (tu/with-temporary-setting-values [humanization-strategy initial-strategy]
    (tt/with-temp Table [{table-id :id} {:name "toucansare_cool"}]
      (db/update! Table table-id
        :display_name "My Favorite Table")
      (humanization/humanization-strategy new-strategy)
      (db/select-one-field :display_name Table, :id table-id))))

(expect "My Favorite Table" (switch-strategies-and-get-display-name "advanced" "simple"))
(expect "My Favorite Table" (switch-strategies-and-get-display-name "advanced" "none"))
(expect "My Favorite Table" (switch-strategies-and-get-display-name "simple"   "advanced"))
(expect "My Favorite Table" (switch-strategies-and-get-display-name "simple"   "none"))
(expect "My Favorite Table" (switch-strategies-and-get-display-name "none"     "advanced"))
(expect "My Favorite Table" (switch-strategies-and-get-display-name "none"     "simple"))
