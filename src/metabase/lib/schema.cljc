(ns metabase.lib.schema
  "Malli schema for the pMBQL query type, the version of MBQL produced and manipulated by the new Cljc
  Metabase lib. Currently this is a little different from the version of MBQL consumed by the QP, specified
  in [[metabase.legacy-mbql.schema]]. Hopefully these versions will converge in the future.

  Some primitives below are duplicated from [[metabase.util.malli.schema]] since that's not `.cljc`. Other stuff is
  copied from [[metabase.legacy-mbql.schema]] so this can exist completely independently; hopefully at some point in the
  future we can deprecate that namespace and eventually do away with it entirely."
  (:refer-clojure :exclude [ref])
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.schema.actions :as actions]
   [metabase.lib.schema.aggregation :as aggregation]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.expression.arithmetic]
   [metabase.lib.schema.expression.conditional]
   [metabase.lib.schema.expression.string]
   [metabase.lib.schema.expression.temporal]
   [metabase.lib.schema.expression.window]
   [metabase.lib.schema.filter]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.info :as info]
   [metabase.lib.schema.join :as join]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.order-by :as order-by]
   [metabase.lib.schema.parameter :as parameter]
   [metabase.lib.schema.ref :as ref]
   [metabase.lib.schema.template-tag :as template-tag]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util.malli.registry :as mr]))

(comment metabase.lib.schema.expression.arithmetic/keep-me
         metabase.lib.schema.expression.conditional/keep-me
         metabase.lib.schema.expression.string/keep-me
         metabase.lib.schema.expression.temporal/keep-me
         metabase.lib.schema.expression.window/keep-me
         metabase.lib.schema.filter/keep-me)

