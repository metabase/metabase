(ns metabase.sync.metadata-sync.wire
  "The request and response of `POST /api/warehouse/metadata/changes`, as they travel: snake_case keys, Table keys as
  `[schema-or-nil name]` arrays, and string values. The sender and the receiver both use these schemas. A response
  decoded from JSON with keyword keys is in the form the receiver applies."
  (:require
   [metabase.sync.metadata-sync.links :as links]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.stats :as stats]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def format-version
  "The version of the shape of what one Metabase sends another. A receiver refuses another version."
  1)

(def database-columns
  "The Database columns that are sent. `default_schema` is not one: it depends on the login, so each instance reads
  its own."
  [:dbms_version :timezone])

(mr/def ::database
  [:map {:closed true}
   [:dbms_version {:optional true} [:map {:description "the version a driver reports, in its shape"}]]
   [:timezone     {:optional true} :string]])

(mu/defn database-values :- ::database
  "The values of `database`, a Database row, that are sent: each of [[database-columns]] that has one."
  [database :- [:map {:description "a Database row"}]]
  (u/remove-nils (select-keys database database-columns)))

(mr/def ::request
  [:map {:description (str "a request for the metadata of one Database; a key that this version does not "
                           "know is ignored, so that a newer receiver is not refused")}
   [:database       ms/NonBlankString]
   [:engine         ms/NonBlankString]
   [:schema_filters {:optional true} [:maybe ::tables/schema-filter]]
   [:after          {:optional true} [:maybe ::pages/cursor]]])

(mr/def ::database-batch
  [:merge
   [:map {:closed true}
    [:type [:= "database"]]]
   ::database])

(mr/def ::tables-batch
  [:map {:closed true}
   [:type   [:= "tables"]]
   [:tables [:sequential ::tables/table]]])

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
   ["tables"   ::tables-batch]
   ["links"    ::links-batch]
   ["stats"    ::stats-batch]])

(mr/def ::response
  "An answer. It names the Database of its request, by `database` and `engine`, so that a receiver can refuse an
  answer that is for another Database."
  [:map {:closed true}
   [:format_version :int]
   [:database       ms/NonBlankString]
   [:engine         ms/NonBlankString]
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

(def bad-schema-filter
  "The error code of a request whose schema filter cannot be read as patterns."
  "metadata-sync-bad-schema-filter")
