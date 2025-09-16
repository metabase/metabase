(ns metabase-enterprise.dependencies.api
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase.analyze.core :as analyze]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.driver :as driver]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.core :as native-query-snippets]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::card-body
  [:map
   [:id              {:optional false} ms/PositiveInt]
   [:dataset_query   {:optional true}  [:maybe ms/Map]]
   [:type            {:optional true}  [:maybe ::queries.schema/card-type]]
   [:result_metadata {:optional true}  [:maybe analyze/ResultsMetadata]]])

(defn- broken-cards-response
  [{:keys [card transform]}]
  (let [broken-card-ids (keys card)
        broken-cards (when (seq broken-card-ids)
                       (-> (t2/select :model/Card :id [:in broken-card-ids])
                           (t2/hydrate [:collection :effective_ancestors] :dashboard)))
        broken-transform-ids (keys transform)
        broken-transforms (when (seq broken-transform-ids)
                            (t2/select :model/Transform :id [:in broken-transform-ids]))]
    {:success   (and (empty? broken-card-ids)
                     (empty? broken-transform-ids))
     :bad_cards (into [] (comp (filter (fn [card]
                                         (if (mi/can-read? card)
                                           card
                                           (do (log/warnf "Eliding broken card %d - not readable by the user" (:id card))
                                               nil))))
                               (map (fn [card]
                                      (-> card
                                          collection.root/hydrate-root-collection
                                          (update :dashboard #(some-> % (select-keys [:id :name])))))))
                      broken-cards)
     :bad_transforms (into [] broken-transforms)}))

(api.macros/defendpoint :post "/check_card"
  "Check a proposed edit to a card, and return the card IDs for those cards this edit will break."
  [_route-params
   _query-params
   body :- ::card-body]
  (let [database-id    (-> body :dataset_query :database)
        base-provider  (lib-be.metadata.jvm/application-database-metadata-provider database-id)
        original       (lib.metadata/card base-provider (:id body))
        card           (-> original
                           (assoc :dataset-query (:dataset_query body)
                                  :type          (:type body (:type original)))
                           ;; Remove the old `:result-metadata` from the card, it's likely wrong now.
                           (dissoc :result-metadata)
                           ;; But if the request includes `:result_metadata`, use that. It may be from a native card
                           ;; that's been run before saving the card.
                           (cond-> #_card
                            (:result_metadata body) (assoc :result-metadata (:result_metadata body))))
        edits          {:card [card]}
        breakages      (dependencies/errors-from-proposed-edits base-provider edits)]
    (broken-cards-response breakages)))

(mr/def ::transform-body
  [:map
   [:id     {:optional false} ms/PositiveInt]
   [:name   {:optional true}  :string]
   [:source {:optional true}  [:maybe ms/Map]]
   [:target {:optional true}  [:maybe ms/Map]]])

(api.macros/defendpoint :post "/check_transform"
  "Check a proposed edit to a transform, and return the card, transform, etc. IDs for things that will break."
  [_route-params
   _query-params
   {:keys [id source target] :as body} :- ::transform-body]
  (let [database-id   (-> source :query :database)
        base-provider (lib-be.metadata.jvm/application-database-metadata-provider database-id)
        original      (lib.metadata/transform base-provider id)
        transform     (-> original
                          (cond-> #_transform source (assoc :source source))
                          (cond-> #_transform target (assoc :target target)))
        edits         {:transform [transform]}
        breakages     (dependencies/errors-from-proposed-edits base-provider edits)]
    (broken-cards-response breakages)))

(defn- card-uses-snippet?
  [card {snippet-id :id snippet-name :name}]
  (let [template-tags (-> card :dataset_query :native :template-tags vals)]
    (some #(and (= (:type %) :snippet)
                (or (= (:snippet-id %) snippet-id)
                    (= (:name %) snippet-name))) template-tags)))

(defn- calculate-native-result-metadata
  [metadata-provider query]
  (let [driver (:engine (lib.metadata/database metadata-provider))]
    (qp.setup/with-qp-setup [query (lib/query metadata-provider query)]
      (->> (qp.compile/compile-with-inline-parameters query)
           :query
           (driver/native-result-metadata driver metadata-provider)))))

(defn- reset-result-metadata-if-uses-snippet
  [mp card-id snippet]
  (let [card (lib.metadata/card mp card-id)]
    (cond-> card
      (card-uses-snippet? card snippet)
      (assoc :result-metadata (calculate-native-result-metadata mp (:dataset_query card))))))

(defn- broken-by-snippet
  [database-id snippet]
  (let [;; TODO: This sucks - it's getting all cards for the same database_id, which is slow and over-reaching.
        all-cards      (t2/select-fn-set :id :model/Card :database_id database-id :archived false)
        all-transforms (t2/select-fn-set :id :model/Transform)
        base-mp        (doto (lib-be.metadata.jvm/application-database-metadata-provider database-id)
                         (lib.metadata.protocols/store-metadata! snippet))
        updated-cards  (map #(reset-result-metadata-if-uses-snippet base-mp % snippet) all-cards)
        provider       (doto (lib.metadata.cached-provider/cached-metadata-provider base-mp)

                         (lib.metadata.protocols/store-metadatas! updated-cards))]
    ;; FIXME: Implement this properly.
    {}
    #_(dependencies/check-cards-have-sound-refs provider all-cards all-transforms)))

(api.macros/defendpoint :post "/check_snippet"
  "Check a proposed edit to a native snippet, and return the cards, etc. which will be broken."
  [_route-params
   _query-params
   {:keys [id content], snippet-name :name}
   :- [:map
       [:id      {:optional false} ms/PositiveInt]
       [:name    {:optional true}  native-query-snippets/NativeQuerySnippetName]
       [:content {:optional true}  :string]]]
  (let [original  (t2/select-one :model/NativeQuerySnippet id)
        _         (when (and snippet-name
                             (not= snippet-name (:name original))
                             (t2/exists? :model/NativeQuerySnippet :name snippet-name))
                    (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                                    {:status-code 400})))
        snippet   (cond-> (m/assoc-some original
                                        :lib/type :metadata/native-query-snippet
                                        :name snippet-name
                                        :content content)
                    content native-query-snippets/add-template-tags)
        breakages (->> (t2/select-fn-vec :id :model/Database)
                       (map #(broken-by-snippet % snippet))
                       (apply merge-with merge))]
    (broken-cards-response breakages)))

(defn- table-field-mapping
  [from-fields to-fields]
  (let [to-name->id (into {} (map (juxt :name :id)) to-fields)]
    (for [{from-id :id, from-name :name} from-fields]
      (if-let [to-id (to-name->id from-name)]
        [from-id to-id]
        (throw (ex-info (tru "Schemas do not match: Field ''{0}'' not found in destination table." from-name)
                        {:status-code 400}))))))

(defn- replace-table-ids-in-query
  [query table-mapping]
  (lib.walk/walk
   query
   (fn [_query _path-type _path stage-or-join]
     (let [new-table-id (-> stage-or-join :source-table table-mapping)]
       (cond-> stage-or-join
         new-table-id (assoc :source-table new-table-id))))))

(defn- replace-field-ids-in-query
  [query field-mapping]
  (lib.walk/walk-clauses
   query
   (fn [_query _path-type _path clause]
     (when (lib.util/field-clause? clause)
       (let [new-id  (-> clause (get 2) field-mapping)
             clause' (cond-> clause
                       new-id (assoc 2 new-id))]
         (lib.options/update-options
          clause'
          (fn [opts]
            (let [new-source-field-id (-> opts :source-field field-mapping)]
              (cond-> opts
                new-source-field-id (assoc :source-field new-source-field-id))))))))))

(defn- update-table-and-field-refs [query table-mapping field-mapping]
  (-> query
      (replace-table-ids-in-query table-mapping)
      (replace-field-ids-in-query field-mapping)))

(defn- update-card-table-refs
  [metadata-provider card table-mapping field-mapping]
  (let [query (lib/query metadata-provider (:dataset_query card))
        query' (update-table-and-field-refs query table-mapping field-mapping)]
    (when (not= query' query)
      ;; we are not ready to change the format of existing cards yet
      #_{:clj-kondo/ignore [:discouraged-var]}
      (t2/update! :model/Card (:id card) {:dataset_query (lib/->legacy-MBQL query')}))))

(defn- update-transform-table-refs
  [metadata-provider transform table-mapping field-mapping]
  (let [source-query (lib/query metadata-provider (:source transform))
        query'       (update-table-and-field-refs source-query table-mapping field-mapping)]
    (when (not= query' source-query)
      ;; other parts of the code are saving transforms in legacy format
      #_{:clj-kondo/ignore [:discouraged-var]}
      (t2/update! :model/Transform (:id transform) {:source (lib/->legacy-MBQL query')}))))

(api.macros/defendpoint :post "/switch_tables"
  "Replace references to a table and its fields to references to another table and the corresponding fields of that.
  The replacement happens in cards and transforms."
  [_route-params
   _query-params
   {:keys [table_mapping]} :- [:map [:table_mapping [:sequential [:tuple ::lib.schema.id/table ::lib.schema.id/table]]]]]
  (api/check-superuser)
  (if-let [table-id-map (not-empty (into {} (remove (fn [[from to]] (= from to))) table_mapping))]
    (let [_ (when (not= (count table_mapping) (count table-id-map))
              (api/throw-invalid-param-exception :table_mapping (tru "Duplicate ''from'' tables in table_mapping.")))
          all-table-ids (not-empty (into #{} (mapcat identity) table-id-map))
          _ (when (not= (t2/count :model/Table :id [:in all-table-ids])
                        (count all-table-ids))
              (api/throw-invalid-param-exception :table_mapping (tru "One or more table IDs do not exist.")))
          [db-id & db-ids] (t2/select-fn-set :db_id
                                             [:model/Table [[:distinct :db_id]]]
                                             {:where [:in :id all-table-ids]
                                              :limit 2})
          _ (when db-ids
              (api/throw-invalid-param-exception
               :table_mapping (tru "table_mapping should map tables in the same database")))
          table-id->fields (->> (t2/select [:model/Field :id :name :table_id] :table_id [:in all-table-ids])
                                (group-by :table_id))
          field-mapping (into {} (mapcat (fn [[from-id to-id]]
                                           (table-field-mapping (table-id->fields from-id) (table-id->fields to-id))))
                              table-id-map)
          metadata-provider (lib-be.metadata.jvm/application-database-metadata-provider db-id)]
      (run! #(update-card-table-refs metadata-provider % table-id-map field-mapping)
            (t2/reducible-select :model/Card :database_id db-id))
      (reduce (fn [_ transform]
                (when (= (-> transform :source :database) db-id)
                  (update-transform-table-refs metadata-provider transform table-id-map field-mapping)
                  nil))
              nil
              (t2/reducible-select :model/Transform))
      {:success true})
    {:success true}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/dependencies` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
