(ns metabase.timeline.schema
  "Malli schemas for the timeline module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::name
  ms/NonBlankString)

(mr/def ::icon
  [:enum "star" "cake" "mail" "mail_at" "warning" "bell" "cloud" "info" "note" "event"])

(mr/def ::time-matters
  :boolean)

(mr/def ::timeline
  "A Timeline as selected from the app DB: every column of `:timeline`."
  [:merge
   ::timeline.update
   [:map {:closed true}
    [:id            ms/PositiveInt]
    [:collection    {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]]])

(mr/def ::timeline.update
  "What an update (or insert) of a Timeline accepts: every column of `:timeline` except `id`, all optional."
  [:map {:closed true}
   [:name          {:optional true} ::name]
   [:description   {:optional true} [:maybe :string]]
   [:icon          {:optional true} ::icon]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived      {:optional true} [:maybe :boolean]]
   [:archived_directly {:optional true} [:maybe :boolean]]
   [:creator_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:default       {:optional true} [:maybe :boolean]]
   [:entity_id     {:optional true} [:maybe :string]]])

(mr/def ::timeline-event
  "A TimelineEvent as selected from the app DB: every column of `:timeline_event`."
  [:merge
   ::timeline-event.update
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::timeline-event.update
  "What an update (or insert) of a TimelineEvent accepts: every column of `:timeline_event` except `id`, all optional."
  [:map {:closed true}
   [:timeline_id  {:optional true} [:maybe ms/PositiveInt]]
   [:name         {:optional true} ::name]
   [:description  {:optional true} [:maybe :string]]
   [:timestamp    {:optional true} ms/TemporalInstant]
   [:time_matters {:optional true} ::time-matters]
   [:timezone     {:optional true} [:maybe :string]]
   [:icon         {:optional true} ::icon]
   [:archived     {:optional true} [:maybe :boolean]]
   [:creator_id   {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id    {:optional true} [:maybe :string]]])

(mr/def ::timeline.changes
  "What an UPDATE of a Timeline writes: the columns of an update, its `:updated_at` also an SQL expression, `(mi/now)`."
  [:merge
   ::timeline.update
   [:map {:closed true}
    [:updated_at {:optional true} [:or ms/TemporalInstant ::h2x/honeysql-expr]]]])

(mr/def ::timeline-event.changes
  "What an UPDATE of a TimelineEvent writes: the columns of an update, its `:updated_at` also an SQL expression,
  `(mi/now)`."
  [:merge
   ::timeline-event.update
   [:map {:closed true}
    [:updated_at {:optional true} [:or ms/TemporalInstant ::h2x/honeysql-expr]]]])

(mr/def ::timeline.create
  "What a new Timeline takes."
  [:map {:closed true}
   [:name          ::name]
   [:creator_id    ::lib.schema.id/user]
   [:default       {:optional true} [:maybe :boolean]]
   [:description   {:optional true} [:maybe :string]]
   [:icon          {:optional true} ::icon]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived      {:optional true} [:maybe :boolean]]])

(mr/def ::timeline-event.create
  "What a new TimelineEvent takes."
  [:map {:closed true}
   [:name         ::name]
   [:timestamp    ms/TemporalInstant]
   [:timeline_id  ms/PositiveInt]
   [:creator_id   ::lib.schema.id/user]
   [:timezone     {:optional true} [:maybe :string]]
   [:description  {:optional true} [:maybe :string]]
   [:time_matters {:optional true} ::time-matters]
   [:icon         {:optional true} ::icon]
   [:archived     {:optional true} [:maybe :boolean]]])

(mr/def ::write-opts
  "The context of a write of Timelines and TimelineEvents: `:archived-with`, the `[model id]` of the archive that
  carries them, and `:import?`, whether a SerDes import writes them."
  [:map {:closed true}
   [:archived-with {:optional true} [:tuple :keyword pos-int?]]
   [:import?       {:optional true} :boolean]])

(mr/def ::external-timeline
  "A Timeline as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::timeline [:archived :archived_directly :default :description :entity_id :icon :name :collection_id :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]
     [:events {:optional true} [:maybe [:sequential [:ref ::external-timeline-event]]]]]]])

(mr/def ::external-timeline-event
  "A TimelineEvent as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::timeline-event [:archived :description :entity_id :icon :name :time_matters :timezone :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]
     [:timestamp {:optional true} [:maybe ::models.schema/external-date]]]]])
