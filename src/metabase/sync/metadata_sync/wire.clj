(ns metabase.sync.metadata-sync.wire
  "The request and response of `POST /api/warehouse/metadata/changes`, as they travel: snake_case keys, Table keys as
  `[schema-or-nil name]` arrays, and string values. The sender and the receiver both use these schemas. A response
  decoded from JSON with keyword keys is in the form the receiver applies."
  (:require
   [metabase.sync.metadata-sync.document :as document]
   [metabase.sync.metadata-sync.links :as links]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.stats :as stats]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::request
  [:map {::mr/deliberately-open true
         :description           (str "a request for the metadata of one Database; a key that this version does not "
                                     "know is ignored, so that a newer receiver is not refused")}
   [:database       ms/NonBlankString]
   [:engine         ms/NonBlankString]
   [:schema_filters {:optional true} [:maybe ::document/schema-filter]]
   [:after          {:optional true} [:maybe ::pages/cursor]]])

(mr/def ::database-batch
  [:merge
   [:map {:closed true}
    [:type [:= "database"]]]
   ::document/database])

(mr/def ::objects-batch
  [:map {:closed true}
   [:type   [:= "objects"]]
   [:tables [:sequential ::document/table]]])

(mr/def ::links-table
  [:map {:closed true}
   [:schema [:maybe :string]]
   [:name   :string]
   [:links  [:sequential {:min 1} ::links/link]]])

(mr/def ::links-batch
  [:map {:closed true}
   [:type   [:= "links"]]
   [:tables [:sequential ::links-table]]])

(mr/def ::stats-table
  [:merge
   [:map {:closed true}
    [:schema [:maybe :string]]
    [:name   :string]]
   ::stats/entry])

(mr/def ::stats-batch
  [:map {:closed true}
   [:type   [:= "stats"]]
   [:tables [:sequential ::stats-table]]])

(mr/def ::batch
  [:multi {:dispatch :type}
   ["database" ::database-batch]
   ["objects"  ::objects-batch]
   ["links"    ::links-batch]
   ["stats"    ::stats-batch]])

(mr/def ::response
  [:map {:closed true}
   [:format_version :int]
   [:batches        [:sequential ::batch]]
   [:next           {:optional true} [:maybe ::pages/cursor]]])

(def database-not-found
  "The error code of a request for a Database the sender does not have, by name and engine. It differs from a plain
  404, which a Metabase without the endpoint returns, so that the caller can say which of the two it is."
  "metadata-sync-database-not-found")

(def database-ambiguous
  "The error code of a request for a Database name and engine that several of the sender's Databases have."
  "metadata-sync-database-ambiguous")

(def database-not-ready
  "The error code of a request for a Database whose first sync on the sender is not complete."
  "metadata-sync-database-not-ready")
