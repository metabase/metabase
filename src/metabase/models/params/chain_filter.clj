(ns metabase.models.params.chain-filter
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
  `metabase.query-processor.middleware.add-dimension-projections` -- see that namespace for more details.

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
  (:require [clojure.core.memoize :as memoize]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [honeysql.format :as hformat]
            [metabase.db.util :as mdb.u]
            [metabase.driver.common.parameters.dates :as params.dates]
            [metabase.mbql.util :as mbql.u]
            [metabase.models :refer [Database Dimension Field FieldValues Table]]
            [metabase.models.field :as field]
            [metabase.models.field-values :as field-values]
            [metabase.models.params :as params]
            [metabase.models.params.chain-filter.dedupe-joins :as dedupe]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.models.table :as table]
            [metabase.query-processor :as qp]
            [metabase.types :as types]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;; so the hydration method for name_field is loaded
(comment params/keep-me)

(def ^:dynamic *enable-reverse-joins*
  "Whether to chain filter via joins where we must follow relationships in reverse, e.g. child -> parent (e.g.
  Restaurant -> Category instead of the usual Category -> Restuarant*)

  This switch mostly exists because I'm not 100% sure what the right behavior is."
  true)

(defn- joined-table-alias [table-id]
  (format "table_%d" table-id))

(def ^:private ^{:arglists '([field-id])} temporal-field?
  "Whether Field with `field-id` is a temporal Field such as a Date or Datetime. Cached for 10 minutes to avoid hitting
  the DB too much since this is unlike to change often, if ever."
  (memoize/ttl
   (fn [field-id]
     (types/temporal-field? (db/select-one [Field :base_type :semantic_type] :id field-id)))
   :ttl/threshold (u/minutes->ms 10)))

(defn- filter-clause
  "Generate a single MBQL `:filter` clause for a Field and `value` (or multiple values, if `value` is a collection)."
  [source-table-id field-id value]
  (let [field-clause (let [this-field-table-id (field/field-id->table-id field-id)]
                       [:field field-id (when-not (= this-field-table-id source-table-id)
                                          {:join-alias (joined-table-alias this-field-table-id)})])]
    (cond
      ;; e.g. {$$venues.price [:between 2 3]} -> [:between $venues.price 2 3]
      ;; this is not really supported by the API directly
      (and (sequential? value) (keyword? (first value)))
      (into [(first value) field-clause] (rest value))
      ;; e.g. {$$venues.price #{2 3}} -> [:= $$venues.price 2 3]
      (and (coll? value) (not (map? value)))
      (into [:= field-clause] value)
      :else
      ;; e.g. {$$venues.price "past32weeks"} -> [:time-interval $checkins.date -32 :week]
      (or (when (and (temporal-field? field-id)
                     (string? value))
            (u/ignore-exceptions
              (params.dates/date-string->filter value field-id)))
          ;; e.g. {$$venues.price 2} -> [:= $$venues.price 2]
          [:= field-clause value]))))

(defn- name-for-logging [model id]
  (format "%s %d %s" (name model) id (u/format-color 'blue (pr-str (db/select-one-field :name model :id id)))))

(defn- format-join-for-logging [join]
  (format "%s %s -> %s %s"
          (name-for-logging Table (-> join :lhs :table))
          (name-for-logging Field (-> join :lhs :field))
          (name-for-logging Table (-> join :rhs :table))
          (name-for-logging Field (-> join :rhs :field))))

(defn- format-joins-for-logging [joins]
  (str/join "\n"
            (map-indexed (fn [i join]
                           (format "%d. %s" (inc i) (format-join-for-logging join)))
                         joins)))

(defn- add-filters [query source-table-id joined-table-ids constraints]
  (reduce
   (fn [query [field-id value]]
     ;; only add a where clause for the Field if it's part of the source Table or if we're actually joining against
     ;; the Table it belongs to. This Field might not even be part of the same Database in which case we can ignore
     ;; it.
     (let [field-table-id (field/field-id->table-id field-id)]
       (if (or (= field-table-id source-table-id)
               (contains? joined-table-ids field-table-id))
         (let [filter-clause (filter-clause source-table-id field-id value)]
           (log/tracef "Added filter clause for %s %s"
                       (name-for-logging Table field-table-id)
                       (name-for-logging Field field-id))
           (update query :filter mbql.u/combine-filter-clauses filter-clause))
         (do
           (log/tracef "Not adding filter clause for %s %s because we did not join against its Table"
                       (name-for-logging Table field-table-id)
                       (name-for-logging Field field-id))
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
  (let [rows (db/query {:select    [[:fk-field.id :f1]
                                    [:fk-table.id :t1]
                                    [:pk-field.id :f2]
                                    [:pk-field.table_id :t2]]
                        :from      [[Field :fk-field]]
                        :left-join [[Table :fk-table]    [:= :fk-field.table_id :fk-table.id]
                                    [Database :database] [:= :fk-table.db_id :database.id]
                                    [Field :pk-field]    [:= :fk-field.fk_target_field_id :pk-field.id]]
                        :where     [:and
                                    [:= :database.id database-id]
                                    [:not= :fk-field.fk_target_field_id nil]]})]
    (reduce
     (partial merge-with merge)
     {}
     (for [{:keys [t1 f1 t2 f2] :as m} rows]
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
  (memoize/ttl database-fk-relationships* :ttl/threshold find-joins-cache-duration-ms))

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
    [{:lhs {:table <airport>, :field <airport.municipality-id>}
      :rhs {:table <municipality>, :field <municipality.id>}}
     {:lhs {:table <municipality>, :field <region.id>}
      :rhs {:table <region>, :field <country.id>}}
     {:lhs {:table <region>, :field <region.country_id>}
      :rhs {:table <country>, :field <country.id>}}]"
  (let [f (memoize/ttl find-joins* :ttl/threshold find-joins-cache-duration-ms)]
    (fn
      ([database-id source-table-id other-table-id]
       (f database-id source-table-id other-table-id *enable-reverse-joins*))
      ([database-id source-table-id other-table-id enable-reverse-joins?]
       (f database-id source-table-id other-table-id enable-reverse-joins?)))))

(def ^:private ^{:arglists '([source-table other-table-ids enable-reverse-joins?])} find-all-joins*
  (memoize/ttl
   (fn [source-table-id other-table-ids enable-reverse-joins?]
     (let [db-id     (table/table-id->database-id source-table-id)
           all-joins (mapcat #(find-joins db-id source-table-id % enable-reverse-joins?)
                             other-table-ids)]
       (when (seq all-joins)
         (log/tracef "Deduplicating for source %s; Tables to keep: %s\n%s"
                     (name-for-logging Table source-table-id)
                     (str/join ", " (map (partial name-for-logging Table)
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
                   (name-for-logging Table rhs-table-id) (u/pprint-to-str join))
       (update query :joins concat [join])))
   query
   joins))

(def ^:private Options
  ;; if original-field-id is specified, we'll include this in the results. For Field->Field remapping.
  {(s/optional-key :original-field-id) (s/maybe su/IntGreaterThanZero)
   ;; return at most the lesser of `limit` (if specified) and `max-results`.
   (s/optional-key :limit)             (s/maybe su/IntGreaterThanZero)})

(def ^:private max-results 1000)

(def ^:private ConstraintsMap
  "Schema for map of (other) Field ID -> value for additional constraints for the `chain-filter` results."
  {su/IntGreaterThanZero s/Any})

(s/defn ^:private chain-filter-mbql-query
  "Generate the MBQL query powering `chain-filter`."
  [field-id                          :- su/IntGreaterThanZero
   constraints                       :- (s/maybe ConstraintsMap)
   {:keys [original-field-id limit]} :- (s/maybe Options)]
  {:database (field/field-id->database-id field-id)
   :type     :query
   :query    (let [source-table-id       (field/field-id->table-id field-id)
                   joins                 (find-all-joins source-table-id (cond-> (set (keys constraints))
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
                             (name-for-logging Field field-id)
                             (name-for-logging Field original-field-id))
                 (log/tracef "MBQL clause for %s is %s"
                             (name-for-logging Field original-field-id) (pr-str original-field-clause)))
               (when (seq joins)
                 (log/tracef "Generating joins and filters for source %s with joins info\n%s"
                             (name-for-logging Table source-table-id) (pr-str joins)))
               (-> (merge {:source-table source-table-id
                           ;; original-field-id is used to power Field->Field breakouts. We include both remapped and
                           ;; original
                           :breakout     (if original-field-clause
                                           [original-field-clause [:field field-id nil]]
                                           [[:field field-id nil]])
                           ;; return the lesser of limit (if set) or max results
                           :limit        ((fnil min Integer/MAX_VALUE) limit max-results)}
                          (when original-field-clause
                            { ;; don't return rows that don't have values for the original Field. e.g. if
                             ;; venues.category_id is remapped to categories.name and we do a search with query 's',
                             ;; we only want to return [category_id name] tuples where [category_id] is not nil
                             ;;
                             ;; TODO -- would this be more efficient if we just did an INNER JOIN against the original
                             ;; Table instead of a LEFT JOIN with this additional filter clause? Would that still
                             ;; work?
                             :filter    [:not-null original-field-clause]
                             ;; for Field->Field remapping we want to return pairs of [original-value remapped-value],
                             ;; but sort by [remapped-value]
                             :order-by [[:asc [:field field-id nil]]]}))
                   (add-joins source-table-id joins)
                   (add-filters source-table-id joined-table-ids constraints)))})


;;; ------------------------ Chain filter (powers GET /api/dashboard/:id/params/:key/values) -------------------------

(s/defn ^:private unremapped-chain-filter
  "Chain filtering without all the fancy remapping stuff on top of it."
  [field-id                                 :- su/IntGreaterThanZero
   constraints                              :- (s/maybe ConstraintsMap)
   {:keys [original-field-id], :as options} :- (s/maybe Options)]
  (let [mbql-query (chain-filter-mbql-query field-id constraints options)]
    (log/debugf "Chain filter MBQL query:\n%s" (u/pprint-to-str 'magenta mbql-query))
    (try
      (qp/process-query
       mbql-query
       {:rff (constantly (if original-field-id
                           ;; if original-field-id is specified (for Field->Field remapping) just return each row,
                           ;; which will be [original-value remapped-value], as-is. reducing function is conj, so rff,
                           ;; which is of the form
                           ;;
                           ;;     (f metadata) -> rf
                           ;;
                           ;; will be (constantly conj).
                           conj
                           ;; if we're just returning values for a single field with no remapping (or if the mapping
                           ;; is human-readable values, which is done in Clojure-land), then just return the first
                           ;; value in each row. e.g.
                           ;;
                           ;;    [v] -> v
                           ;;
                           ;; Thus rff is
                           ;;
                           ;;    (f metadata) -> ((map first) conj)
                           ((map first) conj)))})
      (catch Throwable e
        (throw (ex-info (tru "Error executing chain filter query")
                        {:field-id    field-id
                         :constraints constraints
                         :mbql-query  mbql-query}
                        e))))))

(def ^:private HumanReadableRemappingMap
  "Schema for the map of actual value -> human-readable value. Cannot be empty."
  (su/non-empty {s/Any (s/maybe s/Str)}))

(s/defn ^:private human-readable-remapping-map :- (s/maybe HumanReadableRemappingMap)
  [field-id :- su/IntGreaterThanZero]
  (when-let [{orig :values, remapped :human_readable_values} (db/select-one [FieldValues :values :human_readable_values]
                                                               {:where [:and
                                                                        [:= :field_id field-id]
                                                                        [:not= :human_readable_values nil]
                                                                        [:not= :human_readable_values "{}"]]})]
    (when (seq remapped)
      (zipmap orig remapped))))

(s/defn ^:private add-human-readable-values
  "Convert result `values` (a sequence of single values) to a sequence of `[v human-readable]` pairs by finding the
  matching remapped values from `v->human-readable`."
  [values v->human-readable :- HumanReadableRemappingMap]
  (map vector values (map (fn [v]
                            (get v->human-readable v (get v->human-readable (str v))))
                          values)))

(s/defn ^:private human-readable-values-remapped-chain-filter
  "Chain filter, but for Fields that have human-readable values defined (e.g. you've went in and specified that enum
  value `1` should be displayed as `BIRD_TYPE_TOUCAN`). `v->human-readable` is a map of actual values in the
  database (e.g. `1`) to the human-readable version (`BIRD_TYPE_TOUCAN`)."
  [field-id          :- su/IntGreaterThanZero
   v->human-readable :- HumanReadableRemappingMap
   constraints       :- (s/maybe ConstraintsMap)
   options           :- (s/maybe Options)]
  (let [values (unremapped-chain-filter field-id constraints options)]
    (add-human-readable-values values v->human-readable)))

(s/defn ^:private field-to-field-remapped-chain-filter
  "Chain filter, but for Field->Field remappings (e.g. 'remap' `venue.category_id` -> `category.name`; search by
  `category.name` but return tuples of `[venue.category_id category.name]`."
  [original-field-id :- su/IntGreaterThanZero
   remapped-field-id :- su/IntGreaterThanZero
   constraints       :- (s/maybe ConstraintsMap)
   options           :- (s/maybe Options)]
  (unremapped-chain-filter remapped-field-id constraints (assoc options :original-field-id original-field-id)))

(defmethod hformat/fn-handler (u/qualified-name ::parens) [_ x]
  (str "(" (hformat/to-sql x) ")"))

(defn- parens [x]
  (hsql/call (u/qualified-name ::parens) x))

;; TODO -- add some caching here?
(s/defn ^:private remapped-field-id :- (s/maybe su/IntGreaterThanZero)
  "Efficient query to find the ID of the Field we're remapping `field-id` to, if it has either type of Field -> Field
  remapping."
  [field-id :- su/IntGreaterThanZero]
  (let [[{:keys [id]}] (db/query {:select [[:ids.id :id]]
                                  :from   [[{:union [(parens
                                                      {:select [[:dimension.human_readable_field_id :id]]
                                                       :from   [[Dimension :dimension]]
                                                       :where  [:and
                                                                [:= :dimension.field_id field-id]
                                                                [:not= :dimension.human_readable_field_id nil]]
                                                       :limit  1})
                                                     (parens
                                                      {:select    [[:dest.id :id]]
                                                       :from      [[Field :source]]
                                                       :left-join [[Table :table] [:= :source.table_id :table.id]
                                                                   [Field :dest] [:= :dest.table_id :table.id]]
                                                       :where     [:and
                                                                   [:= :source.id field-id]
                                                                   (mdb.u/isa :source.semantic_type :type/PK)
                                                                   (mdb.u/isa :dest.semantic_type :type/Name)]
                                                       :limit     1})]}
                                            :ids]]
                                  :limit  1})]
    id))

(defn- use-cached-field-values?
  "Whether we should use cached `FieldValues` instead of running a query via the QP."
  [field-id constraints]
  (and
   field-id
   ;; only use cached Field values if there are no additional constraints (i.e. if this is just a simple "fetch all
   ;; values" call)
   (empty? constraints)
   ;; check whether the Field *should* have Field values. Not whether it actually does.
   (field-values/field-should-have-field-values? field-id)
   ;; If the Field *should* values, make sure the Field actually *does* have Field Values as well (but not a
   ;; human-readable remap, which is handled by `human-readable-values-remapped-chain-filter`_
   (db/exists? FieldValues :field_id field-id, :values [:not= nil], :human_readable_values nil)))

(defn- cached-field-values [field-id {:keys [limit]}]
  (let [{:keys [values]} (params.field-values/get-or-create-field-values-for-current-user! (Field field-id))]
    (cond->> (map first values)
      limit (take limit))))

(s/defn chain-filter
  "Fetch a sequence of possible values of Field with `field-id` by restricting the possible values to rows that match
  values of other Fields in the `constraints` map. Powers the `GET /api/dashboard/:id/param/:key/values` chain filter
  API endpoint.

    ;; fetch possible values of venue price (between 1 and 4 inclusive) where category name is 'BBQ'
    (chain-filter $venues.price {$categories.name \"BBQ\"})
    ;; -> [1 2 3] (there are no BBQ places with price = 4)

  `options` are key-value options. Currently only one option is supported, `:limit`:

    ;; fetch first 10 values of venues.price
    (chain-filter $venues.price {} :limit 10)

  For remapped columns, this returns results as a sequence of `[value remapped-value]` pairs."
  [field-id    :- su/IntGreaterThanZero
   constraints :- (s/maybe ConstraintsMap)
   & options]
  (assert (even? (count options)))
  (let [{:as options} options]
    (if-let [v->human-readable (human-readable-remapping-map field-id)]
      (human-readable-values-remapped-chain-filter field-id v->human-readable constraints options)
      (if (use-cached-field-values? field-id constraints)
        (cached-field-values field-id options)
        (if-let [remapped-field-id (remapped-field-id field-id)]
          (field-to-field-remapped-chain-filter field-id remapped-field-id constraints options)
          (unremapped-chain-filter field-id constraints options))))))


;;; ----------------- Chain filter search (powers GET /api/dashboard/:id/params/:key/search/:query) -----------------

;; TODO -- if this validation succeeds, we can probably cache that success for a bit so we can avoid unneeded DB
;; calls every time this function is called.
(defn- check-valid-search-field
  "Before running a search query, make sure the Field actually exists and that it's a Text field."
  [field-id]
  (let [base-type (db/select-one-field :base_type Field :id field-id)]
    (when-not base-type
      (throw (ex-info (tru "Field {0} does not exist." field-id)
                      {:field field-id, :status-code 404})))
    (when-not (isa? base-type :type/Text)
      (let [field-name (db/select-one-field :name Field :id field-id)]
        (throw (ex-info (tru "Cannot search against non-Text Field {0} {1}" field-id (pr-str field-name))
                        {:status-code 400
                         :field-id    field-id
                         :field       field-name
                         :base-type   base-type}))))))

(s/defn ^:private unremapped-chain-filter-search
  [field-id    :- su/IntGreaterThanZero
   constraints :- (s/maybe ConstraintsMap)
   query       :- su/NonBlankString
   options     :- (s/maybe Options)]
  (check-valid-search-field field-id)
  (let [query-constraint {field-id [:contains query {:case-sensitive false}]}
        constraints      (merge constraints query-constraint)]
    (unremapped-chain-filter field-id constraints options)))

(defn- matching-unremapped-values [query v->human-readable]
  (let [query (str/lower-case query)]
    (for [[orig remapped] v->human-readable
          :when           (and (string? remapped)
                               (str/includes? (str/lower-case remapped) query))]
      orig)))

(s/defn ^:private human-readable-values-remapped-chain-filter-search
  "Chain filter search, but for Fields that have human-readable values defined (e.g. you've went in and specified that
  enum value `1` should be displayed as `BIRD_TYPE_TOUCAN`). `v->human-readable` is a map of actual values in the
  database (e.g. `1`) to the human-readable version (`BIRD_TYPE_TOUCAN`)."
  [field-id          :- su/IntGreaterThanZero
   v->human-readable :- HumanReadableRemappingMap
   constraints       :- (s/maybe ConstraintsMap)
   query             :- su/NonBlankString
   options           :- (s/maybe Options)]
  (or (when-let [unremapped-values (not-empty (matching-unremapped-values query v->human-readable))]
        (let [query-constraint  {field-id (set unremapped-values)}
              constraints       (merge constraints query-constraint)
              values            (unremapped-chain-filter field-id constraints options)]
          (add-human-readable-values values v->human-readable)))
      []))

(defn- search-cached-field-values? [field-id constraints]
  (and (use-cached-field-values? field-id constraints)
       (isa? (db/select-one-field :base_type Field :id field-id) :type/Text)))

(defn- cached-field-values-search
  [field-id query {:keys [limit]}]
  (let [values (cached-field-values field-id nil)
        query  (str/lower-case query)]
    (cond->> (filter (fn [s]
                       (str/includes? (str/lower-case s) query))
                     values)
      limit (take limit))))

(s/defn ^:private field-to-field-remapped-chain-filter-search
  "Chain filter search, but for Field->Field remappings e.g. 'remap' `venue.category_id` -> `category.name`; search by
  `category.name` but return tuples of `[venue.category_id category.name]`."
  [original-field-id :- su/IntGreaterThanZero
   remapped-field-id :- su/IntGreaterThanZero
   constraints       :- (s/maybe ConstraintsMap)
   query             :- su/NonBlankString
   options           :- (s/maybe Options)]
  (unremapped-chain-filter-search remapped-field-id constraints query
                                  (assoc options :original-field-id original-field-id)))

(s/defn chain-filter-search
  "Convenience version of `chain-filter` that adds a constraint to only return values of Field with `field-id`
  containing String `query`. Powers the `search/:query` version of the chain filter endpoint."
  [field-id          :- su/IntGreaterThanZero
   constraints       :- (s/maybe ConstraintsMap)
   query             :- (s/maybe su/NonBlankString)
   & options]
  (assert (even? (count options)))
  (if (str/blank? query)
    (apply chain-filter field-id constraints options)
    (let [{:as options} options]
      (if-let [v->human-readable (human-readable-remapping-map field-id)]
        (human-readable-values-remapped-chain-filter-search field-id v->human-readable constraints query options)
        (if (search-cached-field-values? field-id constraints)
          (cached-field-values-search field-id query options)
          (if-let [remapped-field-id (remapped-field-id field-id)]
            (field-to-field-remapped-chain-filter-search field-id remapped-field-id constraints query options)
            (unremapped-chain-filter-search field-id constraints query options)))))))


;;; ------------------ Filterable Field IDs (powers GET /api/dashboard/params/valid-filter-fields) -------------------

(s/defn filterable-field-ids
  "Return the subset of `filter-ids` we can actually use in a `chain-filter` query to fetch values of Field with
  `id`.

    ;; maybe we can't filter against Field 2 because there's no FK-> relationship
    (filterable-field-ids 1 #{2 3 4}) ; -> #{3 4}"
  [field-id         :- su/IntGreaterThanZero
   filter-field-ids :- (s/maybe #{su/IntGreaterThanZero})]
  (when (seq filter-field-ids)
    (let [mbql-query (chain-filter-mbql-query field-id
                                              (into {} (for [id filter-field-ids] [id nil]))
                                              nil)]
      (set (mbql.u/match (-> mbql-query :query :filter)
             [:field (id :guard integer?) _] id)))))
