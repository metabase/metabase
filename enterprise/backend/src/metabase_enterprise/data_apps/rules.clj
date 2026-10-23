(ns metabase-enterprise.data-apps.rules
  "The Library-only rules a data app's requests are held to: it reads only tables published to the Library, the metrics
  in the Library and the cards in data apps' collections, through MBQL queries alone."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.queries.core :as queries]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- refusal
  "A 403 error refusing a data app's request, with `message` and, when given, the `cause` of the refusal."
  ([message]
   (ex-info message {:status-code 403}))
  ([message cause]
   (ex-info message {:status-code 403} cause)))

(defn- refuse-cards!
  "Throws a 403 naming the cards with `card-ids`, which a data app may not read."
  [metadata-providerable card-ids]
  (throw (refusal (tru "A data app can read only the cards of data apps and the metrics in the Library, not {0}."
                       (queries/card-labels metadata-providerable card-ids)))))

(defn- check-lib-query!
  "Throws unless `query` and the cards it uses, which aren't among `checked-card-ids`, read only the Library through MBQL;
  returns the IDs of the cards checked so far."
  [query checked-card-ids]
  (when (lib/any-native-stage? query)
    (throw (refusal (tru "A data app can run only queries built with the query builder, not SQL."))))
  (let [card-ids (set/difference (set (lib/all-source-card-ids query)) checked-card-ids)]
    (when-let [outside (some->> (not-empty card-ids)
                                data-apps.db/data-app-readable-card-ids
                                (set/difference card-ids)
                                not-empty)]
      (refuse-cards! query outside))
    (when-let [unpublished (queries/unpublished-read-table-names query)]
      (throw (refusal (tru "A data app can read only tables published to the Library, not {0}."
                           (str/join ", " (sort unpublished))))))
    (reduce (fn [checked card]
              (check-lib-query! (lib/query query (:dataset-query card)) checked))
            (into checked-card-ids card-ids)
            (some->> (not-empty card-ids) (lib.metadata/bulk-metadata query :metadata/card)))))

(defn- check-preprocessed-query!
  "Throws unless `query`, once the query processor has expanded its cards, segments, measures, parameters, remappings and
  foreign key reads into its stages and joins, runs no SQL and reads only tables published to the Library."
  [query]
  (let [preprocessed (try
                       (qp.setup/with-qp-setup [query query]
                         (qp.preprocess/preprocess query))
                       (catch Exception e
                         (throw (refusal (tru "A data app can run only valid queries.") e))))]
    (when (lib/any-native-stage? preprocessed)
      (throw (refusal (tru "A data app can run only queries built with the query builder, not SQL."))))
    (when-let [unpublished (some-> (not-empty (set (lib/all-source-table-ids preprocessed)))
                                   queries/unpublished-table-names
                                   not-empty)]
      (throw (refusal (tru "A data app can read only tables published to the Library, not {0}."
                           (str/join ", " (sort unpublished))))))))

