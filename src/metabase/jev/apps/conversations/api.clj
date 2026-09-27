(ns metabase.jev.apps.conversations.api
  "`/api/jev/conversations/…` endpoints for the Metabot conversation review. Superuser only: reviews summarize
  conversation content."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.jev.apps.conversations :as conversations]
   [metabase.jev.db :as jev.db]
   [metabase.jev.task.conversation-review-backfill :as review-backfill]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private BackfillStatus
  [:map
   [:pending ms/IntGreaterThanOrEqualToZero]
   [:scored  ms/IntGreaterThanOrEqualToZero]
   [:version :string]])

(api.macros/defendpoint :get "/conversations/backfill" :- BackfillStatus
  "How many conversations still need a review, and how many have a current one."
  []
  (api/check-superuser)
  (conversations/backfill-status))

(api.macros/defendpoint :post "/conversations/backfill" :- BackfillStatus
  "Start a review pass now. With `force`, every existing review is marked stale and re-scored first."
  [_route-params
   _query-params
   {:keys [force]} :- [:maybe [:map {:closed true} [:force {:optional true} [:maybe :boolean]]]]]
  (api/check-superuser)
  (when force
    (conversations/mark-all-stale!))
  (review-backfill/kick!)
  (conversations/backfill-status))

(api.macros/defendpoint :post "/conversations/:id/score" :- :any
  "Review one conversation now and return its stored review."
  [{:keys [id]} :- [:map {:closed true} [:id ms/UUIDString]]]
  (api/check-superuser)
  (api/check-404 (jev.db/conversation-exists? id))
  (let [{:keys [status error reason]} (conversations/score! id)]
    (case status
      :scored  (jev.db/review id)
      :skipped (throw (ex-info (str "Conversation not reviewable: " (name reason)) {:status-code 409}))
      (throw (ex-info (str "Review failed: " error) {:status-code 502})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/conversations/…` routes."
  (api.macros/ns-handler *ns*))
