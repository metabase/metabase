^{:clj-kondo/ignore [:metabase/modules]}
(ns metabase.sql-tools.macaw.references
  (:refer-clojure :exclude [every? mapv select-keys some])
  (:require
   [clojure.string :as str]
   [macaw.ast-types :as macaw.ast-types]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [every? mapv select-keys some]]))

(mr/def ::single-column
  [:map
   [:type [:= :single-column]]
   [:column :string]
   [:source-columns [:sequential [:sequential [:ref ::col-spec]]]]
   [:alias [:maybe :string]]])

(mr/def ::all-columns
  [:map
   [:type [:= :all-columns]]
   [:table [:map
            [:table :string]
            [:schema {:optional true} :string]
            [:database {:optional true} :string]
            [:table-alias {:optional true} :string]]]])

(mr/def ::unknown-columns
  [:map
   [:type [:= :unknown-columns]]])

(mr/def ::custom-field
  [:map
   [:type [:= :custom-field]]
   [:alias [:maybe :string]]
   [:used-fields [:set [:ref ::col-spec]]]])

(mr/def ::composite-field
  [:map
   [:type [:= :composite-field]]
   [:alias [:maybe :string]]
   [:member-fields [:sequential ::col-spec]]])

(mr/def ::invalid-table-wildcard
  [:map
   [:type [:= :invalid-table-wildcard]]
   [:table :string]
   [:schema {:optional true} :string]
   [:database {:optional true} :string]
   [:table-alias {:optional true} :string]])

(mr/def ::col-spec
  [:multi {:dispatch :type}
   [:single-column [:ref ::single-column]]
   [:all-columns [:ref ::all-columns]]
   [:unknown-columns [:ref ::unknown-columns]]
   [:custom-field [:ref ::custom-field]]
   [:composite-field [:ref ::composite-field]]])

(mr/def ::field-references
  [:map
   [:used-fields [:set [:ref ::col-spec]]]
   [:returned-fields [:sequential [:ref ::col-spec]]]
   ;; TODO: is the following boundary violation?
   [:errors [:set [:ref ::lib.schema.validate/error]]]])

(defn- normalize-fields [driver m]
  (update-vals m
               #(if (string? %)
                  (driver.sql/normalize-name driver %)
                  %)))

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

(defn- get-column [driver sources raw-col {:keys [return-table-matches?]}]
  (if (and (nil? (:table raw-col))
           (nil? (:schema raw-col))
           (nil? (:database raw-col))
           (driver.sql/reserved-literal driver (:column raw-col)))
    []
    (let [{:keys [alias column table] :as expr} (col-fields driver raw-col)
          valid-sources (if table
                          [[(find-source expr sources)]]
                          sources)
          source-columns (into []
                               (comp (map #(into []
                                                 (mapcat :returned-fields)
                                                 %))
                                     (filter seq))
                               valid-sources)
          source-column (some #(when (= column (or (:alias %) (:column %)))
                                 %)
                              (first source-columns))
          source-matches (when (nil? table)
                           (some (fn [inner-sources]
                                   (some #(when (= column (or (-> % :names :table-alias) (-> % :names :table)))
                                            (:returned-fields %))
                                         inner-sources))
                                 sources))]
      (cond
        ;; we have a direct column match
        source-column [{:col (cond-> source-column
                               alias (assoc :alias alias))}]
        ;; we have a match to a table
        source-matches (when return-table-matches?
                         [{:col {:type :custom-field
                                 :alias (or alias column)
                                 :used-fields (set source-matches)}}])
        ;; we don't have a direct match, so list the possible sources
        :else [{:col {:column column
                      :alias alias
                      :type :single-column
                      :source-columns source-columns}
                ;; if we didn't find any potential sources, signal an error here
                :errors (when-not (some #(some identity %) valid-sources)
                          #{(if-let [name (table-name raw-col)]
                              (lib/missing-table-alias-error name)
                              (lib/missing-column-error column))})}]))))

