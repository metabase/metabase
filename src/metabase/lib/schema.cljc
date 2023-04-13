(ns metabase.lib.schema
  "Malli schema for the pMBQL query type, the version of MBQL produced and manipulated by the new Cljc
  Metabase lib. Currently this is a little different from the version of MBQL consumed by the QP, specified
  in [[metabase.mbql.schema]]. Hopefully these versions will converge in the future.

  Some primitives below are duplicated from [[metabase.util.malli.schema]] since that's not `.cljc`. Other stuff is
  copied from [[metabase.mbql.schema]] so this can exist completely independently; hopefully at some point in the
  future we can deprecate that namespace and eventually do away with it entirely."
  (:require
   [metabase.lib.schema.aggregation :as aggregation]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.expression.arithmetic]
   [metabase.lib.schema.expression.conditional]
   [metabase.lib.schema.expression.string]
   [metabase.lib.schema.expression.temporal]
   [metabase.lib.schema.filter]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.join :as join]
   [metabase.lib.schema.literal]
   [metabase.lib.schema.order-by :as order-by]
   [metabase.lib.schema.ref :as ref]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.util.malli.registry :as mr]))

(comment metabase.lib.schema.expression.arithmetic/keep-me
         metabase.lib.schema.expression.conditional/keep-me
         metabase.lib.schema.expression.string/keep-me
         metabase.lib.schema.expression.temporal/keep-me
         metabase.lib.schema.filter/keep-me
         metabase.lib.schema.literal/keep-me)

(mr/def ::stage.native
  [:map
   [:lib/type [:= :mbql.stage/native]]
   [:native any?]
   [:args {:optional true} [:sequential any?]]])

(mr/def ::breakouts
  [:sequential {:min 1} [:ref ::ref/ref]])

(mr/def ::fields
  [:sequential {:min 1} [:ref ::ref/ref]])

(mr/def ::filters
  [:sequential {:min 1} [:ref ::expression/boolean]])

(mr/def ::source-table
  [:or
   [:ref ::id/table]
   [:ref ::id/table-card-id-string]])

(defn- join-ref-error [stage]
  (let [join-aliases (into #{} (keep :alias) (:joins stage))]
    (mbql.u/match-one stage
      [:field ({:join-alias (join-alias :guard (complement join-aliases))} :guard :join-alias) _id-or-name]
      (str "Invalid :field reference: no join named " (pr-str join-alias)))))

(defn- expression-ref-error [stage]
  (let [expression-names (set (keys (:expressions stage)))]
    (mbql.u/match-one stage
      [:expression _opts (expression-name :guard (complement expression-names))]
      (str "Invalid :expression reference: no expression named " (pr-str expression-name)))))

(defn- aggregation-ref-error [stage]
  (let [num-aggregations (count (:aggregation stage))]
    (mbql.u/match-one stage
      [:aggregation _opts (index :guard #(>= % num-aggregations))]
      (str "Invalid :aggregation reference: no aggregation at index " index))))

(def ^:private ^{:arglists '([stage])} ref-error
  (some-fn join-ref-error
           expression-ref-error
           aggregation-ref-error))

(mr/def ::valid-refs
  [:fn
   {:error/message "Valid references for query stage"
    :error/fn      (fn [{:keys [value]} _]
                     (ref-error value))}
   (complement ref-error)])

(mr/def ::stage.mbql
  [:and
   [:map
    [:lib/type     [:= :mbql.stage/mbql]]
    [:joins        {:optional true} [:ref ::join/joins]]
    [:expressions  {:optional true} [:ref ::expression/expressions]]
    [:breakout     {:optional true} ::breakouts]
    [:aggregation  {:optional true} [:ref ::aggregation/aggregations]]
    [:fields       {:optional true} ::fields]
    [:filters      {:optional true} ::filters]
    [:order-by     {:optional true} [:ref ::order-by/order-bys]]
    [:source-table {:optional true} [:ref ::source-table]]]
   [:fn
    {:error/message ":source-query is not allowed in pMBQL queries."}
    #(not (contains? % :source-query))]
   [:ref ::valid-refs]])

;;; Schema for an MBQL stage that includes either `:source-table` or `:source-query`.
(mr/def ::stage.mbql.with-source
  [:and
   [:ref ::stage.mbql]
   [:map
    [:source-table [:ref ::source-table]]]])

;;; Schema for an MBQL stage that DOES NOT include `:source-table` -- an MBQL stage that is not the initial stage.
(mr/def ::stage.mbql.without-source
  [:and
   [:ref ::stage.mbql]
   [:fn
    {:error/message "Only the initial stage of a query can have a :source-table."}
    #(not (contains? % :source-table))]])

;;; the schemas are constructed this way instead of using `:or` because they give better error messages
(mr/def ::stage.type
  [:enum :mbql.stage/native :mbql.stage/mbql])

(mr/def ::stage
  [:and
   [:map
    [:lib/type ::stage.type]]
   [:multi {:dispatch :lib/type}
    [:mbql.stage/native [:ref ::stage.native]]
    [:mbql.stage/mbql   [:ref ::stage.mbql]]]])

(mr/def ::stage.initial
  [:and
   [:map
    [:lib/type ::stage.type]]
   [:multi {:dispatch :lib/type}
    [:mbql.stage/native [:ref ::stage.native]]
    [:mbql.stage/mbql   [:ref ::stage.mbql.with-source]]]])

(mr/def ::stage.additional
  ::stage.mbql.without-source)

(mr/def ::stages
  [:cat
   [:schema [:ref ::stage.initial]]
   [:* [:schema [:ref ::stage.additional]]]])

(mr/def ::query
  [:and
   [:map
    [:lib/type [:= :mbql/query]]
    [:database [:or
                ::id/database
                ::id/saved-questions-virtual-database]]
    [:stages   [:ref ::stages]]]
   lib.schema.util/UniqueUUIDs])
