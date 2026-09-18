(ns metabase-enterprise.semantic-search.db
  "Application database queries for the semantic-search module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.semantic-search.appdb-scoring :as appdb-scoring]
   [metabase-enterprise.semantic-search.schema :as semantic-search.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.search.scoring :as search.scoring]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn library-root-collections
  "The ID and type of the top-level Collections whose type is one of `types`."
  [types :- [:sequential :string]]
  (t2/select [:model/Collection :id :type] :type [:in types] :location "/"))

(mu/defn descendant-collection-ids
  "The IDs of the Collections under the top-level Collection with `root-id`."
  [root-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Collection :location [:like (str "/" root-id "/%")]))

(mu/defn curated-tables-reducible
  "Reducible ID, published flag, data layer, and data authority of the active Tables that are published or
  authoritative."
  []
  (t2/reducible-select [:model/Table :id :is_published :data_layer :data_authority]
                       {:from [(warehouse-schema-overlay/table-query)]
                        :where [:and
                                [:= :active true]
                                [:or [:= :is_published true]
                                 [:= :data_authority ^:allow-raw-sql [:inline "authoritative"]]]]}))

(mu/defn official-collection-ids
  "The IDs of the official Collections."
  []
  (t2/select-pks-set :model/Collection :authority_level :official))

(mu/defn unarchived-dashboard-ids-in-collections-reducible
  "Reducible `:id` rows of the unarchived Dashboards in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/reducible-select [:model/Dashboard :id]
                       {:where [:and [:= :archived false]
                                [:in :collection_id collection-ids]]}))

(mu/defn collection-owners-and-locations
  "The ID, owner, and location of the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select [:model/Collection :id :personal_owner_id :location] :id [:in collection-ids]))

(mu/defn personal-collection-owners
  "The ID and owner of the personal Collections among `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select [:model/Collection :id :personal_owner_id]
             :id [:in collection-ids]
             :personal_owner_id [:not= nil]))

(mu/defn collection-locations
  "The ID and location of the raw collection rows with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select [:collection :id :location] :id [:in collection-ids]))

(mu/defn instances
  "The instances of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select model :id [:in ids]))

(defn- search-doc-select
  [{:keys [id model]}]
  ^:allow-subquery
  {:select [[^:allow-raw-sql [:inline (str id)]] [^:allow-raw-sql [:inline model]]]})

(defn- search-index-select
  "A `search_index` CTE selecting the `:id` and `:model` of each of `search-results` (each `{:id :model}`)."
  [search-results]
  {:with   [[[:search_index ^:allow-subquery {:columns [:model_id :model]}]
             ;; We could use :values here, except MySQL uses a slightly different syntax and I can't seem to get
             ;; honeysql to generate a valid WITH ... VALUES statement for MySQL, so fallback to UNION + SELECT
             ;; which works with all supported appdbs. https://dev.mysql.com/doc/refman/8.4/en/values.html
             ^:allow-subquery
             {:union (map search-doc-select search-results)}]]
   :select [[[:cast :search_index.model_id (if (= :mysql (mdb/db-type)) :unsigned :int)] :id]
            [:search_index.model :model]]
   :from   [:search_index]})

(mu/defn appdb-scored-rows
  "The `:id`/`:model` rows of `search-results` augmented with the app-DB scorers of `search-ctx` (see
  `metabase-enterprise.semantic-search.appdb-scoring/appdb-scorers`), joining the bookmark tables when `:bookmarked`
  is among them."
  [search-results :- [:sequential [:map {:closed true}
                                   [:id [:or :string ms/PositiveInt]]
                                   [:model :string]]]
   search-ctx     :- [:map
                      [:current-user-id {:optional true} [:maybe ms/PositiveInt]]
                      [:context {:optional true} [:maybe :keyword]]
                      [:weights {:optional true} [:maybe [:map-of :keyword number?]]]]]
  (let [scorers (appdb-scoring/appdb-scorers search-ctx)]
    (t2/query (cond-> (search.scoring/with-scores search-ctx scorers (search-index-select search-results))
                (:bookmarked scorers) (search.scoring/join-bookmarks (:current-user-id search-ctx))))))

(mu/defn insert-token-tracking!
  "Insert the SemanticSearchTokenTracking `row`."
  [row :- (mut/select-keys ::semantic-search.schema/semantic-search-token-tracking.update [:model_name :request_type :total_tokens])]
  (t2/insert! :model/SemanticSearchTokenTracking row))

(mu/defn delete-token-tracking-created-before!
  "Delete the SemanticSearchTokenTracking rows created before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/SemanticSearchTokenTracking {:where [:< :created_at cutoff]}))
