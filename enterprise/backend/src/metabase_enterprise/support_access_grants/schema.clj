(ns metabase-enterprise.support-access-grants.schema
  "Malli schemas for support access grant API request and response bodies."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; Maximum grant duration in minutes (7 days = 168 hours = 10080 minutes)
(def max-grant-duration-minutes
  "The maximum duration of an access grant in minutes"
  10080)

(mr/def ::timestamp
  [:or
   (ms/InstanceOfClass java.time.OffsetDateTime)
   (ms/InstanceOfClass java.time.ZonedDateTime)])

;;; ------------------------------------------- Request Schemas -------------------------------------------

(mr/def ::create-grant-request
  "Schema for POST /api/ee/support-access-grants request body."
  [:map {:closed true}
   [:grant_duration_minutes [:int {:min 1 :max max-grant-duration-minutes}]]
   [:ticket_number {:optional true} [:maybe [:string {:min 1 :max 100}]]]
   [:notes {:optional true} [:maybe [:string {:min 1 :max 255}]]]])

;;; ------------------------------------------- Response Schemas -------------------------------------------

(mr/def ::grant-response
  "Schema for a support access grant object in API responses."
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:user_id ms/PositiveInt]
   [:user_name [:maybe :string]]
   [:user_email [:maybe :string]]
   [:ticket_number [:maybe :string]]
   [:notes [:maybe :string]]
   [:grant_start_timestamp ::timestamp]
   [:grant_end_timestamp ::timestamp]
   [:revoked_at [:maybe ::timestamp]]
   [:revoked_by_user_id [:maybe ms/PositiveInt]]
   [:created_at ::timestamp]
   [:updated_at ::timestamp]
   [:token {:optional true} [:maybe :string]]])

(mr/def ::list-grants-response
  "Schema for GET /api/ee/support-access-grants response (paginated list)."
  [:map
   [:data [:sequential ::grant-response]]
   [:total nat-int?]
   [:limit ms/PositiveInt]
   [:offset nat-int?]])

(mr/def ::current-grant-response
  "Schema for GET /api/ee/support-access-grants/current response."
  [:maybe ::grant-response])

(mr/def ::support-access-grant-log
  "A SupportAccessGrantLog as selected from the app DB: every column of `:support_access_grant_log`."
  [:merge
   ::support-access-grant-log.columns
   [:map {:closed true}
    [:id                    ms/PositiveInt]]])

(mr/def ::support-access-grant-log.columns
  "Every column of `:support_access_grant_log` except `id`, all optional."
  [:map {:closed true}
   [:user_id               {:optional true} [:maybe ::lib.schema.id/user]]
   [:ticket_number         {:optional true} [:maybe :string]]
   [:notes                 {:optional true} [:maybe :string]]
   [:grant_start_timestamp {:optional true} [:maybe ms/TemporalInstant]]
   [:grant_end_timestamp   {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:revoked_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:revoked_by_user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::support-access-grant-log.create
  "What an insert of a SupportAccessGrantLog accepts: identity, ownership and timing, nothing revocation-related."
  (mut/select-keys (mr/schema ::support-access-grant-log.columns)
                   [:user_id :ticket_number :notes :grant_start_timestamp :grant_end_timestamp]))

(mr/def ::support-access-grant-log.update
  "What an update of a SupportAccessGrantLog accepts: every column but `id`, `user_id` and `created_at`, which do not change."
  (mut/select-keys (mr/schema ::support-access-grant-log.columns)
                   [:ticket_number :notes :grant_start_timestamp :grant_end_timestamp
                    :revoked_at :revoked_by_user_id :updated_at]))

(mr/def ::support-access-grant-log.partial
  "A SupportAccessGrantLog row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::support-access-grant-log [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::support-access-grant-log.column
  "A column of `support_access_grant_log`, for the `:columns` option of the queries in
  [[metabase-enterprise.support-access-grants.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::support-access-grant-log.columns))))
