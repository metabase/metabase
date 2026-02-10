(ns metabase.sql-tools.common
  {:clj-kondo/config '{:linters {:metabase/modules {:level :off}}}}
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.interface :as sql-tools]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

(defn normalize-table-spec
  "WIP"
  [driver {:keys [table schema]}]
  {:table (driver.sql/normalize-name driver table)
   :schema (some->> schema (driver.sql/normalize-name driver))})

(defn find-table-or-transform
  "Given a table and schema that has been parsed out of a native query, finds either a matching table or a matching transform.
   It will return either {:table table-id} or {:transform transform-id}, or nil if neither is found."
  [driver tables transforms {search-table :table raw-schema :schema}]
  (let [search-schema (or raw-schema
                          (driver.sql/default-schema driver))
        normalize (partial driver.sql/normalize-name driver)
        matches? (fn [db-table db-schema]
                   (and (= (normalize search-table) (normalize db-table))
                        (= (some-> search-schema normalize) (some-> db-schema normalize))))]
    (or (some (fn [{:keys [name schema id]}]
                (when (matches? name schema)
                  {:table id}))
              tables)
        (some (fn [{:keys [id] {:keys [name schema]} :target}]
                (when (matches? name schema)
                  {:transform id}))
              transforms))))

(mu/defn table-name :- [:maybe :string]
  "Computes a table name from a table reference"
  [raw-col :- [:map
               [:database {:optional true} :string]
               [:schema {:optional true} :string]
               [:table {:optional true} :string]]]
  (when (:table raw-col)
    (->> [:database :schema :table]
         (keep raw-col)
         (str/join "."))))

(defn wrap-col
  "Wraps the argument in `{:col _}`"
  [col]
  {:col col})

(defmulti resolve-field
  "Resolves a field reference to one or more actual database fields.

  This uses a supplied metadata provider instead of hitting the db directly.  'Field reference' refers to the field
  references returned by sql-tools.macaw.references/field-references.

  Note: this currently sets :lib/desired-column-alias but no other :lib/* fields, because the callers of this function
  don't need the other fields.  If we care about other :lib/* fields in the future, we can add them then."
  {:added "0.57.0" :arglists '([driver metadata-provider col-spec])}
  (fn [_driver _metadata-provider col-spec]
    (:type col-spec)))

(defmethod resolve-field :all-columns
  [driver metadata-provider col-spec]
  (or (some->> (:table col-spec)
               (find-table-or-transform
                driver (lib.metadata/tables metadata-provider) (lib.metadata/transforms metadata-provider))
               :table
               (lib.metadata/active-fields metadata-provider)
               (map #(-> (assoc % :lib/desired-column-alias (:name %))
                         wrap-col)))
      [{:error (lib/missing-table-alias-error
                (table-name (:table col-spec)))}]))

(defmethod resolve-field :single-column
  [driver metadata-provider {:keys [alias] :as col-spec}]
  [(if-let [{:keys [name] :as found}
            (->> (:source-columns col-spec)
                 (some (fn [source-col-set]
                         ;; in cases like `select (select blah from ...) from ...`, if blah refers to a
                         ;; column in both the inner query and the outer query, the column from the inner
                         ;; query will be preferred.  However, if blah doesn't refer to something in the
                         ;; inner query, it can also refer to something in the outer query.
                         ;; sql-tools.macaw.references/field-references organizes source-cols into a list of lists
                         ;; to account for this.
                         (->> (mapcat (fn [current-col]
                                        ;; :unknown-columns is a placeholder for "we know there are columns being
                                        ;; returned, but have no way of knowing what those are -- this is primarily
                                        ;; used for table-functions like `select * from my_func()`.  If we encounter
                                        ;; something like that, assume that the query is valid and make up a matching
                                        ;; column to avoid false positives.
                                        (if (= (:type current-col) :unknown-columns)
                                          (let [name (:column col-spec)]
                                            [{:base-type :type/*
                                              :name name
                                              :display-name (->> name (u.humanization/name->human-readable-name :simple))
                                              :effective-type :type/*
                                              :semantic-type :Semantic/*}])
                                          (keep :col (resolve-field driver metadata-provider current-col))))
                                      source-col-set)
                              (some #(when (= (driver.sql/normalize-name driver (:name %))
                                              (driver.sql/normalize-name driver (:column col-spec)))
                                       %))))))]
     {:col (assoc found :lib/desired-column-alias (or alias name))}
     {:error (lib/missing-column-error (:column col-spec))})])

(defn- get-name [m]
  (or (:alias m) (str (gensym "new-col"))))

(defn- get-display-name [m]
  (->> (get-name m)
       (u.humanization/name->human-readable-name :simple)))

(defmethod resolve-field :custom-field
  [_driver _metadata-provider col-spec]
  [{:col {:base-type :type/*
          :name (get-name col-spec)
          :lib/desired-column-alias (get-name col-spec)
          :display-name (get-display-name col-spec)
          :effective-type :type/*
          :semantic-type :Semantic/*}}])

(defn- lca [default-type & types]
  (let [ancestor-sets (for [t types
                            :when t]
                        (conj (set (ancestors t)) t))
        common-ancestors (when (seq ancestor-sets)
                           (apply set/intersection ancestor-sets))]
    (if (seq common-ancestors)
      (apply (partial max-key (comp count ancestors)) common-ancestors)
      default-type)))

(defmethod resolve-field :composite-field
  [driver metadata-provider col-spec]
  (let [member-fields (mapcat #(->> (resolve-field driver metadata-provider %)
                                    (keep :col))
                              (:member-fields col-spec))]
    [{:col {:name (get-name col-spec)
            :lib/desired-column-alias (get-name col-spec)
            :display-name (get-display-name col-spec)
            :base-type (apply lca :type/* (map :base-type member-fields))
            :effective-type (apply lca :type/* (map :effective-type member-fields))
            :semantic-type (apply lca :Semantic/* (map :semantic-type member-fields))}}]))

(defmethod resolve-field :unknown-columns
  [_driver _metadata-provider _col-spec]
  [])

(defn returned-columns
  "Given a native query, return columns it produces using field-references pipeline."
  [parser driver native-query]
  (let [{:keys [returned-fields]} (sql-tools/field-references-impl parser driver (lib/raw-native-query native-query))]
    (vec (mapcat #(->> (resolve-field driver native-query %)
                       (keep :col))
                 returned-fields))))

(defn- normalize-error
  "Normalize error names using driver-specific case normalization.
   This ensures error names match database metadata conventions."
  [driver error]
  (if-let [error-name (:name error)]
    (assoc error :name (driver.sql/normalize-name driver error-name))
    error))

(defn validate-query
  "Validate native query."
  [parser driver native-query]
  (let [{:keys [used-fields returned-fields errors]} (sql-tools/field-references-impl parser driver (lib/raw-native-query native-query))
        check-fields #(mapcat (fn [col-spec]
                                (->> (resolve-field driver (lib/->metadata-provider native-query) col-spec)
                                     (keep :error)))
                              %)]
    (->> (-> errors
             (into (check-fields used-fields))
             (into (check-fields returned-fields)))
         (map (partial normalize-error driver))
         set)))

(defn referenced-fields
  "Extract fields referenced (used) in a native query - fields in WHERE, JOIN ON, etc."
  [parser driver native-query]
  (let [{:keys [used-fields]} (sql-tools/field-references-impl parser driver (lib/raw-native-query native-query))]
    (into #{}
          (mapcat #(->> (resolve-field driver native-query %)
                        (keep :col)))
          used-fields)))
