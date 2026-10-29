(ns metabase-enterprise.data-apps.db
  "Application database queries for the data-apps module, so the rest of the module only touches `toucan2.core` for
  model definitions and hydration methods."
  (:require
   [clojure.set :as set]
   [metabase.collections.models.collection :as collection]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.measures.db :as measures.db]
   [metabase.queries.db :as queries.db]
   [metabase.segments.db :as segments.db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def non-blob-columns
  "Every DataApp column except the raw bundle blob."
  [:id :entity_id :name :display_name :description :version :bundle_path :enabled :allowed_hosts
   :resource_collection_id :bundle_hash :created_at :updated_at])

(def ^:private non-blob-model
  (into [:model/DataApp] non-blob-columns))

(mu/defn data-app :- [:maybe ::data-apps.schema/data-app]
  "The ::data-apps.schema/data-app with `data-app-id`, or nil."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one :model/DataApp :id [:auto/param data-app-id]))

(mu/defn data-app-by-slug
  "The DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (t2/select-one non-blob-model :name slug))

(mu/defn data-app-bundle
  "The bundle bytes of the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle [:model/DataApp :bundle] :id data-app-id))

(mu/defn reducible-data-apps-with-bundles
  "A reducible of the DataApp rows, bundles included, whose `filter-column` is one of `filter-ids` (every row when
  `filter-column` is nil), ordered ascending by `order-columns`."
  [filter-column :- [:maybe :keyword]
   filter-ids    :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select [:model/DataApp :*]
                       (cond-> {}
                         filter-column       (assoc :where [:in filter-column filter-ids])
                         (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(mu/defn data-app-exists?
  "Whether a DataApp named `slug` exists."
  [slug :- :string]
  (t2/exists? :model/DataApp :name slug))

(mu/defn resource-collection?
  "Whether the Collection with `collection-id` is the resource collection of a DataApp."
  [collection-id :- pos-int?]
  (t2/exists? :model/DataApp :resource_collection_id collection-id))

(mu/defn other-app-has-collection?
  "Whether a DataApp other than the one with `app-id`, or any when it is nil, has the Collection with `collection-id`."
  [collection-id :- pos-int?
   app-id        :- [:maybe pos-int?]]
  (t2/exists? :model/DataApp :resource_collection_id collection-id :id [:not= (or app-id -1)]))

(mu/defn insert-data-app-returning-pk! :- ms/PositiveInt
  "Insert the DataApp `row`, returning its ID."
  [row :- ::data-apps.schema/data-app.update]
  (t2/insert-returning-pk! :model/DataApp row))

(mu/defn update-data-app!
  "Apply `changes` to the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt
   changes     :- ::data-apps.schema/data-app.update]
  (t2/update! :model/DataApp :id data-app-id changes))

(mu/defn delete-data-app!
  "Delete the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/delete! :model/DataApp :id data-app-id))

(defn resource-collection-ids
  "The IDs of the resource collections owned by data apps."
  []
  (t2/select-fn-set :resource_collection_id :model/DataApp :resource_collection_id [:not= nil]))

(defn delete-resource-collection!
  "Delete the resource collection with `collection-id`."
  [collection-id]
  (t2/delete! :model/Collection :id collection-id))

(mu/defn readable-data-app-ids-select
  "A HoneySQL query of the ids of the DataApps that the User with `user-id` can read: every app for a superuser, else
  the enabled apps whose resource collection they can read."
  [user-id    :- ms/PositiveInt
   superuser? :- :boolean]
  (if superuser?
    ^:allow-subquery {:select [:id] :from [(t2/table-name :model/DataApp)]}
    ^:allow-subquery {:select [:id]
                      :from   [(t2/table-name :model/DataApp)]
                      :where  [:and
                               [:= :enabled true]
                               [:in :resource_collection_id
                                (collection/visible-collection-query
                                 {:permission-level :read :include-archived-items :all}
                                 {:current-user-id user-id :is-superuser? false})]]}))

(mu/defn readable-data-apps
  "The DataApps that the User with `user-id` can read, without their bundles, ordered by display name."
  [user-id    :- ms/PositiveInt
   superuser? :- :boolean]
  (t2/select non-blob-model
             {:where    [:in :id (readable-data-app-ids-select user-id superuser?)]
              :order-by [[:display_name :asc]]}))

(mu/defn external-card-ids :- [:set ::lib.schema.id/card]
  "Among `card-ids`, those of no Card in the collection with `collection-id`."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   card-ids      :- [:set {:min 1} ::lib.schema.id/card]]
  (set/difference card-ids (when collection-id
                             (queries.db/card-ids-in-collections {:card-ids card-ids :collection-ids [collection-id]}))))

(mu/defn external-metric-ids :- [:set ::lib.schema.id/card]
  "Among `card-ids`, those of no metric in the Library's Metrics collection or one of its subcollections."
  [card-ids :- [:set {:min 1} ::lib.schema.id/card]]
  (set/difference card-ids (queries.db/library-metric-ids card-ids)))

(mu/defn external-segment-ids :- [:set ::lib.schema.id/segment]
  "Among `segment-ids`, those of no Segment of a Table published to the Library."
  [segment-ids :- [:set {:min 1} ::lib.schema.id/segment]]
  (set/difference segment-ids (segments.db/published-segment-ids {:segment-ids segment-ids})))

(mu/defn external-measure-ids :- [:set ::lib.schema.id/measure]
  "Among `measure-ids`, those of no Measure of a Table published to the Library."
  [measure-ids :- [:set {:min 1} ::lib.schema.id/measure]]
  (set/difference measure-ids (measures.db/published-measure-ids {:measure-ids measure-ids})))