(defmulti find-used-fields
  "Finds the fields used in a given sql expression."
  {:added "0.57.0", :arglists '([driver sources withs expr])}
  (fn [driver _sources _withs expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod find-used-fields :default
  [_driver _sources _withs _expr]
  nil)

(defmethod find-used-fields [:sql :macaw.ast/column]
  [driver sources _withs expr]
  (get-column driver sources expr {:return-table-matches? false}))

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
  "Finds the fields returned by a given sql query/expression."
  {:added "0.57.0", :arglists '([driver sources withs expr])}
  (fn [driver _sources _withs expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod find-returned-fields :default
  [driver sources withs {:keys [alias] :as expr}]
  [{:col {:alias (when alias
                   (driver.sql/normalize-name driver alias))
          :type :custom-field
          :used-fields (into #{} (keep :col) (find-used-fields driver sources withs expr))}}])

(defmethod find-returned-fields [:sql :macaw.ast/column]
  [driver sources _withs expr]
  (get-column driver sources expr {:return-table-matches? true}))

(defn wrap-col
  "Wraps the argument in `{:col _}`"
  [col]
  {:col col})

(defmethod find-returned-fields [:sql :macaw.ast/wildcard]
  [_driver sources _withs _expr]
  (into []
        (mapcat #(->> % :returned-fields (map wrap-col)))
        (first sources)))

(defmethod find-returned-fields [:sql :macaw.ast/table-wildcard]
  [driver sources _withs expr]
  (or (some->> (find-source (col-fields driver expr) sources)
               :returned-fields
               (map wrap-col))
      [{:errors #{(lib/missing-table-alias-error (table-name expr))}}]))

(defmethod find-returned-fields [:sql :macaw.ast/set-operation]
  [driver sources withs expr]
  (->> (map (partial find-returned-fields driver sources withs)
            (:selects expr))
       (apply map (fn [& fields]
                    (let [cols (keep :col fields)]
                      {:col {:alias (or (:alias (first cols))
                                        (:column (first cols)))
                             :type :composite-field
                             :member-fields (into [] cols)}
                       :errors (mapcat :errors fields)})))))

(defmulti field-references-impl
  "Implementation of field-references."
  {:added "0.57.0", :arglists '([driver sources withs expr])}
  (fn [driver _outside-sources _withs expr]
    [(driver/dispatch-on-initialized-driver driver) (:type expr)])
  :hierarchy #'driver/hierarchy)

(defmethod field-references-impl [:sql :macaw.ast/table]
  [driver _outside-sources withs expr]
  (or (when-let [source (find-source expr [withs])]
        (update source :names assoc :table-alias (:table-alias expr)))
      {:used-fields #{}
       :returned-fields [{:type :all-columns
                          :table (->> (select-keys expr [:table :schema :database :table-alias])
                                      (normalize-fields driver))}]
       :errors #{}
       :names (normalize-fields driver expr)}))

(defn- get-select-sources
  [driver outside-sources withs expr]
  (cond-> (mapv (partial field-references-impl driver outside-sources withs) (:join expr))
    (:from expr) (conj (field-references-impl driver outside-sources withs (:from expr)))))

(defmethod find-used-fields [:sql :macaw.ast/select]
  [driver outside-sources withs expr]
  (let [local-sources (get-select-sources driver outside-sources withs expr)
        with-outside (cons local-sources outside-sources)
        with-select (cons [{:used-fields #{}
                            :returned-fields (->> (find-returned-fields driver outside-sources withs expr)
                                                  (map :col)
                                                  (filter :alias))
                            :names nil
                            :errors #{}}]
                          with-outside)
        rec (partial find-used-fields driver with-select withs)]
    (into #{}
          cat
          [;; a select can't refer to its own aliases, so don't include them in sources here
           (mapcat (partial find-used-fields driver with-outside withs)
                   (:select expr))
           (rec (:where expr))
           (mapcat rec (:join expr))
           (mapcat rec (:group-by expr))
           (mapcat rec (:order-by expr))
           (mapcat #(->> % :used-fields (map wrap-col))
                   local-sources)])))

(defmethod find-returned-fields [:sql :macaw.ast/select]
  [driver outside-sources withs expr]
  (let [sources (cons (get-select-sources driver outside-sources withs expr)
                      outside-sources)
        returned-fields (mapcat (partial find-returned-fields driver sources withs) (:select expr))]
    (if (:alias expr)
      ;; :alias is a column alias, so this is presumably something like `select (select * from ...)`
      ;; there should only be one field returned, and that field should have the appropriate alias
      (do (assert (= 1 (count returned-fields)))
          (map #(assoc-in % [:col :alias] (driver.sql/normalize-name driver (:alias expr)))
               returned-fields))
      returned-fields)))

(defmethod field-references-impl [:sql :macaw.ast/select]
  [driver outside-sources outside-withs expr]
  (let [local-withs (reduce (fn [current-withs with-expr]
                              (conj current-withs (field-references-impl driver outside-sources current-withs with-expr)))
                            outside-withs
                            (:with expr))
        withs (into outside-withs local-withs)
        current-used-fields (find-used-fields driver outside-sources withs expr)
        returned-fields (find-returned-fields driver outside-sources withs expr)]
    {:used-fields (into #{}
                        cat
                        [(keep :col current-used-fields)
                         (mapcat :used-fields local-withs)])
     :returned-fields (into [] (keep :col) returned-fields)
     :errors (into #{}
                   (comp cat (mapcat :errors))
                   [returned-fields current-used-fields local-withs])
     :names (when-let [alias (:table-alias expr)]
              {:table-alias (driver.sql/normalize-name driver alias)})}))

(defmethod field-references-impl [:sql :macaw.ast/join]
  [driver outside-sources withs expr]
  (field-references-impl driver outside-sources withs (:source expr)))

(defmethod field-references-impl [:sql :macaw.ast/set-operation]
  [driver outside-sources withs expr]
  (let [used-fields (find-used-fields driver outside-sources withs expr)
        returned-fields (find-returned-fields driver outside-sources withs expr)]
    {:used-fields (into #{} (keep :col) used-fields)
     :returned-fields (into [] (keep :col) returned-fields)
     :errors (into #{}
                   (comp cat (mapcat :errors))
                   [used-fields returned-fields])
     :names (when-let [alias (:table-alias expr)]
              {:table-alias (driver.sql/normalize-name driver alias)})}))

(defmethod field-references-impl [:sql :macaw.ast/table-function]
  [driver _outside-sources _withs expr]
  {:used-fields #{}
   :returned-fields [{:type :unknown-columns}]
   :names (when-let [alias (:table-alias expr)]
            {:table-alias (driver.sql/normalize-name driver alias)})
   :errors #{}})

(defmethod field-references-impl :default
  [_driver _outside-sources _outside-withs _expr]
  {:used-fields #{}
   :returned-fields []
   :names nil
   :errors #{(lib/syntax-error)}})

(mu/defn field-references :- [:ref ::field-references]
  "Takes a sql query in the macaw ast format and returns the fields referenced by a query.

  Specifically, this returns a set of the fields used and a list of the fields returned, along with a boolean that
  denotes when this is given an invalid query of some sort."
  [driver :- :keyword
   expr :- macaw.ast-types/ast]
  (-> (field-references-impl driver nil #{} expr)
      (dissoc :names)))
