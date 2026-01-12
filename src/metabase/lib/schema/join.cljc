(ns metabase.lib.schema.join
  "Schemas for things related to joins."
  (:refer-clojure :exclude [mapv every? empty? not-empty])
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [every? mapv empty? not-empty]]))

(mr/def ::fields
  "The Fields to include in the results *if* a top-level `:fields` clause *is not* specified. This can be either
  `:none`, `:all`, or a sequence of Field clauses.

  * `:none`: no Fields from the joined table or nested query are included (unless indirectly included by breakouts or
     other clauses). This is the default, and what is used for automatically-generated joins.

  * `:all`: will include all of the Fields from the joined table or query

  * a sequence of Field clauses: include only the Fields specified. Only `:field` clauses are allowed here! References
    to expressions or aggregations in the thing we're joining should use column literal (string column name) `:field`
    references. This should be non-empty and all elements should be distinct (ignoring `:lib/uuid`)."
  [:multi
   {:dispatch (some-fn keyword? string?)}
   [true  [:enum {:decode/normalize common/normalize-keyword} :all :none]]
   ;; TODO -- `:fields` is supposed to be distinct (ignoring UUID), e.g. you can't have `[:field {} 1]` in there
   ;; twice. (#32489)
   [false
    [:and
     [:sequential {:min 1} [:ref :mbql.clause/field]]
     [:ref ::lib.schema.util/distinct-mbql-clauses]]]])

(mr/def ::alias
  "The name used to alias the joined table or query. This is usually generated automatically and generally looks like
  `table__via__field`. You can specify this yourself if you need to reference a joined field with a `:join-alias` in
  the options."
  [:schema
   {:gen/fmap         #(str % "-" (random-uuid))
    :decode/normalize #(cond-> % (keyword? %) u/qualified-name)}
   ::common/non-blank-string])

(mr/def ::condition
  [:ref ::expression/boolean])

(mr/def ::conditions
  [:sequential {:min 1} ::condition])

(def ordered-condition-operators
  "Operators that should be listed as options in join conditions. The front end shows the options in this order."
  [:= :> :< :>= :<= :!=])

(def condition-operators
  "Operators that should be listed as options in join conditions."
  (set ordered-condition-operators))

(mr/def ::condition.operator
  "Operators that should be listed as options in join conditions."
  (into [:enum] condition-operators))

(mr/def ::strategy
  "Valid values for the optional `:strategy` key in a join. Note that these are only valid if the current Database
  supports that specific join type; these match 1:1 with the Database `:features`, e.g. a Database that supports left
  joins will support the `:left-join` feature.

  When `:strategy` is not specified, `:left-join` is the default strategy."
  [:enum
   {:decode/normalize common/normalize-keyword, :default :left-join}
   :left-join
   :right-join
   :inner-join
   :full-join])

(defn- normalize-join [join]
  (when join
    (let [{:keys [fields], :as join} (common/normalize-map join)]
      (cond-> join
        (and (not (keyword? fields)) (empty? fields))
        (dissoc :fields)

        (seq (:source-metadata join))
        (-> (assoc-in [:stages (dec (count (:stages join))) :lib/stage-metadata] {:lib/type :metadata/results
                                                                                  :columns  (:source-metadata join)})
            (dissoc :source-metadata))

        ;; automatically fix :condition => :conditions if we run into it. Kinda overlapping responsibility
        ;; with [[metabase.lib.convert]] but this lets us write busted stuff in tests more easily
        ;; using [[metabase.lib.test-util.macros/mbql-5-query]]
        (:condition join)
        (-> (dissoc :condition)
            (assoc :conditions [(:condition join)]))))))

(mr/def ::validate-field-aliases-match-join-alias
  [:fn
   {:error/message    "All join :fields should have a :join-alias that matches the join's :alias"
    :decode/normalize (fn [join]
                        (cond-> join
                          (and (:alias join)
                               (sequential? (:fields join)))
                          (update :fields (fn [fields]
                                            (mapv (fn [[tag opts id-or-name :as _field-ref]]
                                                    [tag (assoc opts :join-alias (:alias join)) id-or-name])
                                                  fields)))))}
   (fn [{join-alias :alias, fields :fields, :as _join}]
     (or
      (not (sequential? fields))
      ;; a [[metabase.lib.join.util/PartialJoin]] (a join being built) might not have an alias yet; do not validate
      ;; in that case.
      (not join-alias)
      (every? (fn [[_tag opts _id-or-name :as _field-ref]]
                (= (:join-alias opts) join-alias))
              fields)))])

(mr/def ::join
  [:and
   [:map
    {:default {}, :decode/normalize normalize-join}
    [:lib/type    [:= {:default :mbql/join, :decode/normalize common/normalize-keyword} :mbql/join]]
    [:stages      [:ref :metabase.lib.schema/stages]]
    [:conditions  ::conditions]
    [:alias       ::alias]
    [:fields   {:optional true} ::fields]
    [:strategy {:optional true} ::strategy]]
   (common/disallowed-keys
    {:lib/stage-metadata "joins should not have metadata attached directly to them; attach metadata to their last stage instead"
     :source-metadata    "joins should not have metadata attached directly to them; attach metadata to their last stage instead"
     :condition          ":condition is not allowed for MBQL 5 joins, use :conditions instead"
     :source-card        "join should not have :source-card; use :stages instead"
     :source-table       "join should not have :source-table; use :stages instead"
     :source-query       "join should not have :source-query; use :stages instead"
     :filter             "join should not have top-level :filters; these should belong to one of the join :stages"
     :filters            "join should not have top-level :filters; these should belong to one of the join :stages"
     :parameters         "join should not have top-level :parameters; these should belong to one of the join :stages"
     :ident              ":ident is deprecated and should not be included in joins"})
   [:ref ::validate-field-aliases-match-join-alias]])

(mr/def ::joins
  [:and
   [:sequential {:min 1} [:ref ::join]]
   [:fn
    {:error/fn (fn [& _]
                 (i18n/tru "Join aliases must be unique at a given stage of a query"))}
    (fn ensure-unique-join-aliases [joins]
      (if-let [aliases (not-empty (filter some? (map :alias joins)))]
        (apply distinct? aliases)
        true))]])

(mr/def ::strategy.option
  [:map
   [:lib/type [:= :option/join.strategy]]
   [:strategy [:ref ::strategy]]
   [:default {:optional true} :boolean]])
