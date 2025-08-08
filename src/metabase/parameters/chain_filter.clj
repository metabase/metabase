(ns metabase.parameters.chain-filter
  "Generate and run an MBQL query to return possible values of a given Field based on the values of other related
  Fields.

  ## Remapping

  The main Field for which we search for values can optionally be remapped. ADDITIONAL CONSTRAINTS DO NOT SUPPORT
  REMAPPING! There are three types of remapping:

  1. Human-readable values remapping where you go assign string values to things like enum integers

  2. Implicit PK Field-> [Name] Field remapping. This happens automatically for any Field with `:type/PK` semantic type
  that has another Field with `:type/Name` semantic type in the same Table. e.g. `venue.id` is automatically
  remapped (displayed) as `venue.name`.

  3. Explicit FK Field->Field remapping. FK Fields can be manually remapped to a Field in the Table they point to.
  e.g. `venue.category_id` -> `category.name`. This is done by creating a `Dimension` for the Field in question with a
  `human_readable_field_id`. There is a big explanation of how this works in
  [[metabase.query-processor.middleware.add-remaps]] -- see that namespace for more details.

  Here's some examples of what this namespace does. Suppose you do

    ;; find values of Field 1 starting with 'Cam' that are possible when Field 2 = \"abc\"
    (chain-filter-search 1 {2 \"abc\"} \"Cam\")

  Depending on the remapping situation, one of four things happens.

  ### A) Human-readable values remapping

  If Field 1 has human-readable values, we find those values that contain the string 'Cam' and then generate a query to
  restrict results to the matching original values. e.g. if Field 1 is \"venue.category_id\" and is
  human-readable-remapped with something like

    {1 \"Mexican\", 2 \"Camping Food\", 3 \"Campbell's Soup\"}

  and you do the search above, then we generate a query that looks something like:

    SELECT category_id
    FROM venue
    WHERE id IN (2, 3)
    AND field_2 = \"abc\"

  (we then convert these values back to [value human-readable-value] pairs in Clojure-land)

  ### B) Field->Field remapping (either type)

  Suppose Field 1 is `venue.category_id` which has a remapping \"name\" Field `category.name`. For the example search
  above, the resulting query looks something like:

    SELECT venue.category_id, category.name
    FROM venue
    LEFT JOIN category ON venue.category_id = category.id
    WHERE lower(category.name) LIKE 'cam%'
      AND field_2 = \"abc\"

  ### C) No remappings

  Life is easy. Suppose Field 1 is `category.name`. The resulting query is something like:

  SELECT name
  FROM category
  WHERE lower(name) LIKE '%cam'
  AND field_2 = \"abc\""
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.set :as set]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.app-db.core :as mdb]
   [metabase.driver.common.parameters.dates :as params.dates]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.parameters.chain-filter.dedupe-joins :as dedupe]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

;; so the hydration method for name_field is loaded
(comment params/keep-me)

(def Constraint
  "Schema for a constraint on a field."
  [:map
   [:field-id ms/PositiveInt]
   [:op :keyword]
   [:value :any]
   [:options {:optional true} [:maybe map?]]])

(def Constraints
  "Schema for a list of Constraints."
  [:sequential Constraint])

(def ^:dynamic *enable-reverse-joins*
  "Whether to chain filter via joins where we must follow relationships in reverse, e.g. child -> parent (e.g.
  Restaurant -> Category instead of the usual Category -> Restuarant*)

  This switch mostly exists because I'm not 100% sure what the right behavior is."
  true)

(defn- joined-table-alias [table-id]
  (format "table_%d" table-id))

(def ^:private ^{:arglists '([field-id])} memoized-field-types-by-id
  "Return field types by id. Cached for 10 minutes to avoid hitting the DB too much since this is unlike to change
  often, if ever."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[field-id]]
                         [(mdb/unique-identifier) field-id])}
   (fn [field-id]
     (t2/select-one [:model/Field :base_type :semantic_type] :id field-id))
   :ttl/threshold (u/minutes->ms 10)))

