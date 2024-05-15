(ns ^:deprecated metabase.query-processor.middleware.fetch-source-query-legacy
  "LEGACY IMPLEMENTATION of [[metabase.query-processor.middleware.fetch-source-query]], will be removed soon."
  (:require
   [clojure.set :as set]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.util :as driver.u]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.persisted-cache :as qp.persisted]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;; These next two schemas are for validating the intermediate stages of the middleware. We don't need to validate the
;; entire query
(def ^:private SourceQueryAndMetadata
  [:map
   [:source-query    mbql.s/SourceQuery]
   [:database        ::mbql.s/DatabaseID]
   [:source-metadata [:maybe [:sequential mbql.s/SourceQueryMetadata]]]
   [:source-query/model?   {:optional true} :boolean]
   [:persisted-info/native {:optional true} :string]])

(defn- source-query
  "Get the query to be run from the card"
  [{dataset-query :dataset-query, card-id :id, :as card}]
  (let [dataset-query (cond-> dataset-query
                        (:lib/type dataset-query) lib.convert/->legacy-MBQL)
        {db-id                                           :database
         mbql-query                                      :query
         {template-tags :template-tags :as native-query} :native} dataset-query]
    (or
     mbql-query
     ;; rename `:query` to `:native` because source queries have a slightly different shape
     (when-some [native-query (set/rename-keys native-query {:query :native})]
       (let [mongo? (= (driver.u/database->driver db-id) :mongo)]
         (cond-> native-query
           ;; MongoDB native queries consist of a collection and a pipelne (query)
           mongo? (update :native (fn [pipeline] {:collection (:collection native-query)
                                                  :query      pipeline}))
           (empty? template-tags) (dissoc :template-tags))))
     (throw (ex-info (tru "Missing source query in Card {0}" card-id)
                     {:card card, :dataset-query dataset-query})))))

(mu/defn card-id->source-query-and-metadata :- SourceQueryAndMetadata
  "Return the source query info for Card with `card-id`. Pass true as the optional second arg `log?` to enable
  logging. (The circularity check calls this and will print more than desired)"
  ([card-id :- ::lib.schema.id/card]
   (card-id->source-query-and-metadata card-id false))

  ([card-id :- ::lib.schema.id/card log? :- :boolean]
   (let [;; todo: we need to cache this. We are running this in preprocess, compile, and then again
         card           (or (lib.metadata/card (qp.store/metadata-provider) card-id)
                            (throw (ex-info (tru "Card {0} does not exist." card-id)
                                            {:card-id card-id})))
         persisted-info (:lib/persisted-info card)
         {{database-id :database} :dataset-query
          result-metadata         :result-metadata
          card-type               :type} card
         persisted?     (qp.persisted/can-substitute? card persisted-info)
         source-query   (source-query card)]
     (when (and persisted? log?)
       (log/infof "Found substitute cached query for card %s from %s.%s"
                  card-id
                  (ddl.i/schema-name {:id database-id} (public-settings/site-uuid))
                  (:table-name persisted-info)))
     ;; log the query at this point, it's useful for some purposes
     (log/debugf "Fetched source query from Card %s:\n%s" card-id (u/pprint-to-str 'yellow source-query))
     (cond-> {:source-query    (cond-> source-query
                                 ;; This will be applied, if still appropriate, by the peristence middleware
                                 persisted?
                                 (assoc :persisted-info/native
                                        (qp.persisted/persisted-info-native-query
                                         (u/the-id (lib.metadata/database (qp.store/metadata-provider)))
                                         persisted-info)))
              :database        database-id
              :source-metadata (seq (map mbql.normalize/normalize-source-metadata result-metadata))}
       (= card-type :model) (assoc :source-query/model? true)))))
