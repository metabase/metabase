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
  (->> (select-keys m [:type :column :table :schema :database])
       (normalize-fields driver)))

(defmulti find-used-fields
  (fn [driver expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod find-used-fields :default
  [_driver _expr]
  nil)

(defmethod find-used-fields [:sql :macaw.ast/select]
  [driver expr]
  (let [rec (partial find-used-fields driver)]
    (into #{}
          (concat (mapcat rec (:select expr))
                  (rec (:where expr))
                  (mapcat rec (:join expr))
                  (mapcat rec (:group-by expr))
                  (mapcat rec (:order-by expr))))))

(defmethod find-used-fields [:sql :macaw.ast/column]
  [driver expr]
  [(col-fields driver expr)])

(defmethod find-used-fields [:sql :macaw.ast/unary-expression]
  [driver expr]
  (find-used-fields driver (:expression expr)))

(defmethod find-used-fields [:sql :macaw.ast/binary-expression]
  [driver expr]
  (concat (find-used-fields driver (:left expr))
          (find-used-fields driver (:right expr))))

(defmethod find-used-fields [:sql :macaw.ast/expression-list]
  [driver expr]
  (mapcat (partial find-used-fields driver) (:expressions expr)))

(defmethod find-used-fields [:sql :macaw.ast/join]
  [driver expr]
  (mapcat (partial find-used-fields driver) (:condition expr)))

(defmethod find-used-fields [:sql :macaw.ast/function]
  [driver expr]
  (mapcat (partial find-used-fields driver) (:params expr)))

(defmulti find-returned-fields
  (fn [driver expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod find-returned-fields :default
  [driver {:keys [alias] :as expr}]
  [{:alias (sql.normalize/normalize-name driver (or alias (str (gensym "anon-field"))))
    :type :custom-field
    :used-fields (find-used-fields driver expr)}])

(defmethod find-returned-fields [:sql :macaw.ast/select]
  [driver expr]
  (mapcat (partial find-returned-fields driver) (:select expr)))

(defmethod find-returned-fields [:sql :macaw.ast/column]
  [driver expr]
  [(col-fields driver expr)])

(defmethod find-returned-fields [:sql :macaw.ast/wildcard]
  [driver expr]
  [{:type :macaw.ast/wildcard}])

(defmethod find-returned-fields [:sql :macaw.ast/table-wildcard]
  [driver expr]
  [(col-fields driver expr)])

(defmulti field-references-impl
  (fn [driver expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod field-references-impl [:sql :macaw.ast/table]
  [driver expr]
  {:used-fields #{}
   :returned-fields [{:type :all-columns
                      :table (normalize-fields driver expr)}]
   :names (normalize-fields driver expr)})

(defn- table-matches? [search table]
  (or (when (and (not (:schema search))
                 (not (:database search)))
        (= (:table search) (:alias table)))
      (->> (select-keys search [:table :schema :database])
           keys
           (every? #(= (search %) (table %))))))

(defn- find-source [search sources]
  (some #(when (table-matches? search (:names %))
           %)
        sources))

(defmulti match-field (fn [expr _sources]
                        (:type expr)))

(defmethod match-field :macaw.ast/wildcard
  [_expr sources]
  (into []
        (mapcat :returned-fields)
        sources))

(defmethod match-field :macaw.ast/table-wildcard
  [expr sources]
  (some-> (find-source expr sources)
          :returned-fields))

(defmethod match-field :macaw.ast/column
  [{:keys [alias] :as expr} sources]
  (let [valid-sources (if (:table expr)
                        [(find-source expr sources)]
                        sources)
        source-columns (into []
                             (mapcat :returned-fields)
                             valid-sources)
        source-column (some #(when (= (:column expr) (or (:alias %) (:column %)))
                               %) source-columns)]
    [(if source-column
       (cond-> source-column
         alias (assoc :alias alias))
       (-> {:column (:column expr)
            :alias (:alias expr)
            :type :single-column}
           (assoc :source-columns source-columns)))]))

(defmethod match-field :custom-field
  [expr sources]
  [(update expr :used-fields (fn [fields]
                               (into #{}
                                     (mapcat #(match-field % sources))
                                     fields)))])

(defmethod field-references-impl [:sql :macaw.ast/select]
  [driver expr]
  (let [sources (conj (mapv (partial field-references-impl driver) (:join expr))
                      (field-references-impl driver (:from expr)))]
    {:used-fields (-> (into #{}
                            (mapcat #(match-field % sources))
                            (find-used-fields driver expr))
                      (into (mapcat :used-fields)
                            sources))
     :returned-fields (into []
                            (mapcat #(match-field % sources))
                            (find-returned-fields driver expr))
     :names (when-let [alias (:alias expr)]
              {:alias (sql.normalize/normalize-name driver alias)})}))

(defmethod field-references-impl [:sql :macaw.ast/join]
  [driver expr]
  (field-references-impl driver (:source expr)))

(defn field-references
  [driver expr]
  (-> (field-references-impl driver expr)
      (dissoc :names)))
