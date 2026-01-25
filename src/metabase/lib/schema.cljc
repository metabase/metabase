(ns metabase.lib.schema
  "Malli schema for the MBQL 5 query type, the version of MBQL produced and manipulated by the new Cljc
  Metabase lib. Currently this is a little different from the version of MBQL consumed by the QP, specified
  in [[metabase.legacy-mbql.schema]]. Hopefully these versions will converge in the future.

  Some primitives below are duplicated from [[metabase.util.malli.schema]] since that's not `.cljc`. Other stuff is
  copied from [[metabase.legacy-mbql.schema]] so this can exist completely independently; hopefully at some point in the
  future we can deprecate that namespace and eventually do away with it entirely."
  (:refer-clojure :exclude [ref every? some select-keys empty? get-in])
  (:require
   [medley.core :as m]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.actions :as actions]
   [metabase.lib.schema.aggregation :as aggregation]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.constraints :as lib.schema.constraints]
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
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.middleware-options :as lib.schema.middleware-options]
   [metabase.lib.schema.order-by :as order-by]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as ref]
   [metabase.lib.schema.settings :as lib.schema.settings]
   [metabase.lib.schema.template-tag :as template-tag]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [every? select-keys some empty? get-in]]))

(comment metabase.lib.schema.expression.arithmetic/keep-me
         metabase.lib.schema.expression.conditional/keep-me
         metabase.lib.schema.expression.string/keep-me
         metabase.lib.schema.expression.temporal/keep-me
         metabase.lib.schema.expression.window/keep-me
         metabase.lib.schema.filter/keep-me)

(defn- normalize-stage-common [m]
  (when-let [m (common/normalize-map m)]
    (reduce
     (fn [m k]
       (cond-> m
         (and (contains? m k)
              (empty? (m k)))
         (dissoc m k)))
     m
     [:parameters
      :lib/stage-metadata])))

(mr/def ::stage.common
  [:map
   {:decode/normalize normalize-stage-common}
   [:parameters         {:optional true} [:ref ::lib.schema.parameter/parameters]]
   [:lib/stage-metadata {:optional true} [:ref ::lib.schema.metadata/stage]]])

(mr/def ::stage.native
  [:and
   [:merge
    ::stage.common
    [:map
     {:decode/normalize   #(->> %
                                normalize-stage-common
                                ;; filter out null :collection keys -- see #59675
                                ;;
                                ;; also filter out empty `:template-tags` maps.
                                (m/filter-kv (fn [k v]
                                               (case k
                                                 :collection    (some? v)
                                                 :template-tags (seq v)
                                                 true))))
      :encode/for-hashing #'common/encode-map-for-hashing}
     [:lib/type [:= {:decode/normalize common/normalize-keyword} :mbql.stage/native]]
     ;; the actual native query, depends on the underlying database. Could be a raw SQL string or something like that.
     ;; Only restriction is that, if present, it is non-nil.
     ;; It is valid to have a blank query like `{:type :native}` in legacy.
     [:native {:optional true} some?]
     ;; any parameters that should be passed in along with the query to the underlying query engine, e.g. for JDBC these
     ;; are the parameters we pass in for a `PreparedStatement` for `?` placeholders. These can be anything, including
     ;; nil.
     ;;
     ;; This schema is `[:or ::literal/literal :any]` so Malli encoding [[metabase.lib.serialize]] will use it if
     ;; applicable... e.g. a Java time type will get serialized to a
     ;; string (see [[metabase.lib.serialize-test/encode-java-time-types-in-native-query-args-test]])
     [:params {:optional true} [:maybe [:sequential [:or [:ref ::literal/literal] :any]]]]
     ;; the Table/Collection/etc. that this query should be executed against; currently only used for MongoDB, where it
     ;; is required.
     [:collection {:optional true} ::common/non-blank-string]
     ;; optional template tag declarations. Template tags are things like `{{x}}` in the query (the value of the
     ;; `:native` key), but their definition lives under this key.
     [:template-tags {:optional true} [:ref ::template-tag/template-tag-map]]
     ;; optional, set of Card IDs referenced by this query in `:card` template tags like `{{card}}`. This is added
     ;; automatically during parameter expansion. To run a native query you must have native query permissions as well
     ;; as permissions for any Cards' parent Collections used in `:card` template tag parameters.
     [:query-permissions/referenced-card-ids {:optional true} [:maybe [:set ::id/card]]]]]
   (common/disallowed-keys
    {:query        ":query is not allowed in a native query stage, you probably meant to use :native instead."
     :source-table "MBQL stage keys like :source-table are not allowed in a native query stage."
     :source-card  "MBQL stage keys like :source-card are not allowed in a native query stage."
     :fields       "MBQL stage keys like :fields are not allowed in a native query stage."
     :filter       "MBQL stage keys like :filter are not allowed in a native query stage."
     :filters      "MBQL stage keys like :filters are not allowed in a native query stage."
     :breakout     "MBQL stage keys like :breakout are not allowed in a native query stage."
     :aggregation  "MBQL stage keys like :aggregation are not allowed in a native query stage."
     :limit        "MBQL stage keys like :limit are not allowed in a native query stage."
     :order-by     "MBQL stage keys like :order-by are not allowed in a native query stage."
     :offset       "MBQL stage keys like :offset are not allowed in a native query stage."
     :page         "MBQL stage keys like :page are not allowed in a native query stage."
     :args         "Native query parameters should use :params, not :args."})])

