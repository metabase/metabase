(ns metabase-enterprise.data-apps.rules
  "The Library-only rules a data app's requests are held to: it reads only tables published to the Library, the metrics
  in the Library and the cards in data apps' collections, through MBQL queries alone."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.collections.core :as collections]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
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

(defn- check-card-row!
  "Throws unless a data app may read the card with `card-row`, its ID and database ID, when it is non-nil."
  [{:keys [id database_id] :as card-row}]
  (when card-row
    (let [mp (lib-be/application-database-metadata-provider database_id)]
      (when-not (contains? (data-apps.db/data-app-readable-card-ids #{id}) id)
        (refuse-cards! mp #{id}))
      (let [card-query (lib/query mp (:dataset-query (lib.metadata/card mp id)))]
        (check-lib-query! card-query #{id})
        (check-preprocessed-query! card-query)))))

(defenterprise check-card!
  "Throws a 403 unless the card with `card-id`, an ID or an entity ID, is a card of a data app or a metric in the Library
  whose query reads only the Library through MBQL, when such a card exists."
  :feature :data-apps
  [card-id]
  (check-card-row! (card-row card-id))
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

(defn- check-field-tables!
  "Throws unless the fields with `field-ids` that exist are in tables published to the Library."
  [field-ids]
  (when-let [table-ids (some->> (not-empty field-ids) data-apps.db/field-table-ids vals set not-empty)]
    (when-let [unpublished (not-empty (queries/unpublished-table-names table-ids))]
      (throw (refusal (tru "A data app can read only tables published to the Library, not {0}."
                           (str/join ", " (sort unpublished))))))))

(defn- value-source-field-ids
  "`field-ids` with the fields their values may be read from: the fields they point to as foreign keys, and the fields
  that replace their values or those of their foreign key targets through a remapping."
  [field-ids]
  (if (empty? field-ids)
    #{}
    (let [field-ids (into field-ids (data-apps.db/fk-target-field-ids field-ids))]
      (into field-ids (data-apps.db/remap-field-ids field-ids)))))

(defenterprise check-field!
  "Throws a 403 unless the field with `field-id`, a route param, is in a table published to the Library, when such a
  field exists."
  :feature :data-apps
  [field-id]
  (check-field-tables! #{(parse-long field-id)}))

(defenterprise check-field-values!
  "Throws a 403 unless the field with `field-id`, a route param, and every field its values may be read from are in
  tables published to the Library, for those of them that exist."
  :feature :data-apps
  [field-id]
  (check-field-tables! (value-source-field-ids #{(parse-long field-id)})))

(defenterprise filter-related
  "The entities related to a field, filtered as the metadata of the field's table is: only the metrics, segments and
  measures a data app may read, and its fields' references into tables outside the Library dropped."
  :feature :data-apps
  [related]
  (-> related
      (assoc :db_id (get-in related [:table :db_id]))
      filter-table-metadata
      (dissoc :db_id)))

(defn- ref-field-ids
  "The IDs of the fields that the legacy or MBQL 5 field `ref`, a parameter's value or label field, names or reaches
  through a foreign key."
  [ref]
  (when (and (sequential? ref) (= "field" (some-> (first ref) name)))
    (let [[_ x y]   ref
          [id opts] (if (map? x) [y x] [x y])]
      (cond-> #{}
        (pos-int? id)                   (conj id)
        (pos-int? (:source-field opts)) (conj (:source-field opts))))))

(defenterprise check-parameter!
  "Throws a 403 unless a data app may read the values of `parameter`, from the card it names and its value and label
  fields, and of the field it targets and the fields with `field-ids`, wherever their values are read from."
  :feature :data-apps
  [{:keys [values_source_type values_source_config target]} field-ids]
  (when-not (every? pos-int? field-ids)
    (throw (refusal (tru "A data app can read the values only of fields named by their IDs."))))
  (when (= "card" (some-> values_source_type name))
    (let [card-id (:card_id values_source_config)]
      (when-not (pos-int? card-id)
        (throw (refusal (tru "A data app can read the values only of cards named by their IDs."))))
      (check-card-row! (data-apps.db/card-by-id card-id))))
  (check-field-tables! (value-source-field-ids
                        (cond-> (into (set field-ids)
                                      (mapcat ref-field-ids)
                                      [(:value_field values_source_config) (:label_field values_source_config)])
                          target (into (filter pos-int?)
                                       [(lib/parameter-target-field-id (lib/normalize ::lib.schema.parameter/target target))]))))
  nil)

(defenterprise check-card-parameter!
  "Throws a 403 unless a data app may read the values of the parameter with `param-key` of the card with `card-id`, both
  route params, when the card has such a parameter."
  :feature :data-apps
  [card-id param-key]
  (when-let [parameter (some #(when (= param-key (:id %)) %)
                             (some-> (card-row card-id) :id data-apps.db/card-parameters))]
    (check-parameter! parameter nil)))

(defenterprise check-dashboard!
  "Throws a 403 unless the dashboard with `dashboard-id`, an ID or an entity ID, is a dashboard in the Library that isn't
  archived, when such a dashboard exists."
  :feature :data-apps
  [dashboard-id]
  (when-let [{:keys [archived collection_type]} (if (= 21 (count dashboard-id))
                                                  (data-apps.db/dashboard-by-entity-id dashboard-id)
                                                  (data-apps.db/dashboard-by-id (parse-long dashboard-id)))]
    (when (or archived (not= collections/library-dashboards-collection-type collection_type))
      (throw (refusal (tru "A data app can use only the dashboards in the Library."))))))

(defenterprise check-database!
  "Throws a 403 unless the database with `database-id`, a route param, has tables published to the Library, when such a
  database exists."
  :feature :data-apps
  [database-id]
  (let [database-id (parse-long database-id)]
    (when (and (data-apps.db/database-exists? database-id)
               (not (contains? (data-apps.db/published-table-database-ids) database-id)))
      (throw (refusal (tru "A data app can read only databases with tables published to the Library."))))))

(defn- schema-name
  "The name of the schema `schema`, a nil schema named as the empty string, as the schema endpoints name it."
  [schema]
  (or schema ""))

(defn- published-schemas
  "The names of the schemas of the database with `database-id` that hold tables published to the Library."
  [database-id]
  (into #{} (comp (filter :is_published) (map (comp schema-name :schema)))
        (data-apps.db/database-tables database-id)))

(defenterprise check-schema!
  "Throws a 403 unless the schema named `schema` of the database with `database-id`, both route params, holds tables
  published to the Library, whether or not such a schema exists."
  :feature :data-apps
  [database-id schema]
  (when-not (contains? (published-schemas (parse-long database-id)) (schema-name schema))
    (throw (refusal (tru "A data app can read only schemas with tables published to the Library.")))))

(defenterprise filter-tables
  "The `tables` published to the Library, each filtered as table metadata."
  :feature :data-apps
  [tables]
  (let [table-ids (set (filter pos-int? (map :id tables)))
        published (if (seq table-ids) (data-apps.db/published-table-ids table-ids) #{})]
    (into [] (comp (filter (comp published :id)) (map filter-table-metadata)) tables)))

(defenterprise filter-database
  "The `database` with only its tables published to the Library, each filtered as table metadata, and only the schemas
  that hold them."
  :feature :data-apps
  [{:keys [id] :as database}]
  (cond-> database
    (contains? database :tables)  (update :tables filter-tables)
    (contains? database :schemas) (update :schemas (let [published (published-schemas id)]
                                                     #(into [] (filter (comp published schema-name)) %)))))

(defenterprise filter-databases
  "The databases, a page of them or a list, with tables published to the Library, each filtered as a database, with the
  page's total counting only those."
  :feature :data-apps
  [databases]
  (let [published (data-apps.db/published-table-database-ids)
        filter*   #(into [] (comp (filter (comp published :id)) (map filter-database)) %)]
    (if (map? databases)
      (let [data (filter* (:data databases))]
        (assoc databases :data data :total (count data)))
      (filter* databases))))

(defenterprise filter-schemas
  "The `schemas` of the database with `database-id` that hold tables published to the Library."
  :feature :data-apps
  [database-id schemas]
  (let [published (published-schemas (parse-long database-id))]
    (into [] (filter (comp published schema-name)) schemas)))

(defn- suggestion-table-name
  "The name of the table an autocomplete `suggestion`, a `[name detail]` pair, names, or that the field it names belongs
  to, the part of its detail before the field's types."
  [[suggestion-name detail]]
  (if (= "Table" detail)
    suggestion-name
    (some-> (re-find #"^(.*?) :type/" (str detail)) second)))

(defenterprise filter-autocomplete-suggestions
  "The autocomplete `suggestions` of the database with `database-id` for tables published to the Library whose names no
  unpublished table of the database shares."
  :feature :data-apps
  [database-id suggestions]
  (let [tables      (data-apps.db/database-tables (parse-long database-id))
        unpublished (into #{} (comp (remove :is_published) (map :name)) tables)
        visible     (into #{} (comp (filter :is_published) (map :name) (remove unpublished)) tables)]
    (into [] (filter (comp visible suggestion-table-name)) suggestions)))

(defenterprise filter-cards
  "The `cards` a data app may read whose queries read only tables published to the Library."
  :feature :data-apps
  [cards]
  (let [readable (readable-card-ids (keep :id cards))]
    (into [] (filter (comp readable :id)) cards)))