(mr/def ::stage.native
  [:and
   [:map
    {:decode/normalize common/normalize-map}
    [:lib/type [:= {:decode/normalize common/normalize-keyword} :mbql.stage/native]]
    ;; the actual native query, depends on the underlying database. Could be a raw SQL string or something like that.
    ;; Only restriction is that it is non-nil.
    [:native some?]
    ;; any parameters that should be passed in along with the query to the underlying query engine, e.g. for JDBC these
    ;; are the parameters we pass in for a `PreparedStatement` for `?` placeholders. These can be anything, including
    ;; nil.
    ;;
    ;; TODO -- pretty sure this is supposed to be `:params`, not `:args`, and this is allowed to be anything rather
    ;; than just `literal`... I think we're using the `literal` schema tho for either normalization or serialization
    [:args {:optional true} [:sequential ::literal/literal]]
    ;; the Table/Collection/etc. that this query should be executed against; currently only used for MongoDB, where it
    ;; is required.
    [:collection {:optional true} ::common/non-blank-string]
    ;; optional template tag declarations. Template tags are things like `{{x}}` in the query (the value of the
    ;; `:native` key), but their definition lives under this key.
    [:template-tags {:optional true} [:ref ::template-tag/template-tag-map]]
    ;; optional, set of Card IDs referenced by this query in `:card` template tags like `{{card}}`. This is added
    ;; automatically during parameter expansion. To run a native query you must have native query permissions as well
    ;; as permissions for any Cards' parent Collections used in `:card` template tag parameters.
    [:metabase.models.query.permissions/referenced-card-ids {:optional true} [:maybe [:set ::id/card]]]
    ;;
    ;; TODO -- parameters??
    ]
   [:fn
    {:error/message ":source-table is not allowed in a native query stage."}
    #(not (contains? % :source-table))]
   [:fn
    {:error/message ":source-card is not allowed in a native query stage."}
    #(not (contains? % :source-card))]])

(mr/def ::breakout
  [:ref ::ref/ref])

(mr/def ::breakouts
  [:and
   [:sequential {:min 1} ::breakout]
   [:fn
    {:error/message "Breakouts must be distinct"}
    #'lib.schema.util/distinct-refs?]])

(mr/def ::fields
  [:and
   [:sequential {:min 1} [:ref ::ref/ref]]
   [:fn
    {:error/message ":fields must be distinct"}
    #'lib.schema.util/distinct-refs?]])

(mr/def ::filterable
  [:ref ::expression/boolean])

(mr/def ::filters
  [:sequential {:min 1} ::filterable])

(defn- bad-ref-clause? [ref-type valid-ids x]
  (and (vector? x)
       (= ref-type (first x))
       (not (contains? valid-ids (get x 2)))))

(defn- stage-with-joins-and-namespaced-keys-removed
  "For ref validation purposes we should ignore `:joins` and any namespaced keys that might be used to record additional
  info e.g. `:lib/metadata`."
  [stage]
  (reduce-kv (fn [acc k _]
               (if (or (qualified-keyword? k)
                       (= k :joins))
                 (dissoc acc k)
                 acc))
             stage stage))

(defn- expression-ref-errors-for-stage [stage]
  (let [expression-names (into #{} (map (comp :lib/expression-name second)) (:expressions stage))]
    (mbql.u/matching-locations (stage-with-joins-and-namespaced-keys-removed stage)
                               #(bad-ref-clause? :expression expression-names %))))

(defn- aggregation-ref-errors-for-stage [stage]
  (let [uuids (into #{} (map (comp :lib/uuid second)) (:aggregation stage))]
    (mbql.u/matching-locations (stage-with-joins-and-namespaced-keys-removed stage)
                               #(bad-ref-clause? :aggregation uuids %))))

(defn ref-errors-for-stage
  "Return the locations and the clauses with dangling expression or aggregation references.
  The return value is sequence of pairs (vectors) with the first element specifying the location
  as a vector usable in [[get-in]] and the second element being the clause with dangling reference."
  [stage]
  (concat (expression-ref-errors-for-stage stage)
          (aggregation-ref-errors-for-stage stage)))

(defn- expression-ref-error-for-stage [stage]
  (when-let [err-loc (first (expression-ref-errors-for-stage stage))]
    (if-let [expression-name (get-in err-loc [1 2])]
      (str "Invalid :expression reference: no expression named " (pr-str expression-name))
      (str "Invalid :expression reference: " (get err-loc 1)))))

(defn- aggregation-ref-error-for-stage [stage]
  (when-let [err-loc (first (aggregation-ref-errors-for-stage stage))]
    (if-let [ag-uuid (get-in err-loc [1 2])]
      (str "Invalid :aggregation reference: no aggregation with uuid " ag-uuid)
      (str "Invalid :aggregation reference: " (get err-loc 1)))))

(def ^:private ^{:arglists '([stage])} ref-error-for-stage
  "Validate references in the context of a single `stage`, independent of any previous stages. If there is an error with
  a reference, return a string describing the error."
  (some-fn expression-ref-error-for-stage
           aggregation-ref-error-for-stage))

(mr/def ::stage.valid-refs
  [:fn
   {:error/message "Valid references for a single query stage"
    :error/fn      (fn [{:keys [value]} _]
                     (ref-error-for-stage value))}
   (complement ref-error-for-stage)])

;;; TODO -- should `::page` have a `:lib/type`, like all the other maps in pMBQL?
(mr/def ::page
  [:map
   {:decode/normalize common/normalize-map}
   [:page  pos-int?]
   [:items pos-int?]])

(mr/def ::stage.mbql
  [:and
   [:map
    {:decode/normalize common/normalize-map}
    [:lib/type     [:= {:decode/normalize common/normalize-keyword} :mbql.stage/mbql]]
    [:joins        {:optional true} [:ref ::join/joins]]
    [:expressions  {:optional true} [:ref ::expression/expressions]]
    [:breakout     {:optional true} [:ref ::breakouts]]
    [:aggregation  {:optional true} [:ref ::aggregation/aggregations]]
    [:fields       {:optional true} [:ref ::fields]]
    [:filters      {:optional true} [:ref ::filters]]
    [:order-by     {:optional true} [:ref ::order-by/order-bys]]
    [:source-table {:optional true} [:ref ::id/table]]
    [:source-card  {:optional true} [:ref ::id/card]]
    [:page         {:optional true} [:ref ::page]]]
   [:fn
    {:error/message ":source-query is not allowed in pMBQL queries."}
    #(not (contains? % :source-query))]
   [:fn
    {:error/message ":native is not allowed in an MBQL stage."}
    #(not (contains? % :native))]
   [:fn
    {:error/message "A query must have exactly one of :source-table or :source-card"}
    (complement (comp #(= (count %) 1) #{:source-table :source-card}))]
   [:ref ::stage.valid-refs]])

;;; the schemas are constructed this way instead of using `:or` because they give better error messages
(mr/def ::stage.type
  [:enum
   {:decode/normalize common/normalize-keyword}
   :mbql.stage/native
   :mbql.stage/mbql])

(defn- lib-type [x]
  (when (map? x)
    (keyword (some #(get x %) [:lib/type "lib/type"]))))

(mr/def ::stage
  [:and
   {:decode/normalize common/normalize-map
    :encode/serialize #(dissoc %
                               ;; this stuff is all added at runtime by QP middleware.
                               :params
                               :parameters
                               :lib/stage-metadata
                               :middleware)}
   [:map
    [:lib/type [:ref ::stage.type]]]
   [:multi {:dispatch      lib-type
            :error/message "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"}
    [:mbql.stage/native [:ref ::stage.native]]
    [:mbql.stage/mbql   [:ref ::stage.mbql]]]])

(mr/def ::stage.initial
  [:multi {:dispatch      lib-type
           :error/message "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"}
   [:mbql.stage/native :map]
   [:mbql.stage/mbql   [:fn
                        {:error/message "An initial MBQL stage of a query must have :source-table or :source-card"}
                        (some-fn :source-table :source-card)]]])

(mr/def ::stage.additional
  [:multi {:dispatch      lib-type
           :error/message "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"}
   [:mbql.stage/native [:fn
                        {:error/message "Native stages are only allowed as the first stage of a query or join."}
                        (constantly false)]]
   [:mbql.stage/mbql   [:fn
                        {:error/message "Only the initial stage of a query can have a :source-table or :source-card"}
                        (complement (some-fn :source-table :source-card))]]])

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
  (when (sequential? stages)
    (loop [visible-join-alias? (constantly false), i 0, [stage & more] stages]
      (let [visible-join-alias? (some-fn visible-join-alias? (visible-join-alias?-fn stage))]
        (or
         (when (map? stage)
           (lib.util.match/match-one (dissoc stage :joins :stage/metadata) ; TODO isn't this supposed to be `:lib/stage-metadata`?
             [:field ({:join-alias (join-alias :guard (complement visible-join-alias?))} :guard :join-alias) _id-or-name]
             (str "Invalid :field reference in stage " i ": no join named " (pr-str join-alias))))
         (when (seq more)
           (recur visible-join-alias? (inc i) more)))))))

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
    :error/fn      (fn [{stages :value} _]
                     (ref-error-for-stages stages))}
   (complement ref-error-for-stages)])

(mr/def ::stages
  [:and
   [:sequential {:min 1} [:ref ::stage]]
   [:cat
    [:schema [:ref ::stage.initial]]
    [:* [:schema [:ref ::stage.additional]]]]
   [:ref ::stages.valid-refs]])

;;; TODO -- move/copy this schema from the legacy schema to here
(mr/def ::settings
  [:ref
   {:decode/normalize common/normalize-map}
   :metabase.legacy-mbql.schema/Settings])

;;; TODO -- move/copy this schema from the legacy schema to here
(mr/def ::middleware-options
  [:ref
   {:decode/normalize common/normalize-map}
   :metabase.legacy-mbql.schema/MiddlewareOptions])

;;; TODO -- move/copy this schema from the legacy schema to here
(mr/def ::constraints
  [:ref
   {:decode/normalize common/normalize-map}
   :metabase.legacy-mbql.schema/Constraints])

(defn- serialize-query [query]
  ;; this stuff all gets added in when you actually run a query with one of the QP entrypoints, and is not considered
  ;; to be part of the query itself. It doesn't get saved along with the query in the app DB.
  (let [keys-to-remove #{:lib/metadata :info :parameters :viz-settings}]
    (m/filter-keys (fn [k]
                     (and (not (contains? keys-to-remove k))
                          (or (simple-keyword? k)
                              ;; remove all random namespaced keys like `:metabase.models.query.permissions/perms`.
                              ;; Keep `:lib` keys like `:lib/type`
                              (= (namespace k) "lib"))))
                   query)))

(mr/def ::query
  [:and
   [:map
    {:decode/normalize common/normalize-map
     :encode/serialize serialize-query}
    [:lib/type [:=
                {:decode/normalize common/normalize-keyword}
                :mbql/query]]
    [:database [:multi {:dispatch (partial = id/saved-questions-virtual-database-id)}
                [true  ::id/saved-questions-virtual-database]
                [false ::id/database]]]
    [:stages   [:ref ::stages]]
    [:parameters {:optional true} [:maybe [:ref ::parameter/parameters]]]
    ;;
    ;; OPTIONS
    ;;
    ;; These keys are used to tweak behavior of the Query Processor.
    ;;
    [:settings    {:optional true} [:maybe [:ref ::settings]]]
    [:constraints {:optional true} [:maybe [:ref ::constraints]]]
    [:middleware  {:optional true} [:maybe [:ref ::middleware-options]]]
    ;; TODO -- `:viz-settings` ?
    ;;
    ;; INFO
    ;;
    ;; Used when recording info about this run in the QueryExecution log; things like context query was ran in and
    ;; User who ran it
    [:info {:optional true} [:maybe [:ref ::info/info]]]
    ;;
    ;; ACTIONS
    ;;
    ;; This stuff is only used for Actions.
    [:create-row {:optional true} [:maybe [:ref ::actions/row]]]
    [:update-row {:optional true} [:maybe [:ref ::actions/row]]]]
   ;;
   ;; CONSTRAINTS
   [:ref ::lib.schema.util/unique-uuids]
   [:fn
    {:error/message ":expressions is not allowed in the top level of a query -- it is only allowed in MBQL stages"}
    #(not (contains? % :expressions))]])
