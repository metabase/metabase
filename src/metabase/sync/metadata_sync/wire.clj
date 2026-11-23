(ns metabase.sync.metadata-sync.wire
  "The request and response of `POST /api/warehouse/metadata/changes`, as they travel: snake_case keys, Table keys as
  `[schema-or-nil name]` arrays, and string values. The sender and the receiver both use these schemas. A response
  decoded from JSON with keyword keys is in the form the receiver applies.

  A sender and a receiver can be of different versions, so the maps are open: a receiver leaves out a key, a batch
  type or a link kind that it does not know, and a sender ignores a key of the request that it does not know. A
  receiver does not read a cursor: it passes on the one of the answer, which only the sender reads."
  (:require
   [metabase.sync.metadata-sync.links :as links]
   [metabase.sync.metadata-sync.stats :as stats]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def format-version
  "The version of the shape of what one Metabase sends another. A request names the versions its receiver reads, and a
  sender answers in one of them; a request that names none is from a receiver that reads version 1. A receiver
  refuses an answer of a version it does not read."
  1)

(def first-format-version
  "The version that a receiver reads when its request names none: the first one."
  1)

(def database-columns
  "The Database columns that are sent. `default_schema` is not one: it depends on the login, so each instance reads
  its own."
  [:dbms_version :timezone])

(mr/def ::database
  [:map
   [:dbms_version {:optional true} [:map {:description "the version a driver reports, in its shape"}]]
   [:timezone     {:optional true} :string]])

(mu/defn database-values :- ::database
  "The values of `database`, a Database row, that are sent: each of [[database-columns]] that has one."
  [database :- [:map {:description "a Database row"}]]
  (u/remove-nils (select-keys database database-columns)))

(mr/def ::cursor
  "A cursor as it travels: the sender wrote it and reads it, and a receiver passes it on as it is. `:closed false`
  keeps every key of it through the API's decoding, which leaves out the keys a map schema does not name."
  [:map {:closed false, :description "the cursor of an answer, which only the sender that wrote it reads"}])

(mr/def ::request
  [:map {:description (str "a request for the metadata of one Database; a key that this version does not "
                           "know is ignored, so that a newer receiver is not refused")}
   [:database        ms/NonBlankString]
   [:engine          ms/NonBlankString]
   [:format_versions {:optional true} [:sequential {:min 1} :int]]
   [:schema_filters  {:optional true} [:maybe ::tables/schema-filter]]
   [:after           {:optional true} [:maybe ::cursor]]])

(mr/def ::database-batch
  [:merge
   [:map
    [:type [:= "database"]]]
   ::database])

(mr/def ::tables-batch
  [:map
   [:type   [:= "tables"]]
   [:tables [:sequential ::tables/table]]])

(mr/def ::links-table
  [:map
   [:schema [:maybe :string]]
   [:name   :string]
   [:links  [:sequential {:min 1} ::links/link]]])

(mr/def ::links-batch
  [:map
   [:type   [:= "links"]]
   [:tables [:sequential ::links-table]]])

(mr/def ::stats-table
  [:merge
   [:map
    [:schema [:maybe :string]]
    [:name   :string]]
   ::stats/entry])

(mr/def ::stats-batch
  [:map
   [:type   [:= "stats"]]
   [:tables [:sequential ::stats-table]]])

(def batch-types
  "The batch types this version sends and applies. A receiver leaves out a batch of another type: a newer sender
  sends it."
  #{"database" "tables" "links" "stats"})

(mr/def ::batch
  [:multi {:dispatch :type}
   ["database"          ::database-batch]
   ["tables"            ::tables-batch]
   ["links"             ::links-batch]
   ["stats"             ::stats-batch]
   [:malli.core/default [:map {:description "a batch of a type that only a newer version knows"}
                         [:type ms/NonBlankString]]]])

(mr/def ::response
  "An answer. It names the Database of its request, by `database` and `engine`, so that a receiver can refuse an
  answer that is for another Database."
  [:map
   [:format_version :int]
   [:database       ms/NonBlankString]
   [:engine         ms/NonBlankString]
   [:batches        [:sequential ::batch]]
   [:next           {:optional true} [:maybe ::cursor]]])

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

(def format-version-not-read
  "The error code of a request whose receiver reads none of the format versions that the sender writes."
  "metadata-sync-format-version-not-read")

(def bad-cursor
  "The error code of a request with a cursor that the sender does not read: one that another version wrote."
  "metadata-sync-bad-cursor")
