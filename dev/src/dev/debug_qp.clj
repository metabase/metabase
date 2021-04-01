(ns dev.debug-qp
  (:require [clojure.data :as data]
            [clojure.pprint :as pprint]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models :refer [Field Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

;; see docstring for `process-query-debug` for descriptions of what these do.

(def ^:private ^:dynamic *print-full?*     true)
(def ^:private ^:dynamic *print-metadata?* false)
(def ^:private ^:dynamic *print-names?*    true)
(def ^:private ^:dynamic *validate-query?* false)

(defn- remove-metadata
  "Replace field metadata in `x` with `...`."
  [x]
  (walk/prewalk
   (fn [form]
     (if (map? form)
       (reduce
        (fn [m k]
          (m/update-existing m k (constantly '...)))
        form
        [:cols :results_metadata :source-metadata])
       form))
   x))

(defn- field-and-table-name [field-id]
  (let [{field-name :name, table-id :table_id} (db/select-one [Field :name :table_id] :id field-id)]
    [(db/select-one-field :name Table :id table-id) field-name]))

(defn- add-name-to-field-id [id]
  (when id
    (let [[field-name table-name] (field-and-table-name id)]
      (symbol (format "#_\"%s.%s\"" field-name table-name)))))

(defn add-names
  "Walk a MBQL snippet `x` and add comment forms with the names of the Fields referenced to any `:field-id` clauses
  encountered. Helpful for debugging!"
  [x]
  (walk/postwalk
   (fn [form]
     (mbql.u/replace form
       [:field (id :guard integer?) opts]
       [:field id (add-name-to-field-id id) (cond-> opts
                                              (integer? (:source-field opts))
                                              (update :source-field (fn [source-field]
                                                                      (symbol (format "(do %s %d)"
                                                                                      (add-name-to-field-id source-field)
                                                                                      source-field)))))]

       (m :guard (every-pred map? (comp integer? :source-table)))
       (update m :source-table (fn [table-id]
                                 (symbol (format "(do #_%s %d)"
                                                 (db/select-one-field :name Table :id table-id)
                                                 table-id))))))
   x))

(defn- format-output [x]
  (cond-> x
    (not *print-metadata?*) remove-metadata
    *print-names?*          add-names))

(defn- print-diff [before after]
  (assert (not= before after))
  (let [before                         (format-output before)
        after                          (format-output after)
        [only-in-before only-in-after] (data/diff before after)]
    (when *print-full?*
      (println (u/pprint-to-str 'cyan (format-output after))))
    (when (seq only-in-before)
      (println (u/colorize 'red (str "-\n" (u/pprint-to-str only-in-before)))))
    (when (seq only-in-after)
      (println (u/colorize 'green (str "+\n" (u/pprint-to-str only-in-after)))))))

(defn- debug-query-changes [middleware-var middleware]
  (fn [next-middleware]
    (fn [query-before rff context]
      (try
        ((middleware
          (fn [query-after rff context]
            (when-not (= query-before query-after)
              (println (format "[pre] %s transformed query:" middleware-var))
              (print-diff query-before query-after))
            (when *validate-query?*
              (try
                (mbql.s/validate-query query-after)
                (catch Throwable e
                  (when (::our-error? (ex-data e))
                    (throw e))
                  (throw (ex-info (format "%s middleware produced invalid query" middleware-var)
                                  {::our-error? true
                                   :middleware  middleware-var
                                   :before      query-before
                                   :query       query-after}
                                  e)))))
            (next-middleware query-after rff context)))
         query-before rff context)
        (catch Throwable e
          (when (::our-error? (ex-data e))
            (throw e))
          (println (format "Error pre-processing query in %s:\n%s"
                           middleware-var
                           (u/pprint-to-str 'red (Throwable->map e))))
          (throw (ex-info "Error pre-processing query"
                          {::our-error? true
                           :middleware  middleware-var
                           :query       query-before}
                          e)))))))

(defn- debug-rffs [middleware-var middleware before-rff-xform after-rff-xform]
  (fn [next-middleware]
    (fn [query rff-after context]
      ((middleware
        (fn [query rff-before context]
          (next-middleware query (before-rff-xform rff-before) context)))
       query (after-rff-xform rff-after) context))))

(defn- debug-metadata-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rffs
     middleware-var
     middleware
     (fn before-rff-xform [rff]
       (fn [metadata-before]
         (reset! before metadata-before)
         (try
           (rff metadata-before)
           (catch Throwable e
             (when (::our-error? (ex-data e))
               (throw e))
             (println (format "Error post-processing result metadata in %s:\n%s"
                              middleware-var
                              (u/pprint-to-str 'red (Throwable->map e))))
             (throw (ex-info "Error post-processing result metadata"
                             {::our-error? true
                              :middleware  middleware-var
                              :metadata    metadata-before}
                             e))))))
     (fn after-rff-xform [rff]
       (fn [metadata-after]
         (when-not (= @before metadata-after)
           (println (format "[post] %s transformed metadata:" middleware-var))
           (print-diff @before metadata-after))
         (rff metadata-after))))))

(defn- debug-rfs [middleware-var middleware before-xform after-xform]
  (debug-rffs
   middleware-var
   middleware
   (fn before-rff-xform [rff]
     (fn [metadata]
       (let [rf (rff metadata)]
         (before-xform rf))))
   (fn after-rff-xform [rff]
     (fn [metadata]
       (let [rf (rff metadata)]
         (after-xform rf))))))

(defn- debug-result-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rfs
     middleware-var
     middleware
     (fn before-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (reset! before result)
          (try
            (rf result)
            (catch Throwable e
              (when (::our-error? (ex-data e))
                (throw e))
              (println (format "Error post-processing result in %s:\n%s"
                               middleware-var
                               (u/pprint-to-str 'red (Throwable->map e))))
              (throw (ex-info "Error post-processing result"
                              {::our-error? true
                               :middleware  middleware-var
                               :result      result}
                              e)))))
         ([result row] (rf result row))))
     (fn after-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (when-not (= @before result)
            (println (format "[post] %s transformed result:" middleware-var))
            (print-diff @before result))
          (rf result))
         ([result row] (rf result row)))))))

(defn- debug-row-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rfs
     middleware-var
     middleware
     (fn before-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result row]
          (reset! before row)
          (try
            (rf result row)
            (catch Throwable e
              (when (::our-error? (ex-data e))
                (throw e))
              (println (format "Error reducing row in %s:\n%s"
                               middleware-var
                               (u/pprint-to-str 'red (Throwable->map e))))
              (throw (ex-info "Error reducing row"
                              {::our-error? true
                               :middleware  middleware-var
                               :result      result
                               :row         row}
                              e)))))))
     (fn after-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result row]
          (when-not (= @before row)
            (println (format "[post] %s transformed row" middleware-var))
            (print-diff @before row))
          (rf result row)))))))

(defn process-query-debug
  "Process a query using a special QP that wraps all of the normal QP middleware and prints any transformations done
  during pre or post-processing.

  Options:

  * `:print-full?` -- whether to print the entire query/result/etc. after each transformation

  * `:print-metadata?` -- whether to print metadata columns such as `:cols`or `:source-metadata`
    in the query/results

  * `:print-names?` -- whether to print comments with the names of fields/tables as part of `:field` forms and
    for `:source-table`

  * `:validate-query?` -- whether to validate the query after each preprocessing step, so you can figure out who's
    breaking it. (TODO -- `mbql-to-native` middleware currently leaves the old mbql `:query` in place,
    which cases query to fail at that point -- manually comment that behavior out if needed"
  [query & {:keys [print-full? print-metadata? print-names? validate-query? context]
            :or   {print-full? true, print-metadata? false, print-names? true, validate-query? false}}]
  (binding [*print-full?*               print-full?
            *print-metadata?*           print-metadata?
            *print-names?*              print-names?
            *validate-query?*           validate-query?
            pprint/*print-right-margin* 80]
    (let [middleware (for [middleware-var qp/default-middleware
                           :when          middleware-var]
                       (->> middleware-var
                            (debug-query-changes middleware-var)
                            (debug-metadata-changes middleware-var)
                            (debug-result-changes middleware-var)
                            (debug-row-changes middleware-var)))
          qp         (qp.reducible/sync-qp (#'qp/base-qp middleware))]
      (if context
        (qp query context)
        (qp query)))))

(defn- strip-$ [coll]
  (remove (partial = ::$) coll))

(defn- can-symbolize? [form]
  (mbql.u/match-one form
    (s :guard string?)
    (not (re-find #"\s+" s))

    [:field-id id]
    (every? can-symbolize? (field-and-table-name id))

    [:field-literal field-name _]
    (can-symbolize? field-name)

    [:fk-> x y]
    (every? can-symbolize? [x y])

    [:joined-field join-alias clause]
    (every? can-symbolize? [join-alias clause])))

(defn- expand [query table]
  (mbql.u/replace query
    ([:field-id id] :guard can-symbolize?)
    (let [[table-name field-name] (field-and-table-name id)
          field-name              (str/lower-case field-name)
          table-name              (str/lower-case table-name)]
      (if (= table-name table)
        [::$ field-name]
        [::$ table-name field-name]))

    ([:field-literal field-name base-type] :guard can-symbolize?)
    [::* field-name (name base-type)]

    ([:datetime-field field-clause unit] :guard can-symbolize?)
    (into [::! (name unit)] (strip-$ (expand field-clause table)))

    [:datetime-field field-clause unit]
    [:datetime-field (expand field-clause table) unit]

    ([:fk-> x y] :guard can-symbolize?)
    [::-> (expand x table) (expand y table)]

    [:fk-> x y]
    [:fk-> (expand x table) (expand y table)]

    ([:joined-field join-alias field-clause] :guard can-symbolize?)
    (into [::& join-alias] (strip-$ (expand field-clause table)))

    [:joined-field join-alias field-clause]
    [:joined-field join-alias (expand field-clause table)]

    (m :guard (every-pred map? (comp integer? :source-table)))
    (-> (update m :source-table (fn [table-id]
                                  [::$$ (str/lower-case (db/select-one-field :name Table :id table-id))]))
        (expand table))))

(defn- symbolize [query]
  (mbql.u/replace query
    [::-> x y]
    (symbol (format "%s->%s" (symbolize x) (str/replace (symbolize y) #"^\$" "")))

    [(qualifier :guard #{::$ ::& ::!}) & args]
    (symbol (str (name qualifier) (str/join \. (strip-$ args))))

    [::* field-name base-type]
    (symbol (format "*%s/%s" field-name base-type))

    [::$$ table-name]
    (symbol (format "$$%s" table-name))))

(defn- query-table-name [{:keys [source-table source-query]}]
  (cond
    source-table
    (str/lower-case (db/select-one-field :name Table :id source-table))

    source-query
    (recur source-query)))

(defn to-mbql-shorthand
  ([query]
   (to-mbql-shorthand query (query-table-name (:query query))))

  ([query table-name]
   (let [symbolized (-> query (expand table-name) symbolize)
         table-symb (some-> table-name symbol)]
     (if (:query symbolized)
       (list 'mt/mbql-query table-symb (-> (:query symbolized)
                                           (dissoc :source-table)))
       (list 'mt/$ids table-symb symbolized)))))

(deftest to-mbql-shorthand-test
  (mt/dataset sample-dataset
    (is (= '(mt/mbql-query orders
              {:joins       [{:source-table $$people
                              :fields       :all
                              :condition    [:= $user_id [:joined-field "People - User" $people.id]]
                              :alias        "People - User"}]
               :aggregation [[:sum $total]
                             [:sum $products.id]]
               :breakout    [&P.people.source
                             $product_id->products.id
                             [:fk-> $product_id [:field-literal "w o w" :Type/Text]]
                             $product_id->*wow/Text
                             *wow/Text]})
           (to-mbql-shorthand
            {:database (mt/id)
             :type     :query
             :query    {:joins        [{:fields       :all
                                        :source-table (mt/id :people)
                                        :condition    [:=
                                                       [:field-id (mt/id :orders :user_id)]
                                                       [:joined-field "People - User" [:field-id (mt/id :people :id)]]]
                                        :alias        "People - User"}]
                        :aggregation  [[:sum [:field-id (mt/id :orders :total)]]
                                       [:sum  [:field-id (mt/id :products :id)]]]
                        :breakout     [[:joined-field "P" [:field-id (mt/id :people :source)]]
                                       [:fk-> [:field-id (mt/id :orders :product_id)] [:field-id (mt/id :products :id)]]
                                       [:fk-> [:field-id (mt/id :orders :product_id)] [:field-literal "w o w" :Type/Text]]
                                       [:fk-> [:field-id (mt/id :orders :product_id)] [:field-literal "wow" :Type/Text]]
                                       [:field-literal "wow" :Type/Text]]
                        :source-table (mt/id :orders)}})))))