(mu/defn- filter-clause
  "Generate a single MBQL `:filter` clause for a Field and `value` (or multiple values, if `value` is a collection)."
  [source-table-id
   {:keys [field-id op value options]} :- Constraint]
  (let [{:keys [base_type] :as field-metadata} (memoized-field-types-by-id field-id)
        field-clause (let [this-field-table-id (field/field-id->table-id field-id)]
                       [:field field-id (merge (when base_type
                                                 ;; This may be prone to eg. coercion errors. However effective in
                                                 ;; _clause options_ is not standard part of options.
                                                 {:base-type base_type})
                                               (when-not (= this-field-table-id source-table-id)
                                                 {:join-alias (joined-table-alias this-field-table-id)}))])]
    (if (and (types/temporal-field? field-metadata)
             (string? value))
      (u/ignore-exceptions
        (params.dates/date-string->filter value field-id))
      ;; we don't want to skip our value, even if its nil
      (let [values (if (nil? value) [nil] (u/one-or-many value))]
        (if (and (#{:starts-with :ends-with :contains :does-not-contain} op)
                 (next values))
          ;; special form: options come after the tag
          (into [op options field-clause] values)
          ;; standard form: options at the end
          (cond-> (into [op field-clause] values)
            (seq options) (conj options)))))))

(defn- name-for-logging [model id]
  (format "%s %d %s" (name model) id (u/format-color 'blue (pr-str (t2/select-one-fn :name model :id id)))))

(defn- format-join-for-logging [join]
  (format "%s %s -> %s %s"
          (name-for-logging :model/Table (-> join :lhs :table))
          (name-for-logging :model/Field (-> join :lhs :field))
          (name-for-logging :model/Table (-> join :rhs :table))
          (name-for-logging :model/Field (-> join :rhs :field))))

(defn- format-joins-for-logging [joins]
  (str/join "\n"
            (map-indexed (fn [i join]
                           (format "%d. %s" (inc i) (format-join-for-logging join)))
                         joins)))

(defn- add-filters [query source-table-id joined-table-ids constraints]
  (reduce
   (fn [query {:keys [field-id] :as constraint}]
     ;; only add a where clause for the Field if it's part of the source Table or if we're actually joining against
     ;; the Table it belongs to. This Field might not even be part of the same Database in which case we can ignore
     ;; it.
     (let [field-table-id (field/field-id->table-id field-id)]
       (if (or (= field-table-id source-table-id)
               (contains? joined-table-ids field-table-id))
         (let [clause (filter-clause source-table-id constraint)]
           (log/tracef "Added filter clause for %s %s: %s"
                       (name-for-logging :model/Table field-table-id)
                       (name-for-logging :model/Field field-id)
                       clause)
           (update query :filter mbql.u/combine-filter-clauses clause))
         (do
           (log/tracef "Not adding filter clause for %s %s because we did not join against its Table"
                       (name-for-logging :model/Table field-table-id)
                       (name-for-logging :model/Field field-id))
           query))))
   query
   constraints))

(def ^:private find-joins-cache-duration-ms
  "Amount of time to cache results of `find-joins`. Since FK relationships in Tables are unlikely to change very
  often (actually, only when the DB is synced again) we can cache them for a while and avoid a complicated app DB
  call."
  ;; 5 minutes seems reasonable
  (u/minutes->ms 5))

(defn- database-fk-relationships* [database-id enable-reverse-joins?]
  (let [rows (mdb/query {:select    [[:fk-field.id :f1]
                                     [:fk-table.id :t1]
                                     [:pk-field.id :f2]
                                     [:pk-field.table_id :t2]]
                         :from      [[:metabase_field :fk-field]]
                         :left-join [[:metabase_table :fk-table]    [:and [:= :fk-field.table_id :fk-table.id]
                                                                     :fk-table.active]
                                     [:metabase_database :database] [:= :fk-table.db_id :database.id]
                                     [:metabase_field :pk-field]    [:and [:= :fk-field.fk_target_field_id :pk-field.id]
                                                                     :pk-field.active]]
                         :where     [:and
                                     [:= :database.id database-id]
                                     [:not= :fk-field.fk_target_field_id nil]
                                     :fk-field.active]
                         :order-by [[:fk-field.id :desc]
                                    [:pk-field.id :desc]]})]
    (reduce
     (partial merge-with merge)
     {}
     (for [{:keys [t1 f1 t2 f2]} rows]
       (merge
        {t1 {t2 [{:lhs {:table t1, :field f1}, :rhs {:table t2, :field f2}}]}}
        (let [reverse-join {:lhs {:table t2, :field f2}, :rhs {:table t1, :field f1}}]
          (if enable-reverse-joins?
            {t2 {t1 [reverse-join]}}
            (log/tracef "Not including reverse join (disabled) %s" (format-join-for-logging reverse-join)))))))))

(def ^:private ^{:arglists '([database-id enable-reverse-joins?])} database-fk-relationships
  "Return a sequence of FK relationships that exist in a database, in the format

    lhs-table-id -> rhs-table-id -> [join-info*]

  where `join-info` is of the format

    {:lhs {:table <id>, :field <id>}, :rhs {:table <id>, :field <id>}}

  'lhs' refers to the Table and Field on the left-hand-side of the join, and 'rhs' refers to the Table on the
  right-hand-side of the join. Of course, you can join in either direction (e.g. `FROM B JOIN A ...` or `FROM A JOIN
  B`), so both `A -> B` and `B -> A` versions of the relationship are returned; having both possibilities simplifies
  the implementation of `find-joins` below."
  (memoize/ttl
   ^{::memoize/args-fn (fn [[database-id enable-reverse-joins?]]
                         [(mdb/unique-identifier) database-id enable-reverse-joins?])}
   database-fk-relationships*
   :ttl/threshold find-joins-cache-duration-ms))

(defn- traverse-graph
  "A breadth first traversal of graph, not probing any paths that are over `max-depth` in length."
  [graph start end max-depth]
  (letfn [(transform [path] (let [edges (partition 2 1 path)]
                              (not-empty (vec (mapcat (fn [[x y]] (get-in graph [x y])) edges)))))]
    (loop [paths (conj clojure.lang.PersistentQueue/EMPTY [start])
           seen  #{start}]
      (let [path (peek paths)
            node (peek path)]
        (cond (nil? node)
              nil
              ;; found a path, bfs finds shortest first
              (= node end)
              (transform path)
              ;; abandon this path. A bit hazy on how seen and max depth interact.
              (= (count path) max-depth)
              (recur (pop paths) seen)
              ;; probe further and throw them on the queue
              :else
              (let [next-nodes (->> (get graph node)
                                    keys
                                    (remove seen))]
                (recur (into (pop paths) (for [n next-nodes] (conj path n)))
                       (set/union seen (set next-nodes)))))))))

(def ^:private max-traversal-depth 5)

(defn- find-joins* [database-id source-table-id other-table-id enable-reverse-joins?]
  (let [fk-relationships (database-fk-relationships database-id enable-reverse-joins?)]
    ;; find series of joins needed to get from LHS -> RHS. `path` is the tables we're already joining against when
    ;; recursing so we don't end up coming up with circular joins.
    ;;
    ;; the general idea here is to see if LHS can join directly against RHS, otherwise recursively try all of the
    ;; tables LHS can join against and see if we can find a path that way.
    (u/prog1 (traverse-graph fk-relationships source-table-id other-table-id max-traversal-depth)
      (when (seq <>)
        (log/tracef (format-joins-for-logging <>))))))

(def ^:private ^{:arglists '([database-id source-table-id other-table-id]
                             [database-id source-table-id other-table-id enable-reverse-joins?])} find-joins
  "Find the joins that must be done to make fields in Table with `other-table-id` accessible in a query whose
  primary (source) Table is the Table with `source-table-id`. Information about joins is returned in the format

    [{:lhs {:table <id>, :field <id>}, :rhs {table <id>, :field <id>}}
     ...]

  e.g.

    ;; 'airport' is the source Table; find the joins needed to include 'country' Table
    (find-joins my-database-id <airport> <country>)
    ;; ->
    ;; 3 joins needed: airport -> municipality; municipality -> region; region -> country
    [{:lhs {:table <airport>, :field <airport.municipality_id>}
      :rhs {:table <municipality>, :field <municipality.id>}}
     {:lhs {:table <municipality>, :field <region.id>}
      :rhs {:table <region>, :field <country.id>}}
     {:lhs {:table <region>, :field <region.country_id>}
      :rhs {:table <country>, :field <country.id>}}]"
  (let [f (memoize/ttl
           ^{::memoize/args-fn (fn [[database-id source-table-id other-table-id enable-reverse-joins?]]
                                 [(mdb/unique-identifier)
                                  database-id
                                  source-table-id
                                  other-table-id
                                  enable-reverse-joins?])}
           find-joins*
           :ttl/threshold find-joins-cache-duration-ms)]
    ;; expose memoize metadata
    (with-meta
     (fn
       ([database-id source-table-id other-table-id]
        (f database-id source-table-id other-table-id *enable-reverse-joins*))
       ([database-id source-table-id other-table-id enable-reverse-joins?]
        (f database-id source-table-id other-table-id enable-reverse-joins?)))
     (meta f))))

(def ^:private ^{:arglists '([source-table other-table-ids enable-reverse-joins?])} find-all-joins*
  (memoize/ttl
   ^{::memoize/args-fn (fn [[source-table-id other-table-ids enable-reverse-joins?]]
                         [(mdb/unique-identifier) source-table-id other-table-ids enable-reverse-joins?])}
   (fn [source-table-id other-table-ids enable-reverse-joins?]
     (let [db-id     (database/table-id->database-id source-table-id)
           all-joins (mapcat #(find-joins db-id source-table-id % enable-reverse-joins?)
                             other-table-ids)]
       (when (seq all-joins)
         (log/tracef "Deduplicating for source %s; Tables to keep: %s\n%s"
                     (name-for-logging :model/Table source-table-id)
                     (str/join ", " (map (partial name-for-logging :model/Table)
                                         other-table-ids))
                     (format-joins-for-logging all-joins))
         (u/prog1 (vec (dedupe/dedupe-joins source-table-id all-joins other-table-ids))
           (when-not (= all-joins <>)
             (log/tracef "Deduplicated:\n%s" (format-joins-for-logging <>)))))))
   :ttl/threshold find-joins-cache-duration-ms))

(defn- find-all-joins
  "Find the complete set of joins we need to do for `source-table-id` to join against Fields in `field-ids`."
  [source-table-id field-ids]
  (when-let [other-table-ids (not-empty (disj (set (map field/field-id->table-id (set field-ids)))
                                              source-table-id))]
    (find-all-joins* source-table-id other-table-ids *enable-reverse-joins*)))

(defn- add-joins
  "Add joins to the MBQL `query` we're generating. The Field for which we are returning values is the \"source Field\",
  and the Table it belongs to is the source Table; `field-ids` is a set of Fields belonging to Tables other than the
  source Table.

  When we generate joins, we must determine the other Tables we must join against so that we have access to the other
  Fields. The relationship between these other Tables and the source Table may go in either direction, i.e. the source
  Table may have a FK to the other Table, or the other Table might have an FK to the source Table. e.g. the join
  condition may be either:

    source_table.fk = other_table.pk
    -- or
    source_table.pk = other_table.fk

  Since we're not sure which way the relationship goes, `resolve-fk-id` fetches all possible relationships between the
  two Tables and we generate the appropriate join against the other Table."
  [query source-table-id joins]
  (reduce
   (fn [query {{lhs-table-id :table, lhs-field-id :field} :lhs, {rhs-table-id :table, rhs-field-id :field} :rhs}]
     (let [join {:source-table rhs-table-id
                 :condition    [:=
                                [:field lhs-field-id (when-not (= lhs-table-id source-table-id)
                                                       {:join-alias (joined-table-alias lhs-table-id)})]
                                [:field rhs-field-id {:join-alias (joined-table-alias rhs-table-id)}]]
                 :alias        (joined-table-alias rhs-table-id)}]
       (log/tracef "Adding join against %s\n%s"
                   (name-for-logging :model/Table rhs-table-id) (u/pprint-to-str join))
       (update query :joins concat [join])))
   query
   joins))

(def ^:private Options
  ;; if original-field-id is specified, we'll include this in the results. For Field->Field remapping.
  [:map {:closed true}
   [:original-field-id {:optional true} [:maybe ms/PositiveInt]]
    ;; return at most the lesser of `limit` (if specified) and `max-results`.
   [:limit {:optional true} [:maybe ms/PositiveInt]]])

(def ^:private max-results 1000)

(mu/defn- chain-filter-mbql-query
  "Generate the MBQL query powering `chain-filter`."
  [field-id                          :- ms/PositiveInt
   constraints                       :- [:maybe Constraints]
   {:keys [original-field-id limit]} :- [:maybe Options]]
  {:database (field/field-id->database-id field-id)
   :type     :query
   :query    (let [source-table-id       (field/field-id->table-id field-id)
                   joins                 (find-all-joins source-table-id (cond-> (set (map :field-id constraints))
                                                                           original-field-id (conj original-field-id)))
                   joined-table-ids      (set (map #(get-in % [:rhs :table]) joins))
                   original-field-clause (when original-field-id
                                           (let [original-table-id (field/field-id->table-id original-field-id)]
                                             [:field
                                              original-field-id
                                              (when-not (= source-table-id original-table-id)
                                                {:join-alias (joined-table-alias original-table-id)})]))]
               (when original-field-id
                 (log/tracef "Finding values of %s, remapped from %s."
                             (name-for-logging :model/Field field-id)
                             (name-for-logging :model/Field original-field-id))
                 (log/tracef "MBQL clause for %s is %s"
                             (name-for-logging :model/Field original-field-id) (pr-str original-field-clause)))
               (when (seq joins)
                 (log/tracef "Generating joins and filters for source %s with joins info\n%s"
                             (name-for-logging :model/Table source-table-id) (pr-str joins)))
               (-> (merge {:source-table source-table-id
                           ;; return the lesser of limit (if set) or max results
                           :limit        ((fnil min Integer/MAX_VALUE) limit max-results)}
                          (if original-field-clause
                            {;; don't return rows that don't have values for the original Field. e.g. if
                             ;; venues.category_id is remapped to categories.name and we do a search with query 's',
                             ;; we only want to return [category_id name] tuples where [category_id] is not nil
                             ;;
                             ;; TODO -- would this be more efficient if we just did an INNER JOIN against the original
                             ;; Table instead of a LEFT JOIN with this additional filter clause? Would that still
                             ;; work?
                             :filter   [:not-null original-field-clause]
                             ;; for Field->Field remapping we want to return pairs of [original-value remapped-value],
                             ;; but sort by [remapped-value]
                             :order-by [[:asc [:field field-id nil]]]
                             ;; original-field-id is used to power Field->Field breakouts.
                             ;; We include both remapped and original
                             :breakout    [original-field-clause [:field field-id nil]]}
                            {:breakout    [[:field field-id nil]]}))
                   (add-joins source-table-id joins)
                   (add-filters source-table-id joined-table-ids constraints)
                   schema.metadata-queries/add-required-filters-if-needed))
   :middleware {:disable-remaps? true}})

;;; ------------------------ Chain filter (powers GET /api/dashboard/:id/params/:key/values) -------------------------

(mu/defn- unremapped-chain-filter :- ms/FieldValuesResult
  "Chain filtering without all the fancy remapping stuff on top of it."
  [field-id    :- ms/PositiveInt
   constraints :- [:maybe Constraints]
   options     :- [:maybe Options]]
  (let [mbql-query (chain-filter-mbql-query field-id constraints options)]
    (log/debugf "Chain filter MBQL query:\n%s" (u/pprint-to-str 'magenta mbql-query))
    (try
      (let [query-limit (get-in mbql-query [:query :limit])
            ;; FIXME: this can OOM for text column if each value are too large. See #46411
            ;; Consider using the [[field-values/distinct-text-field-rff] rff]
            values      (qp/process-query mbql-query (constantly conj))]
        (try ; Feature issue #46888: log chain filter query.
          (log/debugf "Chain filter native query: `%s`."
                      (:query (qp.compile/compile mbql-query)))
          (catch Throwable _
            (log/error "Chain filter log failed!")))
        {:values          values
         ;; It's unlikely that we don't have a query-limit, but better safe than sorry and default it true
         ;; so that calling chain-filter-search on the same field will search from DB.
         :has_more_values (if (nil? query-limit)
                            true
                            (= (count values) query-limit))})

      (catch Throwable e
        (throw (ex-info (tru "Error executing chain filter query")
                        {:field-id    field-id
                         :constraints constraints
                         :mbql-query  mbql-query}
                        e))))))

(mu/defn- add-human-readable-values
  "Convert result `values` (a sequence of 1-tuples) to a sequence of `[v human-readable]` pairs by finding the
  matching remapped values from `v->human-readable`."
  [values            :- [:sequential ms/NonRemappedFieldValue]
   v->human-readable :- ::parameters.schema/human-readable-remapping-map]
  (map vector
       (map first values)
       (map (fn [[v]]
              (get v->human-readable v (get v->human-readable (str v))))
            values)))

(defn- format-union
  "Workaround for https://github.com/seancorfield/honeysql/issues/451. Wrap the subselects in parens, otherwise it will
  fail on Postgres."
  [_clause exprs]
  (let [[sqls args] (sql/format-expr-list exprs)
        sql         (str/join " UNION " sqls)]
    (into [sql] args)))

(sql/register-clause! ::union format-union :union)

(defn- implicit-pk->name-mapping-query
  [field-id mapping-type]
  {:select    [[:dest.id :id] [[:inline mapping-type] :mapping_type]]
   :from      [[:metabase_field :source]]
   :left-join [[:metabase_table :table] [:= :source.table_id :table.id]
               [:metabase_field :dest] [:= :dest.table_id :table.id]]
   :where     [:and
               [:= :source.id field-id]
               (mdb/isa :source.semantic_type :type/PK)
               (mdb/isa :dest.semantic_type :type/Name)]
   :limit     1})

(def ^:dynamic *allow-implicit-uuid-field-remapping*
  "Should implicit remapping be allowed _for uuid fields_? Not eg. for
  `GET /dashboard/:id/params/:param-key/search/:query` to search on actual field that was picked
  for filtering (#59020). Apart from the endpoint it is bound in [[chain-filter-search]]!"
  true)

(defn- remapped-field-id-query [field-id]
  {:select [[:mapping.id :id] [:mapping.mapping_type :mapping_type]]
   :from   [[{::union (into [;; Explicit FK Field->Field remapping
                             {:select [[:dimension.human_readable_field_id :id] [[:inline "fk->field"] :mapping_type]]
                              :from   [[:dimension :dimension]]
                              :where  [:and
                                       [:= :dimension.field_id field-id]
                                       [:not= :dimension.human_readable_field_id nil]]
                              :limit  1}]
                            (when *allow-implicit-uuid-field-remapping*
                              [;; Implicit FK Field -> PK Field -> [Name] Field remapping
                               (implicit-pk->name-mapping-query
                                {:select    [:fk_target_field_id]
                                 :from      [:metabase_field]
                                 :where     [:and
                                             [:= :id field-id]
                                             (mdb/isa :semantic_type :type/FK)]
                                 :limit     1}
                                "fk->pk->name")
                               ;; Implicit PK Field-> [Name] Field remapping
                               (implicit-pk->name-mapping-query field-id "pk->name")]))}
             :mapping]]
   :limit  1})

;; TODO -- add some caching here?
(mu/defn remapped-field-id :- [:maybe ms/PositiveInt]
  "Efficient query to find the ID of the Field we're remapping `field-id` to, if it has either type of Field -> Field
  remapping."
  [field-id :- [:maybe ms/PositiveInt]]
  (:id (t2/query-one (remapped-field-id-query field-id))))

(mu/defn remapping :- [:maybe [:map
                               [:id ms/PositiveInt]
                               [:mapping-type [:enum :fk->field :fk->pk->name :pk->name]]]]
  "Efficient query to find the ID of the Field we're remapping `field-id` to, if it has either type of Field -> Field
  remapping."
  [field-id :- [:maybe ms/PositiveInt]]
  (when-let [raw-mapping (t2/query-one (remapped-field-id-query field-id))]
    (-> raw-mapping
        (dissoc :mapping_type)
        (assoc :mapping-type (-> raw-mapping :mapping_type keyword)))))

(defn- use-cached-field-values?
  "Whether we should use cached `FieldValues` instead of running a query via the QP."
  [field-id]
  (and
   field-id
   (field-values/field-should-have-field-values? field-id)))

(defn- check-field-value-query-permissions
  "Check query permissions against the chain-filter-mbql-query (private #196)"
  [field-id constraints options]
  (let [query (chain-filter-mbql-query field-id constraints options)]
    (qp.setup/with-qp-setup [query query]
      (->> query
           qp.preprocess/preprocess
           qp.perms/check-query-permissions*))))

(defn- cached-field-values [field-id constraints {:keys [limit]}]
  ;; TODO: why don't we remap the human readable values here?
  (let [{:keys [values has_more_values]}
        (if (empty? constraints)
          (params.field-values/get-or-create-field-values-for-current-user! (t2/select-one :model/Field :id field-id))
          (params.field-values/get-or-create-linked-filter-field-values! (t2/select-one :model/Field :id field-id) constraints))]
    {:values          (cond->> values
                        limit (take limit))
     :has_more_values (or (when limit
                            (< limit (count values)))
                          has_more_values)}))

(mu/defn chain-filter :- ms/FieldValuesResult
  "Fetch a sequence of possible values of Field with `field-id` by restricting the possible values to rows that match
  values of other Fields in the `constraints` map. Powers the `GET /api/dashboard/:id/param/:key/values` chain filter
  API endpoint.

    ;; fetch possible values of venue price (between 1 and 4 inclusive) where category name is 'BBQ'
    (chain-filter %venues.price {%categories.name \"BBQ\"})
    ;; -> {:values          [1 2 3] (there are no BBQ places with price = 4)
           :has_more_values false}

  `options` are key-value options. Currently two options are supported, `:limit` and `:remapping-field`:

  - :limit
    ;; fetch first 10 values of venues.price
    (chain-filter %venues.price {} :limit 10)

  - :remapping-field
  ;; Explicitly specify a Field ID to use for Field->Field remapping instead of auto-detecting.
  ;; This bypasses automatic remapping detection and directly uses the specified field for remapping.
  (chain-filter %venues.category_id {} :remapping-field %categories.name)

  For remapped columns (when remapping is detected or when an explicit remapping field-id is provided), this returns
  results as a sequence of `[value remapped-value]` pairs."
  [field-id    :- ms/PositiveInt
   constraints :- [:maybe Constraints]
   & options]
  (assert (even? (count options)))
  (let [{:as options}         options
        relax-fk-requirement? (:relax-fk-requirement? options)
        remapping-field       (:remapping-field options)
        options               (dissoc options :relax-fk-requirement? :remapping-field)
        v->human-readable     (schema.metadata-queries/human-readable-remapping-map field-id)
        remapping             (delay (remapping field-id))]
    (cond
      ;; If explicit remapping field provided, use it for Field->Field remapping
      (some? remapping-field)
      (unremapped-chain-filter remapping-field constraints (assoc options :original-field-id field-id))

     ;; This is for fields that have human-readable values defined (e.g. you've went in and specified that enum
     ;; value `1` should be displayed as `BIRD_TYPE_TOUCAN`). `v->human-readable` is a map of actual values in the
     ;; database (e.g. `1`) to the human-readable version (`BIRD_TYPE_TOUCAN`).
      (some? v->human-readable)
      (-> (unremapped-chain-filter field-id constraints options)
          (update :values add-human-readable-values v->human-readable))

      (and (use-cached-field-values? field-id) (nil? @remapping))
      (do
        (check-field-value-query-permissions field-id constraints options)
        (cached-field-values field-id constraints options))

     ;; This is Field->Field remapping e.g. `venue.category_id `-> `category.name `;
     ;; search by `category.name` but return tuples of `[venue.category_id category.name]`.
      (some? @remapping)
      (let [{the-remapped-field-id :id, :keys [mapping-type]} @remapping]
        (if-let [pk-field-id (when (and (= mapping-type :fk->pk->name)
                                        relax-fk-requirement?)
                               (t2/select-one-fn :fk_target_field_id :model/Field field-id))]
          (unremapped-chain-filter the-remapped-field-id
                                   (map #(cond-> %
                                           (= (:field-id %) field-id) (assoc :field-id pk-field-id))
                                        constraints)
                                   (assoc options :original-field-id pk-field-id))
          (unremapped-chain-filter the-remapped-field-id constraints (assoc options :original-field-id field-id))))

      :else
      (unremapped-chain-filter field-id constraints options))))

;;; ----------------- Chain filter search (powers GET /api/dashboard/:id/params/:key/search/:query) -----------------

;; TODO -- if this validation succeeds, we can probably cache that success for a bit so we can avoid unneeded DB
;; calls every time this function is called.
(defn- check-valid-search-field
  "Before running a search query, make sure the Field actually exists and that it's a Text field."
  [field-id]
  (let [base-type (t2/select-one-fn :base_type :model/Field :id field-id)]
    (when-not base-type
      (throw (ex-info (tru "Field {0} does not exist." field-id)
                      {:field field-id, :status-code 404})))
    (when-not (isa? base-type :type/Text)
      (let [field-name (t2/select-one-fn :name :model/Field :id field-id)]
        (throw (ex-info (tru "Cannot search against non-Text Field {0} {1}" field-id (pr-str field-name))
                        {:status-code 400
                         :field-id    field-id
                         :field       field-name
                         :base-type   base-type}))))))

(mu/defn- unremapped-chain-filter-search
  [field-id    :- ms/PositiveInt
   constraints :- [:maybe Constraints]
   query       :- ms/NonBlankString
   options     :- [:maybe Options]]
  (check-valid-search-field field-id)
  (let [constraints (conj constraints {:field-id field-id
                                       :op       :contains
                                       :value    query
                                       :options  {:case-sensitive false}})]
    (unremapped-chain-filter field-id constraints options)))

(defn- matching-unremapped-values [query v->human-readable]
  (let [query (u/lower-case-en query)]
    (for [[orig remapped] v->human-readable
          :when           (and (string? remapped)
                               (str/includes? (u/lower-case-en remapped) query))]
      orig)))

(mu/defn- human-readable-values-remapped-chain-filter-search
  "Chain filter search, but for Fields that have human-readable values defined (e.g. you've went in and specified that
  enum value `1` should be displayed as `BIRD_TYPE_TOUCAN`). `v->human-readable` is a map of actual values in the
  database (e.g. `1`) to the human-readable version (`BIRD_TYPE_TOUCAN`)."
  [field-id          :- ms/PositiveInt
   v->human-readable :- ::parameters.schema/human-readable-remapping-map
   constraints       :- [:maybe Constraints]
   query             :- ms/NonBlankString
   options           :- [:maybe Options]]
  (or (when-let [unremapped-values (not-empty (matching-unremapped-values query v->human-readable))]
        (let [constraints (conj constraints {:field-id field-id
                                             :op       :=
                                             :value    (set unremapped-values)
                                             :options  nil})
              result      (unremapped-chain-filter field-id constraints options)]
          (update result :values add-human-readable-values v->human-readable)))
      {:values          []
       :has_more_values false}))

(defn- search-cached-field-values? [field-id constraints]
  (let [field (t2/select-one :model/Field :id field-id)]
    (and (use-cached-field-values? field-id)
         (isa? (:base_type field) :type/Text)
         (apply t2/exists? :model/FieldValues (mapcat
                                               identity
                                               (merge {:field_id field-id, :values [:not= nil], :human_readable_values nil}
                                                      ;; if we are doing a search, make sure we only use field values
                                                      ;; when we're certain the fieldvalues we stored are all the possible values.
                                                      ;; otherwise, we should search directly from DB
                                                      {:has_more_values false}
                                                      (let [hash-input (params.field-values/hash-input-for-field-values field constraints)
                                                            hash-key (str (hash hash-input))]
                                                        (if (not= hash-input {:field-id field-id})
                                                          {:type "advanced"
                                                           :hash_key hash-key}
                                                          {:type "full"}))))))))

(defn- cached-field-values-search
  [field-id query constraints {:keys [limit]}]
  (let [{:keys [values has_more_values]} (cached-field-values field-id constraints nil)
        query                            (u/lower-case-en query)]
    {:values (cond->> (filter (fn [s]
                                (when s
                                  (str/includes? (u/lower-case-en s) query)))
                              values)
               limit (take limit))
     :has_more_values has_more_values}))

(mu/defn chain-filter-search :- ms/FieldValuesResult
  "Convenience version of `chain-filter` that adds a constraint to only return values of Field with `field-id`
  containing String `query`. Powers the `search/:query` version of the chain filter endpoint."
  [field-id          :- ms/PositiveInt
   constraints       :- [:maybe Constraints]
   query             :- [:maybe ms/NonBlankString]
   & options]
  (assert (even? (count options)))
  (let [{:as options}         options
        v->human-readable     (delay (schema.metadata-queries/human-readable-remapping-map field-id))
        the-remapped-field-id (delay (let [{:keys [base_type effective_type]} (memoized-field-types-by-id field-id)]
                                       (binding [*allow-implicit-uuid-field-remapping*
                                                 ;; For the details on following condition see the dynamic var's
                                                 ;; docstring.
                                                 (or *allow-implicit-uuid-field-remapping*
                                                     (not (isa? (or effective_type base_type) :type/UUID)))]
                                         (remapped-field-id field-id))))]
    (cond
      (str/blank? query)
      (apply chain-filter field-id constraints options)

      (some? @v->human-readable)
      (human-readable-values-remapped-chain-filter-search field-id @v->human-readable constraints query options)

      (and (search-cached-field-values? field-id constraints) (nil? @the-remapped-field-id))
      (do
        (check-field-value-query-permissions field-id constraints options)
        (cached-field-values-search field-id query constraints options))

      (some? @the-remapped-field-id)
      (unremapped-chain-filter-search @the-remapped-field-id constraints query (assoc options :original-field-id field-id))

      :else
      (unremapped-chain-filter-search field-id constraints query options))))

;;; ------------------ Filterable Field IDs (powers GET /api/dashboard/params/valid-filter-fields) -------------------

(mu/defn filterable-field-ids
  "Return the subset of `filter-ids` we can actually use in a `chain-filter` query to fetch values of Field with
  `id`.

    ;; maybe we can't filter against Field 2 because there's no FK-> relationship
    (filterable-field-ids 1 #{2 3 4}) ; -> #{3 4}"
  [field-id         :- ms/PositiveInt
   filter-field-ids :- [:maybe [:set ms/PositiveInt]]]
  (when (seq filter-field-ids)
    (let [mbql-query (chain-filter-mbql-query field-id
                                              (for [id filter-field-ids]
                                                {:field-id id :op := :value nil})
                                              nil)]
      (set (lib.util.match/match (-> mbql-query :query :filter)
             [:field (id :guard integer?) _] id)))))
