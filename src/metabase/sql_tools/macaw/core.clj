(ns metabase.sql-tools.macaw.core
  (:require
   [clojure.set :as set]
   [macaw.core :as macaw]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.common :as sql-tools.common]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.sql-tools.macaw.references :as sql-tools.macaw.references]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

;;;; referenced-tables

;; TODO: Proper schema
;; FKA driver/native-query-deps :sql
;; TODO: handling for other driver impls
;; #_#_:- ::driver/native-query-deps
(mu/defn referenced-tables
  "WIP"
  [driver :- :keyword
   query  :- :metabase.lib.schema/native-only-query]
  (let [db-tables (lib.metadata/tables query)
        db-transforms (lib.metadata/transforms query)]
    (-> query
        lib/raw-native-query
        (driver.u/parsed-query driver)
        (macaw/query->components {:strip-contexts? true})
        :tables
        (->> (map :component))
        (->> (into #{} (keep #(->> (sql-tools.common/normalize-table-spec driver %)
                                   (sql-tools.common/find-table-or-transform driver db-tables db-transforms))))))))

(defmethod sql-tools/referenced-tables-impl :macaw
  [_parser driver query]
  (referenced-tables driver query))

;;;; returned-columns

(defmulti ^:private resolve-field
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
               (sql-tools.common/find-table-or-transform
                driver (lib.metadata/tables metadata-provider) (lib.metadata/transforms metadata-provider))
               :table
               (lib.metadata/active-fields metadata-provider)
               (map #(-> (assoc % :lib/desired-column-alias (:name %))
                         sql-tools.macaw.references/wrap-col)))
      [{:error (lib/missing-table-alias-error
                (sql-tools.macaw.references/table-name (:table col-spec)))}]))
;;
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
                              (some #(when (= (:name %) (:column col-spec))
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

(defn- returned-columns
  [driver native-query]
  (let [{:keys [returned-fields]} (-> native-query
                                      lib/raw-native-query
                                      (driver.u/parsed-query driver)
                                      macaw/->ast
                                      (->> (sql-tools.macaw.references/field-references driver)))]
    (mapcat #(->> (resolve-field driver native-query %)
                  (keep :col))
            returned-fields)))

(defmethod sql-tools/returned-columns-impl :macaw
  [_parser driver query]
  (returned-columns driver query))

(defn validate-query
  "Validate native query. TODO: limits; what this can and can not do."
  [driver native-query]
  (let [{:keys [used-fields returned-fields errors]} (-> native-query
                                                         lib/raw-native-query
                                                         (driver.u/parsed-query driver)
                                                         macaw/->ast
                                                         (->> (sql-tools.macaw.references/field-references driver)))
        check-fields #(mapcat (fn [col-spec]
                                (->> (resolve-field driver (lib/->metadata-provider native-query) col-spec)
                                     (keep :error)))
                              %)]
    (-> errors
        (into (check-fields used-fields))
        (into (check-fields returned-fields)))))

(defmethod sql-tools/validate-query-impl :macaw
  [_parser driver query]
  (validate-query driver query))
