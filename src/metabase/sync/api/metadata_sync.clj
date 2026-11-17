(ns metabase.sync.api.metadata-sync
  "`/api/warehouse/metadata/*` endpoints, which an app calls to copy the warehouse metadata of a Database from one
  Metabase, the sender, to another, the receiver. No Metabase calls another: the app carries each request and answer.

  - On the sender: `POST /metadata/changes` answers a request with the next page of the metadata.
  - On the receiver: `POST /metadata/request` builds the next request, and `POST /metadata/apply` applies an answer.

  The app repeats `request`, `changes` and `apply` while the result of `apply` has a `next` cursor."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.receive :as receive]
   [metabase.sync.metadata-sync.send :as send]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/metadata/changes" :- ::wire/response
  "The next page of the warehouse metadata of the Database named `database`, with the engine `engine`, from the
  cursor `after`, or from the start without one. The first answer holds the database values, then the tables (each
  Table with its Fields), the links (FK targets) and the stats (row counts and field values) follow, in that order, a page
  at a time. Ask again with the answer's `next` while it has one. Needs a superuser.

  Errors, each with an `error-code` in the body, so that a caller can tell them from a 404 of a Metabase without this
  endpoint:

  - 404 `metadata-sync-database-not-found`: no Database has exactly this name and engine. Stub Databases and the
    destination Databases of database routing are left out.
  - 409 `metadata-sync-database-ambiguous`: several Databases have this name and engine.
  - 422 `metadata-sync-database-not-ready`: the Database's first sync is not complete."
  [_route-params
   _query-params
   body :- ::wire/request]
  (api/check-superuser)
  (send/changes-response body))

(api.macros/defendpoint :post "/metadata/request" :- ::wire/request
  "The request to send to the other Metabase's `POST /api/warehouse/metadata/changes` for the metadata of the Database
  with `database_id`, from the cursor `after`. Needs a superuser.

  Errors: 404 `metadata-sync-no-database`, and 400 `metadata-sync-database-not-loadable` for a stub Database or the
  audit Database."
  [_route-params
   _query-params
   {:keys [database_id after]} :- [:map {:closed true}
                                   [:database_id ::lib.schema.id/database]
                                   [:after       {:optional true} [:maybe ::pages/cursor]]]]
  (api/check-superuser)
  (receive/request database_id after))

(api.macros/defendpoint :post "/metadata/apply" :- ::receive/result
  "Apply `response`, the other Metabase's answer to a request from `POST /api/warehouse/metadata/request`, to the
  Database with `database_id`. A seed only adds: it inserts the Tables the Database has no row for, with their Fields,
  and fills FK targets, row counts and field values that are empty. Returns the cursor of the next request, `next`,
  when there is one, and counts of what it did. Each inserted Table counts as synced at once, and after the last
  answer the Database does too, also when that answer has no batches. Needs a superuser.

  An answer is applied in one transaction, so a refused answer writes nothing and can be sent again. Do not run a sync
  of the Database during a seed: both insert Tables, and the second insert of one key fails.

  Errors: the ones of `POST /api/warehouse/metadata/request`, and 422 for an answer it does not apply:
  `metadata-sync-format-version-differs`, `metadata-sync-unknown-batch-type` and `metadata-sync-malformed-response`
  before any write, and `metadata-sync-apply-failed` for a write that failed. No message holds the answer's values."
  [_route-params
   _query-params
   {:keys [database_id response]} :- [:map {:closed true}
                                      [:database_id ::lib.schema.id/database]
                                      [:response    [:map {:closed                false
                                                           ::mr/deliberately-open true
                                                           :description           (str "the other Metabase's answer, "
                                                                                       "which the receiver checks")}]]]]
  (api/check-superuser)
  (receive/apply-response! database_id response))