(mr/def ::breakout
  [:ref ::ref/ref])

(mr/def ::breakouts
  [:and
   [:sequential {:min 1} ::breakout]
   [:ref ::lib.schema.util/distinct-mbql-clauses]])

(defn- deduplicate-refs-ignoring-source-field-name-when-possible
  "`:source-field-name` is only relevant when we have multiple field refs with the same `:source-field` AND different
  `:source-field-name`s (see documentation in `:metabase.lib.schema.ref/field.options`). Deduplicate refs ignoring
  this value when it is not relevant."
  [fields]
  (let [source-field->refs        (group-by (fn [[_tag opts _field-id :as _ref]]
                                              (:source-field opts))
                                            fields)
        source-field->names       (update-vals source-field->refs
                                               (fn [field-refs]
                                                 (into #{}
                                                       (keep #(:source-field-name (lib.options/options %)))
                                                       field-refs)))
        ignore-source-field-name? (fn [[_tag {:keys [source-field source-field-name], :as _opts} _id-or-name :as _ref]]
                                    (when source-field-name
                                      (let [source-field-names-for-source-field (source-field->names source-field)]
                                        (< (count source-field-names-for-source-field) 2))))]
    (into
     []
     (m/distinct-by (fn [field-ref]
                      (lib.schema.util/mbql-clause-distinct-key
                       (cond-> field-ref
                         (ignore-source-field-name? field-ref)
                         (lib.options/update-options dissoc :source-field-name)))))
     fields)))

(mr/def ::deduplicate-refs-ignoring-source-field-name-when-possible
  [:schema
   {:decode/normalize deduplicate-refs-ignoring-source-field-name-when-possible}
   :any])

;; TODO (Cam 2026-01-13) -- we should ensure sequences like these are [[vector?]] and normalize them to vectors if
;; they're not
(mr/def ::fields
  [:and
   [:sequential {:min 1} [:ref ::ref/ref]]
   [:ref ::lib.schema.util/distinct-mbql-clauses]
   [:ref ::deduplicate-refs-ignoring-source-field-name-when-possible]])

(mr/def ::filters
  [:sequential {:min 1} [:ref ::expression/boolean]])

(defn- bad-ref-clause? [ref-type valid-ids x]
  (and (vector? x)
       (= ref-type (nth x 0 nil))
       (not (contains? valid-ids (nth x 2 nil)))))

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

(def ^:dynamic *HACK-disable-ref-validation*
  "Whether to validate join aliases in field refs and expression refs. This is only disable-able as a hack to support
  X-Rays code which generates fragments of stages that drop joins and expressions and then adds them again after the
  fact in [[metabase.xrays.automagic-dashboards.core/preserve-entity-element]]. Once we port X-Rays to use Lib we can
  fix the hackiness and hopefully take this out."
  false)

(defn- expression-ref-errors-for-stage [stage]
  (when-not *HACK-disable-ref-validation*
    (let [stage            (dissoc stage :parameters) ; don't validate [:dimension [:expression ...]] refs since they might not be moved to the correct place yet.
          expression-names (when-let [expressions (:expressions stage)]
                             (when (and (sequential? expressions)
                                        (every? sequential? expressions))
                               (into #{} (map (comp :lib/expression-name second)) expressions)))
          pred             #(bad-ref-clause? :expression expression-names %)
          form             (-> (stage-with-joins-and-namespaced-keys-removed stage)
                   ;; also ignore expression refs inside `:parameters` since they still use legacy syntax these days.
                               (dissoc :parameters))]
      (when (lib.schema.util/pred-matches-form? form pred)
        (lib.schema.util/matching-locations form pred)))))

(defn- aggregation-ref-errors-for-stage [stage]
  (let [uuids (into #{} (map (comp :lib/uuid second)) (:aggregation stage))
        pred #(bad-ref-clause? :aggregation uuids %)
        form (stage-with-joins-and-namespaced-keys-removed stage)]
    (when (lib.schema.util/pred-matches-form? form pred)
      (lib.schema.util/matching-locations form pred))))

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

;;; TODO -- should `::page` have a `:lib/type`, like all the other maps in MBQL 5?
(mr/def ::page
  "`page` = page num, starting with 1. `items` = number of items per page.
  e.g.

    {:page 1, :items 10} = items 1-10
    {:page 2, :items 10} = items 11-20"
  [:map
   {:decode/normalize common/normalize-map}
   [:page  pos-int?]
   [:items pos-int?]])

(defn- normalize-mbql-stage [m]
  (normalize-stage-common m))

(defn- encode-mbql-stage-for-hashing [stage]
  (-> stage
      common/encode-map-for-hashing
      lib.schema.util/indexed-aggregation-refs-for-stage
      ;; preserve these keys because we want to hash two identical queries from different source cards
      ;; differently (see [[metabase.query-processor.middleware.cache-test/multiple-models-e2e-test]]) and this is a
      ;; reliable way to differentiate them since it gets populated by the QP.
      (merge (select-keys stage [:qp/stage-is-from-source-card :qp/stage-had-source-card]))))

(mr/def ::stage.mbql
  [:and
   [:merge
    ::stage.common
    [:map
     {:decode/normalize   #'normalize-mbql-stage
      :encode/for-hashing #'encode-mbql-stage-for-hashing}
     [:lib/type           [:= {:decode/normalize common/normalize-keyword} :mbql.stage/mbql]]
     [:joins              {:optional true} [:ref ::join/joins]]
     [:expressions        {:optional true} [:ref ::expression/expressions]]
     [:breakout           {:optional true} [:ref ::breakouts]]
     [:aggregation        {:optional true} [:ref ::aggregation/aggregations]]
     [:fields             {:optional true} [:ref ::fields]]
     [:filters            {:optional true} [:ref ::filters]]
     [:order-by           {:optional true} [:ref ::order-by/order-bys]]
     [:source-table       {:optional true} [:ref ::id/table]]
     [:source-card        {:optional true} [:ref ::id/card]]
     [:page               {:optional true} [:ref ::page]]
     [:limit              {:optional true} ::common/int-greater-than-or-equal-to-zero]]]
   [:fn
    {:error/message "A query must have exactly one of :source-table or :source-card"}
    (complement (comp #(= (count %) 1) #{:source-table :source-card}))]
   [:ref ::stage.valid-refs]
   (common/disallowed-keys
    {:native             ":native is not allowed in an MBQL stage."
     :aggregation-idents ":aggregation-idents is deprecated and should not be used"
     :breakout-idents    ":breakout-idents is deprecated and should not be used"
     :expression-idents  ":expression-idents is deprecated and should not be used"
     :filter             ":filter is not allowed in an MBQL 5 stage, use :filters instead"})])

;;; the schemas are constructed this way instead of using `:or` because they give better error messages
(mr/def ::stage.type
  [:enum
   {:decode/normalize common/normalize-keyword}
   :mbql.stage/native
   :mbql.stage/mbql])

(defn- lib-type [x]
  (when (map? x)
    (keyword (some #(get x %) [:lib/type "lib/type"]))))

(defn- normalize-stage [stage]
  (when (map? stage)
    (let [stage (common/normalize-map stage)]
      ;; infer stage type
      (cond
        ((some-fn :lib/type #(get % "lib/type")) stage)
        stage

        ((some-fn :source-table :source-card) stage)
        (assoc stage :lib/type :mbql.stage/mbql)

        (:native stage)
        (assoc stage :lib/type :mbql.stage/native)

        :else
        stage))))

;;; TODO -- enforce all kebab-case keys
(mr/def ::stage
  [:and
   {:default          {:lib/type :mbql.stage/mbql}
    :decode/normalize normalize-stage
    :encode/serialize #(dissoc %
                               ;; this stuff is all added at runtime by QP middleware.
                               :parameters
                               :lib/stage-metadata
                               ;; TODO (Cam 8/7/25) -- wait a minute, `:middleware` is not supposed to be added here,
                               ;; it's supposed to be added to the top level. Investigate whether this was just a
                               ;; mistake or what.
                               :middleware)}
   [:map
    [:lib/type [:ref ::stage.type]]]
   [:multi {:dispatch      lib-type
            :error/message "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"}
    [:mbql.stage/native [:ref ::stage.native]]
    [:mbql.stage/mbql   [:ref ::stage.mbql]]]
   (common/disallowed-keys
    {:source-metadata "A query stage should not have :source-metadata, the prior stage should have :lib/stage-metadata instead"
     :source-query    ":source-query is not allowed in MBQL 5 queries."
     :type            ":type is not allowed in a query stage in any version of MBQL"})])

(mr/def ::stage.initial
  [:multi {:dispatch      lib-type
           :error/message "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"}
   [:mbql.stage/native :map]
   [:mbql.stage/mbql   [:fn
                        {:error/message "Initial MBQL stage must have either :source-table or :source-card (but not both)"}
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
  stage...right?) but for now we'll have to allow it until we can figure out how to go fix all of the old broken
  queries.

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

(defn- join-ref-error-for-stages
  "Return an error messages if we find a field ref that uses a `:join-alias` for a join that doesn't exist."
  [stages]
  (when (and (not *HACK-disable-ref-validation*)
             (sequential? stages))
    (loop [visible-join-alias? (constantly false), i 0, [stage & more] stages]
      (let [visible-join-alias? (some-fn visible-join-alias? (visible-join-alias?-fn stage))]
        (or
         (when (map? stage)
           (lib.util.match/match-lite (dissoc stage :joins :lib/stage-metadata)
             [:field {:join-alias (join-alias :guard (and (some? join-alias)
                                                          (not (visible-join-alias? join-alias))))} _id-or-name]
             (str "Invalid :field reference in stage " i ": no join named " (pr-str join-alias))))
         (when (seq more)
           (recur visible-join-alias? (inc i) more)))))))

(mr/def ::stages.valid-refs
  [:fn
   {:error/message "Valid references for all query stages"
    :error/fn      (fn [{stages :value} _]
                     (join-ref-error-for-stages stages))}
   (complement #'join-ref-error-for-stages)])

(defn- normalize-stages [stages]
  (when (sequential? stages)
    (if (every? (some-fn :lib/type #(get % "lib/type")) stages)
      stages
      (into [(first stages)]
            (comp
             ;; make sure stage has keywordized keys so we can check `:lib/type`
             (map normalize-stage)
             ;; subsequent stages have to be MBQL, so add `:lib/type` if it is missing.
             (map (fn [subsequent-stage]
                    (cond-> subsequent-stage
                      (not (:lib/type subsequent-stage)) (assoc :lib/type :mbql.stage/mbql)))))
            (rest stages)))))

(mr/def ::stages
  [:and
   [:sequential {:min              1
                 :decode/normalize normalize-stages
                 :default          []}
    [:ref ::stage]]
   [:cat
    [:schema [:ref ::stage.initial]]
    [:* [:schema [:ref ::stage.additional]]]]
   [:ref ::stages.valid-refs]])

(defn- normalize-query [query]
  (when-let [query (common/normalize-map query)]
    (reduce-kv (fn [query k v]
                 (case k
                   :lib/metadata (cond-> query
                                   (nil? v) (dissoc k))
                   (:constraints
                    :create-row
                    :info
                    :middleware
                    :parameters
                    :settings
                    :update-row)
                   (cond-> query
                     (empty? v) (dissoc k))
                   #_else query))
               query
               query)))

(defn- serialize-query [query]
  ;; this stuff all gets added in when you actually run a query with one of the QP entrypoints, and is not considered
  ;; to be part of the query itself. It doesn't get saved along with the query in the app DB.
  (let [keys-to-remove #{:lib/metadata :info :parameters :viz-settings}]
    (m/filter-keys (fn [k]
                     (and (not (contains? keys-to-remove k))
                          (or (simple-keyword? k)
                              ;; remove all random namespaced keys like
                              ;; `:metabase.query-permissions.impl/perms`. Keep `:lib` keys like `:lib/type`
                              (= (namespace k) "lib"))))
                   query)))

(defn- encode-query-for-hashing [query]
  (let [keys-for-hashing #{:constraints
                           :database
                           :destination-database/id
                           :impersonation/role
                           :lib/type
                           :parameters
                           :stages}]
    (reduce-kv (fn [m k v]
                 (cond-> m
                   (contains? keys-for-hashing k) (assoc k v)))
               (common/unfussy-sorted-map)
               query)))

(mr/def ::query
  [:and
   [:map
    {:description        "Valid MBQL 5 query."
     :decode/normalize   #'normalize-query
     :encode/serialize   #'serialize-query
     :encode/for-hashing #'encode-query-for-hashing}
    [:lib/type [:=
                {:decode/normalize common/normalize-keyword, :default :mbql/query}
                :mbql/query]]
    ;; TODO (Cam 6/12/25) -- why in the HECC is `:lib/metadata` not a required key here? It's virtually REQUIRED for
    ;; anything to work correctly outside of the low-level conversion code. We should make it required and then fix
    ;; whatever breaks.
    [:lib/metadata {:optional true} ::lib.schema.metadata/metadata-provider]
    [:database {:optional true} [:multi {:dispatch (partial = id/saved-questions-virtual-database-id)}
                                 [true  ::id/saved-questions-virtual-database]
                                 [false ::id/database]]]
    [:stages   [:ref ::stages]]
    [:parameters {:optional true} [:ref ::lib.schema.parameter/parameters]]
    ;;
    ;; OPTIONS
    ;;
    ;; These keys are used to tweak behavior of the Query Processor.
    ;;
    [:settings    {:optional true} [:ref ::lib.schema.settings/settings]]
    [:constraints {:optional true} [:ref ::lib.schema.constraints/constraints]]
    [:middleware  {:optional true} [:ref ::lib.schema.middleware-options/middleware-options]]
    ;; TODO -- `:viz-settings` ?
    ;;
    ;; INFO
    ;;
    ;; Used when recording info about this run in the QueryExecution log; things like context query was ran in and
    ;; User who ran it
    [:info {:optional true} [:ref ::info/info]]
    ;;
    ;; ACTIONS
    ;;
    ;; This stuff is only used for Actions.
    [:create-row {:optional true} [:ref ::actions/row]]
    [:update-row {:optional true} [:ref ::actions/row]]]
   ;;
   ;; CONSTRAINTS
   [:ref ::lib.schema.util/unique-uuids]
   (common/disallowed-keys
    {:expressions  ":expressions is not allowed in the top level of a query, only in MBQL stages"
     :filter       ":filter is not allowed in MBQL 5, and it's not allowed in the top-level of a stage in any MBQL version"
     :filters      ":filters is not allowed in the top level of a query, only in MBQL stages"
     :joins        ":joins is not allowed in the top level of a query, only in MBQL stages"
     :native       ":native is not allowed in MBQL 5, use :stages instead."
     :query        ":query is not allowed in MBQL 5, use :stages instead."
     :source-query ":source-query is not allowed in MBQL 5, and it's not allowed in the top-level of a stage in any MBQL version"
     :source-table ":source-table is not allowed in the top level of a query, only in MBQL stages"
     :type         ":type is not allowed in MBQL 5, use :lib/type instead."})])

(defn native-only-query?
  "Whether MBQL 5 `query` only has a single native stage (and is thus pure-native). This is the equivalent of the old
  `:type :native` queries in MBQL <= 4."
  [query]
  (and (map? query)
       (= (count (:stages query)) 1)
       (= (get-in query [:stages 0 :lib/type]) :mbql.stage/native)))

(mr/def ::native-only-query
  "Schema for a pure-native query with one single native stage."
  [:and
   [:ref ::query]
   [:fn {:error/message "native-only query"} native-only-query?]])
