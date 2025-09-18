(ns metabase.driver.sql.references
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [macaw.core :as macaw]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common.parameters.parse :as params.parse]
   [metabase.driver.common.parameters.values :as params.values]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.parameters.substitute :as sql.params.substitute]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [potemkin :as p]))

(defn- normalize-fields [driver m]
  (m/map-vals #(if (string? %)
                 (sql.normalize/normalize-name driver %)
                 %)
              m))

(defn- col-fields [driver m]
  (->> (select-keys m [:type :column :table :schema :database :alias])
       (normalize-fields driver)))

(defn- table-matches? [search table]
  (or (when (and (not (:schema search))
                 (not (:database search)))
        (= (:table search) (:table-alias table)))
      (->> (select-keys search [:table :schema :database])
           keys
           (every? #(= (% search) (% table))))))

(defn- find-source [search sources]
  (some (fn [sublist]
          (some #(when (table-matches? search (:names %))
                   %)
                sublist))
        sources))

(defn- get-column [driver sources raw-col]
  (if-let [literal (and
                    (nil? (:table raw-col))
                    (nil? (:schema raw-col))
                    (nil? (:database raw-col))
                    (sql.normalize/reserved-literal driver (:column raw-col)))]
    []
    (let [{:keys [alias column table] :as expr} (col-fields driver raw-col)
          valid-sources (if table
                          [[(find-source expr sources)]]
                          sources)
          source-columns (into []
                               (map #(into []
                                           (mapcat :returned-fields)
                                           %))
                               valid-sources)
          source-column (some (fn [columns]
                                (some #(when (= column (or (:alias %) (:column %)))
                                         %)
                                      columns))
                              source-columns)]
      [(if source-column
         (cond-> source-column
           alias (assoc :alias alias))
         (-> {:column column
              :alias alias
              :type :single-column}
             (assoc :source-columns source-columns)))])))

(defmulti find-used-fields
  (fn [driver sources withs expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod find-used-fields :default
  [_driver _sources _withs _expr]
  nil)

(defmethod find-used-fields [:sql :macaw.ast/column]
  [driver sources _withs expr]
  (get-column driver sources expr))

(defmethod find-used-fields [:sql :macaw.ast/unary-expression]
  [driver sources withs expr]
  (find-used-fields driver sources withs (:expression expr)))

(defmethod find-used-fields [:sql :macaw.ast/binary-expression]
  [driver sources withs expr]
  (concat (find-used-fields driver sources withs (:left expr))
          (find-used-fields driver sources withs (:right expr))))

(defmethod find-used-fields [:sql :macaw.ast/expression-list]
  [driver sources withs expr]
  (mapcat (partial find-used-fields driver sources withs) (:expressions expr)))

(defmethod find-used-fields [:sql :macaw.ast/join]
  [driver sources withs expr]
  (mapcat (partial find-used-fields driver sources withs) (:condition expr)))

(defmethod find-used-fields [:sql :macaw.ast/function]
  [driver sources withs expr]
  (mapcat (partial find-used-fields driver sources withs) (:params expr)))

(defmethod find-used-fields [:sql :macaw.ast/case]
  [driver sources withs expr]
  (concat (find-used-fields driver sources withs (:switch expr))
          (find-used-fields driver sources withs (:else expr))
          (mapcat (fn [{when-clause :when then-clause :then}]
                    (concat (find-used-fields driver sources withs when-clause)
                            (find-used-fields driver sources withs then-clause)))
                  (:when-clauses expr))))

(defmethod find-used-fields [:sql :macaw.ast/between]
  [driver sources withs expr]
  (concat (find-used-fields driver sources withs (:expression expr))
          (find-used-fields driver sources withs (:start expr))
          (find-used-fields driver sources withs (:end expr))))

(defmethod find-used-fields [:sql :macaw.ast/set-operation]
  [driver sources withs expr]
  (mapcat (partial find-used-fields driver sources withs)
          (:selects expr)))

(defmethod find-used-fields [:sql :macaw.ast/analytic-expression]
  [driver sources withs expr]
  (let [rec (partial find-used-fields driver sources withs)]
    (concat (rec (:expression expr))
            (rec (:offset expr))
            (rec (:window expr))
            (mapcat rec (:partition-by expr))
            (mapcat rec (:order-by expr)))))

(defmulti find-returned-fields
  (fn [driver _sources _withs expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod find-returned-fields :default
  [driver sources withs {:keys [alias] :as expr}]
  [{:alias (when alias
             (sql.normalize/normalize-name driver alias))
    :type :custom-field
    :used-fields (into #{} (find-used-fields driver sources withs expr))}])

(defmethod find-returned-fields [:sql :macaw.ast/column]
  [driver sources _withs expr]
  (get-column driver sources expr))

(defmethod find-returned-fields [:sql :macaw.ast/wildcard]
  [driver sources _withs expr]
  (into []
        (mapcat :returned-fields)
        (first sources)))

(defmethod find-returned-fields [:sql :macaw.ast/table-wildcard]
  [driver sources _withs expr]
  (or (some-> (find-source (col-fields driver expr) sources)
              :returned-fields)
      [(assoc expr
              :type :invalid-table-wildcard)]))

(defmethod find-returned-fields [:sql :macaw.ast/set-operation]
  [driver sources withs expr]
  (->> (map (partial find-returned-fields driver sources withs)
            (:selects expr))
       (apply map (fn [& fields]
                    {:alias (or (:alias (first fields))
                                (:column (first fields)))
                     :type :composite-field
                     :member-fields (into [] fields)}))))

(defmulti field-references-impl
  (fn [driver _outside-sources _withs expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod field-references-impl [:sql :macaw.ast/table]
  [driver _outside-sources withs expr]
  (or (when-let [source (find-source expr [withs])]
        (update source :names assoc :table-alias (:table-alias expr)))
      {:used-fields #{}
       :returned-fields [{:type :all-columns
                          :table (normalize-fields driver expr)}]
       :names (normalize-fields driver expr)}))

(defn- get-select-sources
  [driver outside-sources withs expr]
  (cond-> (mapv (partial field-references-impl driver outside-sources withs) (:join expr))
    (:from expr) (conj (field-references-impl driver outside-sources withs (:from expr)))))

(defmethod find-used-fields [:sql :macaw.ast/select]
  [driver outside-sources withs expr]
  (let [local-sources (get-select-sources driver outside-sources withs expr)
        sources (cons local-sources outside-sources)
        rec (partial find-used-fields driver sources withs)]
    (-> (into #{}
              (mapcat rec)
              (:select expr))
        (into (rec (:where expr)))
        (into (mapcat rec)
              (:join expr))
        (into (mapcat rec)
              (:group-by expr))
        (into (mapcat rec)
              (:order-by expr))
        (into (mapcat :used-fields)
              local-sources))))

(defmethod find-returned-fields [:sql :macaw.ast/select]
  [driver outside-sources withs expr]
  (let [sources (cons (get-select-sources driver outside-sources withs expr)
                      outside-sources)
        returned-fields (mapcat (partial find-returned-fields driver sources withs) (:select expr))]
    (if (:alias expr)
      ;; :alias is a column alias, so this is presumably something like `select (select * from ...)`
      ;; there should only be one field returned, and that field should have the appropriate alias
      (do (assert (= 1 (count returned-fields)))
          (map #(assoc % :alias (sql.normalize/normalize-name driver (:alias expr)))
               returned-fields))
      returned-fields)))

(defmethod field-references-impl [:sql :macaw.ast/select]
  [driver outside-sources outside-withs expr]
  (let [local-withs (map (partial field-references-impl driver outside-sources outside-withs)
                         (:with expr))
        withs (into outside-withs local-withs)]
    {:used-fields (into (find-used-fields driver outside-sources withs expr)
                        (mapcat :used-fields)
                        local-withs)
     :returned-fields (into []
                            (find-returned-fields driver outside-sources withs expr))
     :names (when-let [alias (:table-alias expr)]
              {:table-alias (sql.normalize/normalize-name driver alias)})}))

(defmethod field-references-impl [:sql :macaw.ast/join]
  [driver outside-sources withs expr]
  (field-references-impl driver outside-sources withs (:source expr)))

(defmethod field-references-impl [:sql :macaw.ast/set-operation]
  [driver outside-sources withs expr]
  {:used-fields (->> (find-used-fields driver outside-sources withs expr)
                     (into #{}))
   :returned-fields (->> (find-returned-fields driver outside-sources withs expr)
                         (into []))
   :names (when-let [alias (:table-alias expr)]
            {:table-alias (sql.normalize/normalize-name driver alias)})})

(defmethod field-references-impl :default
  [_driver _outside-sources _outside-withs expr]
  {:used-fields []
   :returned-fields []
   :names nil
   :bad-sql true})

(defn field-references
  [driver expr]
  (-> (field-references-impl driver nil #{} expr)
      (dissoc :names)))
