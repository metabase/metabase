(ns metabase-enterprise.support-access-grants.schema
  "Malli schemas for support access grant API request and response bodies."
  (:require
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
  [:map
   [:grant_duration_minutes [:int {:min 1 :max max-grant-duration-minutes}]]
   [:ticket_number {:optional true} [:maybe [:string {:min 1 :max 100}]]]
   [:notes {:optional true} [:maybe [:string {:min 1 :max 255}]]]])

;;; ------------------------------------------- Response Schemas -------------------------------------------

(mr/def ::grant-response
  "Schema for a support access grant object in API responses."
  [:map
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
