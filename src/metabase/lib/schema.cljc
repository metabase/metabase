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
   [metabase.mbql.util.match :as mbql.match]
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

(defn- expression-ref-error-for-stage [stage]
  {:pre [(map? stage)]}
  (let [expression-names (into #{} (map (comp :lib/expression-name second)) (:expressions stage))]
    (mbql.match/match-one (dissoc stage :joins :lib/stage-metadata)
      [:expression _opts (expression-name :guard (complement expression-names))]
      (str "Invalid :expression reference: no expression named " (pr-str expression-name)))))

(defn- aggregation-ref-error-for-stage [stage]
  {:pre [(map? stage)]}
  (let [uuids (into #{} (map (comp :lib/uuid second)) (:aggregation stage))]
    (mbql.match/match-one (dissoc stage :joins :lib/stage-metadata)
      [:aggregation _opts (ag-uuid :guard (complement uuids))]
      (str "Invalid :aggregation reference: no aggregation with uuid " ag-uuid))))

(def ^:private ^{:arglists '([stage])} ref-error-for-stage
  "Validate references in the context of a single `stage`, independent of any previous stages. If there is an error with
  a reference, return a string describing the error."
  (some-fn expression-ref-error-for-stage
           aggregation-ref-error-for-stage))

(mr/def ::stage.valid-refs
  [:fn
   {:error/message "Valid references for a single query stage"
    :error/fn      (fn [{:keys [value]} _]
                     (when (map? value)
                       (ref-error-for-stage value)))}
   (every-pred map? (complement ref-error-for-stage))])

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
    [:source-table {:optional true} [:ref ::id/table]]
    [:source-card  {:optional true} [:ref ::id/card]]]
   [:fn
    {:error/message ":source-query is not allowed in pMBQL queries."}
    #(not (contains? % :source-query))]
   [:fn
    {:error/message "A query cannot have both a :source-table and a :source-card."}
    (complement (every-pred :source-table :source-card))]
   [:ref ::stage.valid-refs]])

;;; Schema for an MBQL stage that includes either `:source-table` or `:source-query`.
(mr/def ::stage.mbql.with-source-table
  [:merge
   [:ref ::stage.mbql]
   [:map
    [:source-table [:ref ::id/table]]]])

(mr/def ::stage.mbql.with-source-card
  [:merge
   [:ref ::stage.mbql]
   [:map
    [:source-card [:ref ::id/card]]]])

(mr/def ::stage.mbql.with-source
  [:or
   [:ref ::stage.mbql.with-source-table]
   [:ref ::stage.mbql.with-source-card]])

;;; Schema for an MBQL stage that DOES NOT include `:source-table` -- an MBQL stage that is not the initial stage.
(mr/def ::stage.mbql.without-source
  [:and
   [:ref ::stage.mbql]
   [:fn
    {:error/message "Only the initial stage of a query can have a :source-table or :source-card."}
    (complement (some-fn :source-table :source-card))]])

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

(defn- visible-join-alias?-fn
  "Apparently you're allowed to use a join alias for a join that appeared in any previous stage or the current stage, or
  *inside* any join in any previous stage or the current stage. Why? Who knows, but this is a real thing.
  See [[metabase.driver.sql.query-processor-test/join-source-queries-with-joins-test]] for example.

  This doesn't really make sense IMO (you should use string field refs to refer to things from a previous
  stage...right?) but for now we'll have to allow it until we can figure out how to go fix all of the old broken queries.

  Also, it's apparently legal to use a join alias to refer to a column that comes from a join in a source Card, and
  there is no way for us to know what joins exist in the source Card without a metadata provider, so we're just going
  to have to go ahead and skip validation in that case. Icky! But it's better than being overly strict and rejecting
  queries that the QP could have fixed.

  Anyways, this function returns a function with the signature:

    (visible-join-alias? <join-alias>) => boolean"
  [stage]
  (if (:source-card stage)
    (constantly true)
    (letfn [(join-aliases-in-join [join]
              (cons
               (:alias join)
               (mapcat join-aliases-in-stage (:stages join))))
            (join-aliases-in-stage [stage]
              (mapcat join-aliases-in-join (:joins stage)))]
      (set (join-aliases-in-stage stage)))))

(defn- join-ref-error-for-stages [stages]
  {:pre [((some-fn nil? sequential?) stages) (every? map? stages)]}
  (loop [visible-join-alias? (constantly false), i 0, [stage & more] stages]
    (assert (map? stage))
    (let [visible-join-alias? (some-fn visible-join-alias? (visible-join-alias?-fn stage))]
      (or
       (mbql.match/match-one (dissoc stage :joins :stage/metadata)
         [:field ({:join-alias (join-alias :guard (complement visible-join-alias?))} :guard :join-alias) _id-or-name]
         (str "Invalid :field reference in stage " i ": no join named " (pr-str join-alias)))
       (when (seq more)
         (recur visible-join-alias? (inc i) more))))))

(def ^:private ^{:arglists '([stages])} ref-error-for-stages
  "Like [[ref-error-for-stage]], but validate references in the context of a sequence of several stages; for validations
  that can't be done on the basis of just a single stage. For example join alias validation needs to take into account
  previous stages."
  ;; this var is ultimately redundant for now since it just points to one function but I'm leaving it here so we can
  ;; add more stuff to it the future as we validate more things.
  join-ref-error-for-stages)

(mr/def ::stages.valid-refs
  [:fn
   {:error/message "Valid references for all query stages"
    :error/fn      (fn [{:keys [value]} _]
                     (when (and (sequential? value)
                                (every? map? value))
                       (ref-error-for-stages value)))}
   (every-pred sequential?
               #(every? map? %)
               (complement ref-error-for-stages))])

(mr/def ::stages
  [:and
   [:cat
    [:schema [:ref ::stage.initial]]
    [:* [:schema [:ref ::stage.additional]]]]
   [:ref ::stages.valid-refs]])

(mr/def ::query
  [:and
   [:map
    [:lib/type [:= :mbql/query]]
    [:database [:or
                ::id/database
                ::id/saved-questions-virtual-database]]
    [:stages   [:ref ::stages]]]
   lib.schema.util/UniqueUUIDs])