(defenterprise check-query!
  "Throws a 403 unless `query`, a legacy or MBQL 5 query map, is an MBQL query on a database, without parameters, that
  reads only the Library."
  :feature :data-apps
  [query]
  (when-not (and (map? query)
                 (pos-int? (:database query))
                 (data-apps.db/database-exists? (:database query)))
    (throw (refusal (tru "A data app can run only queries on a database."))))
  (let [query (try
                (lib/query (lib-be/application-database-metadata-provider (:database query)) query)
                (catch Exception e
                  (throw (refusal (tru "A data app can run only valid queries.") e))))]
    (when (or (seq (:parameters query)) (some (comp seq :parameters) (:stages query)))
      (throw (refusal (tru "A data app can run only queries without parameters."))))
    (check-lib-query! query #{})
    (check-preprocessed-query! query))
  nil)

(defn- card-row
  "The ID and database ID of the card whose ID or entity ID is the route param `card-id`, or nil when there is none."
  [card-id]
  (if (= 21 (count card-id))
    (data-apps.db/card-by-entity-id card-id)
    (data-apps.db/card-by-id (parse-long card-id))))

(defenterprise check-card!
  "Throws a 403 unless the card with `card-id`, an ID or an entity ID, is a card of a data app or a metric in the Library
  whose query reads only the Library through MBQL, when such a card exists."
  :feature :data-apps
  [card-id]
  (when-let [{:keys [id database_id]} (card-row card-id)]
    (let [mp (lib-be/application-database-metadata-provider database_id)]
      (when-not (contains? (data-apps.db/data-app-readable-card-ids #{id}) id)
        (refuse-cards! mp #{id}))
      (let [card-query (lib/query mp (:dataset-query (lib.metadata/card mp id)))]
        (check-lib-query! card-query #{id})
        (check-preprocessed-query! card-query))))
  nil)

(defenterprise check-table!
  "Throws a 403 unless the table with `table-id`, a route param, is published to the Library, when such a table exists."
  :feature :data-apps
  [table-id]
  (when-let [unpublished (not-empty (queries/unpublished-table-names #{(parse-long table-id)}))]
    (throw (refusal (tru "A data app can read only tables published to the Library, not {0}."
                         (str/join ", " (sort unpublished)))))))

(defn- unpublished-field-ids
  "Among `field-ids`, the IDs of the fields whose tables aren't published to the Library."
  [field-ids]
  (if-let [table-ids (some-> (not-empty (set (remove nil? field-ids))) data-apps.db/field-table-ids)]
    (let [published (data-apps.db/published-table-ids (set (vals table-ids)))]
      (into #{} (keep (fn [[field-id table-id]] (when-not (published table-id) field-id))) table-ids))
    #{}))

(defn- reads-only-published?
  "Whether `query`, an MBQL query on the database with `database-id`, reads only tables published to the Library."
  [database-id query]
  (boolean
   (when (and (pos-int? database-id) (seq query))
     (try
       (empty? (queries/unpublished-read-table-names
                (lib/query (lib-be/application-database-metadata-provider database-id) query)))
       (catch Exception _
         false)))))

(defn- readable-card-ids
  "Among `card-ids`, the IDs of the cards a data app may read whose queries read only tables published to the Library."
  [card-ids]
  (if-let [card-ids (not-empty (set (filter pos-int? card-ids)))]
    (into #{}
          (filter (fn [card-id]
                    (when-let [{:keys [database_id]} (data-apps.db/card-by-id card-id)]
                      (let [mp (lib-be/application-database-metadata-provider database_id)]
                        (reads-only-published? database_id (:dataset-query (lib.metadata/card mp card-id)))))))
          (data-apps.db/data-app-readable-card-ids card-ids))
    #{}))

(defn- filter-macros
  "The table or card `metadata` with only the metrics a data app may read and the segments and measures whose definitions
  read only tables published to the Library."
  [{:keys [db_id] :as metadata}]
  (let [readable (readable-card-ids (keep :id (:metrics metadata)))]
    (cond-> metadata
      (sequential? (:metrics metadata))  (update :metrics #(filterv (comp readable :id) %))
      (sequential? (:segments metadata)) (update :segments #(filterv (comp (partial reads-only-published? db_id) :definition) %))
      (sequential? (:measures metadata)) (update :measures #(filterv (comp (partial reads-only-published? db_id) :definition) %)))))

(defn- filter-field-references
  "`field` with its foreign key target and its remappings dropped when they are among the `hidden` field IDs."
  [hidden {:keys [fk_target_field_id dimensions] :as field}]
  (cond-> field
    (hidden fk_target_field_id) (-> (dissoc :target)
                                    (assoc :fk_target_field_id nil))
    (sequential? dimensions)    (update :dimensions (partial filterv (comp not hidden :human_readable_field_id)))))

(defenterprise filter-table-metadata
  "The table or card `metadata` with its fields' foreign key targets and remappings into tables that aren't published to
  the Library dropped, only the metrics, segments and measures a data app may read, and no transform."
  :feature :data-apps
  [metadata]
  (let [hidden (unpublished-field-ids (mapcat (fn [{:keys [fk_target_field_id dimensions]}]
                                                (cons fk_target_field_id (keep :human_readable_field_id dimensions)))
                                              (:fields metadata)))]
    (cond-> (dissoc (filter-macros metadata) :transform)
      (seq hidden) (update :fields (partial mapv (partial filter-field-references hidden))))))

(defenterprise filter-foreign-keys
  "The foreign keys into a table whose origin fields are in tables published to the Library."
  :feature :data-apps
  [foreign-keys]
  (let [hidden (unpublished-field-ids (map :origin_id foreign-keys))]
    (into [] (remove (comp hidden :origin_id)) foreign-keys)))

(defn- card-table-id
  "The ID of the card that the table ID `table-id` of a query's metadata names, as `card__<id>`, or nil."
  [table-id]
  (when (string? table-id)
    (some-> (re-matches #"card__(\d+)" table-id) second parse-long)))

(defenterprise filter-query-metadata
  "The `metadata` of a query or a card with only the tables published to the Library and the cards a data app may read,
  each filtered as table metadata, their fields and databases, and no snippets."
  :feature :data-apps
  [{:keys [tables fields] :as metadata}]
  (let [table-ids    (set (filter pos-int? (map :id tables)))
        published    (if (seq table-ids) (data-apps.db/published-table-ids table-ids) #{})
        readable     (readable-card-ids (keep (comp card-table-id :id) tables))
        kept?        (fn [table-id]
                       (if-let [card-id (card-table-id table-id)]
                         (contains? readable card-id)
                         (contains? published table-id)))
        tables       (into [] (comp (filter (comp kept? :id)) (map filter-table-metadata)) tables)
        database-ids (set (keep :db_id tables))]
    (cond-> (assoc metadata :tables tables)
      (contains? metadata :fields)    (assoc :fields (into [] (filter (comp kept? :table_id)) fields))
      (contains? metadata :databases) (update :databases #(into [] (filter (comp database-ids :id)) %))
      (contains? metadata :snippets)  (assoc :snippets []))))
