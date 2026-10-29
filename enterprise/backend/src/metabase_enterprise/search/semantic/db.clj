(ns metabase-enterprise.search.semantic.db
  "Application database queries for the semantic-search module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.search.semantic.appdb-scoring :as appdb-scoring]
   [metabase-enterprise.search.semantic.schema :as semantic-search.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as search.scoring]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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
  ;; these have to be real SQL literals rather than plain strings: a string compiles to a `?` parameter, and H2 cannot
  ;; work out the type of a parameter in the select list of a CTE (`Unknown data type: "?, ?"`)
  ^:allow-subquery
  {:select [[(h2x/literal (str id))] [(h2x/literal model)]]})

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
  `metabase-enterprise.search.semantic.appdb-scoring/appdb-scorers`), joining the bookmark tables when `:bookmarked`
  is among them."
  [search-results :- [:sequential [:map {:closed true}
                                   [:id [:or :string ms/PositiveInt]]
                                   [:model :string]]]
   search-ctx     :- [:map {:closed true}
                      [:current-user-id {:optional true} [:maybe ms/PositiveInt]]
                      [:context         {:optional true} [:maybe :keyword]]
                      [:weights         {:optional true} [:maybe ::search.config/weights]]
                      [:limit-int       {:optional true} [:maybe ms/Int]]]]
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
