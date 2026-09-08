(ns metabase-enterprise.entity-retrieval.db
  "Application database queries for the entity-retrieval module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn library-cards-in-collections :- [:sequential [:map {:closed true}
                                                       [:id          ms/PositiveInt]
                                                       [:name        :string]
                                                       [:description [:maybe :string]]
                                                       [:type        :keyword]
                                                       [:card_schema :int]]]
  "The ID, name, description, and type of the unarchived metric and model Cards in the Collections with
  `collection-ids`, optionally narrowed to just `id`."
  [collection-ids :- [:seqable ms/PositiveInt]
   id             :- [:maybe ms/PositiveInt]]
  (t2/select [:model/Card :id :name :description :type :card_schema]
             {:where [:and
                      [:in :collection_id collection-ids]
                      [:= :archived false]
                      [:in :type ["metric" "model"]]
                      (when id [:= :id id])]}))

(mu/defn library-tables-in-collections :- [:sequential [:map {:closed true}
                                                        [:id           ms/PositiveInt]
                                                        [:name         :string]
                                                        [:display_name [:maybe :string]]
                                                        [:description  [:maybe :string]]]]
  "The ID, names, and description of the active published Tables in the Collections with `collection-ids`, optionally
  narrowed to just `id`."
  [collection-ids :- [:seqable ms/PositiveInt]
   id             :- [:maybe ms/PositiveInt]]
  (t2/select [:model/Table :id :name :display_name :description]
             {:where [:and
                      [:in :collection_id collection-ids]
                      [:= :is_published true]
                      [:= :active true]
                      (when id [:= :id id])]}))

(mu/defn library-measures-of-tables :- [:sequential [:map {:closed true}
                                                     [:id          ms/PositiveInt]
                                                     [:name        :string]
                                                     [:description [:maybe :string]]]]
  "The ID, name, and description of the unarchived Measures on the Tables with `table-ids`, optionally narrowed to
  just `id`."
  [table-ids :- [:seqable ms/PositiveInt]
   id        :- [:maybe ms/PositiveInt]]
  (t2/select [:model/Measure :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      (when id [:= :id id])]}))

(mu/defn library-segments-of-tables :- [:sequential [:map {:closed true}
                                                     [:id          ms/PositiveInt]
                                                     [:name        :string]
                                                     [:description [:maybe :string]]]]
  "The ID, name, and description of the unarchived Segments on the Tables with `table-ids`, optionally narrowed to
  just `id`."
  [table-ids :- [:seqable ms/PositiveInt]
   id        :- [:maybe ms/PositiveInt]]
  (t2/select [:model/Segment :id :name :description]
             {:where [:and
                      [:in :table_id table-ids]
                      [:= :archived false]
                      (when id [:= :id id])]}))

(mu/defn measure-table-id :- [:maybe ms/PositiveInt]
  "The Table ID of the Measure with `id`."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :table_id :model/Measure :id id))

(mu/defn segment-table-id :- [:maybe ms/PositiveInt]
  "The Table ID of the Segment with `id`."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :table_id :model/Segment :id id))

(mu/defn ai-contexts :- [:sequential [:map {:closed true}
                                      [:entity_type     :string]
                                      [:entity_local_id ms/PositiveInt]
                                      [:ai_context      :any]]]
  "The entity type, entity ID, and AI context of every OsiAiContext."
  []
  (t2/select [:model/OsiAiContext :entity_type :entity_local_id :ai_context]))

(mu/defn ai-context :- :any
  "The AI context of the entity of `entity-type` with `entity-local-id`."
  [entity-local-id :- ms/PositiveInt
   entity-type     :- :string]
  (t2/select-one-fn :ai_context :model/OsiAiContext
                    :entity_local_id entity-local-id
                    :entity_type entity-type))
