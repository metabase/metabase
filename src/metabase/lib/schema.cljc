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
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]
   [metabase.util.performance :refer [every? select-keys some empty? get-in]]))

(comment metabase.lib.schema.expression.arithmetic/keep-me
         metabase.lib.schema.expression.conditional/keep-me
         metabase.lib.schema.expression.string/keep-me
         metabase.lib.schema.expression.temporal/keep-me
         metabase.lib.schema.expression.window/keep-me
         metabase.lib.schema.filter/keep-me)

(mr/def ::column-unique-key
  [:re
   #"^column-unique-key-v\d+\$.+$"])

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

(mr/def ::external-remapping
  "One external (Dimension) column remapping, as recorded on a query or stage
  by [[metabase.query-processor.middleware.add-remaps]]. Mirrors `:metabase.query-processor.middleware.add-remaps/external-remapping`;
  it is duplicated here because Lib may not depend on the query processor."
  [:map
   {:closed true}
   [:id                        [:ref ::id/dimension]]
   [:name                      ::common/non-blank-string]
   [:field-id                  [:ref ::id/field]]
   [:field-name                ::common/non-blank-string]
   [:human-readable-field-id   [:ref ::id/field]]
   [:human-readable-field-name ::common/non-blank-string]])

(mr/def ::external-remappings
  [:sequential [:ref ::external-remapping]])

(mr/def ::stage.common
  [:map
   {:closed           true
    :decode/normalize normalize-stage-common
    :decode/api       common/remove-internal-keys
    :encode/serialize common/remove-internal-keys}
   [:parameters         {:optional true} [:ref ::lib.schema.parameter/parameters]]
   [:lib/stage-metadata {:optional true} [:ref ::lib.schema.metadata/stage]]
   [:qp/stage-is-from-source-card {:optional true} [:ref ::id/card]]
   [:qp/stage-had-source-card     {:optional true} [:ref ::id/card]]
   [:qp/added-implicit-fields? {:optional true} :boolean]
   [:qp/skip-persisted-cache {:optional true} :boolean]
   [:persisted-info/native {:optional true} ::common/non-blank-string]
   [:source-query/model?        {:optional true} :boolean]
   [:source-query/native-model? {:optional true} [:maybe :boolean]]
   [:query-permissions/sandboxed-table {:optional true} [:ref ::id/table]]
   [:metabase-enterprise.sandbox.query-processor.middleware.sandboxing/sandbox? {:optional true} :boolean]
   [:metabase.query-processor.middleware.add-remaps/remaps {:optional true} [:ref ::external-remappings]]
   [:metabase.query-processor.middleware.cumulative-aggregations/replaced-indexes {:optional true} [:set [:int {:min 0}]]]
   [:metabase.query-processor.middleware.add-implicit-joins/reused-join-aliases {:optional true} [:set [:ref ::join/alias]]]
   [:metabase.query-processor.util.add-alias-info/desired-alias->escaped
    {:optional true}
    [:map-of [:ref ::lib.schema.metadata/desired-column-alias] [:ref ::lib.schema.metadata/desired-column-alias]]]
   [:metabase.query-processor.util.add-alias-info/join-alias->escaped
    {:optional true}
    [:map-of [:ref ::join/alias] :string]]])

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
     [:native {:optional true} [:or
                                :string
                                [:schema {::mr/deliberately-open true
                                          :description "a driver's native query when it is not a string, e.g. a MongoDB pipeline or a query with its parameters; its shape is the driver's"}
                                 :some]]]
     ;; any parameters that should be passed in along with the query to the underlying query engine, e.g. for JDBC these
     ;; are the parameters we pass in for a `PreparedStatement` for `?` placeholders. These can be anything, including
     ;; nil.
     ;;
     ;; This schema is `[:or ::literal/literal :any]` so Malli encoding [[metabase.lib.serialize]] will use it if
     ;; applicable... e.g. a Java time type will get serialized to a
     ;; string (see [[metabase.lib.serialize-test/encode-java-time-types-in-native-query-args-test]])
     [:params {:optional true} [:maybe [:sequential [:ref ::literal/param-value]]]]
     ;; the Table/Collection/etc. that this query should be executed against; currently only used for MongoDB, where it
     ;; is required.
     [:collection {:optional true} ::common/non-blank-string]
     [:projections {:optional true} [:maybe [:sequential :string]]]
     [:mbql? {:optional true} [:maybe :boolean]]
     ;; the table the query was compiled from; BigQuery's compiled native form carries it
     [:qp/table-name {:optional true} [:maybe :string]]
     ;; optional template tag declarations. Template tags are things like `{{x}}` in the query (the value of the
     ;; `:native` key), but their definition lives under this key.
     ;;
     ;; Prior to 63, this was a map, but was changed to a list to preserve order with more than 8 template tags.
     [:template-tags {:optional true} [:ref ::template-tag/template-tags]]
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
   {:decode/normalize common/normalize-map
    :decode/api       common/remove-internal-keys
    :encode/serialize common/remove-internal-keys :closed true}
   [:page  pos-int?]
   [:items pos-int?]])

(mr/def ::pivot
  "Pivot intent. `:rows` and `:columns` are sequences of UUIDs that reference `:lib/uuid` values on breakouts of the
  stage that carries this clause. `:show-row-totals` and `:show-column-totals` default to `true` when absent."
  [:map
   {:decode/normalize common/normalize-map :closed true}
   [:rows               [:sequential ::common/uuid]]
   [:columns            [:sequential ::common/uuid]]
   [:show-row-totals    {:optional true} :boolean]
   [:show-column-totals {:optional true} :boolean]])

(mr/def ::pivot-only-on-last-stage
  [:fn
   {:error/message ":pivot is only allowed on the last stage of a query"}
   (fn [{:keys [stages]}]
     (not-any? :pivot (butlast stages)))])

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

(mr/def ::stage.page-and-limit-are-mutually-exclusive
  "If an MBQL query stage specifies `:page`, it should not also specify `:limit`"
  [:fn
   {:error/message    "A query stage should not specify both :page and :limit since they conflict"
    ;; if both are specified, ignore `:limit` and prefer `:page`
    :decode/normalize (fn [stage]
                        (cond-> stage
                          ((every-pred :page :limit) stage) (dissoc :limit)))}
   (complement (every-pred :page :limit))])

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
     [:limit              {:optional true} nat-int?]
     [:pivot              {:optional true} [:ref ::pivot]]]]
   [:fn
    {:error/message "A query must have exactly one of :source-table or :source-card"}
    (complement (comp #(= (count %) 1) #{:source-table :source-card}))]
   [:ref ::stage.valid-refs]
   [:ref ::stage.page-and-limit-are-mutually-exclusive]
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
   [:multi {:dispatch      lib-type
            :error/message "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"}
    [:mbql.stage/native [:ref ::stage.native]]
    [:mbql.stage/mbql   [:ref ::stage.mbql]]]
   (common/disallowed-keys
    {:source-metadata "A query stage should not have :source-metadata, the prior stage should have :lib/stage-metadata instead"
     :source-query    ":source-query is not allowed in MBQL 5 queries."
     :type            ":type is not allowed in a query stage in any version of MBQL"
     :database        ":database is not allowed in a query stage, only at the top level of a query."
     :lib/options     "A stage should not have :lib/options"})])

(mr/def ::stage.initial
  [:multi {:dispatch      lib-type
           :error/message "Invalid stage :lib/type: expected :mbql.stage/native or :mbql.stage/mbql"}
   [:mbql.stage/native [:fn {:error/message "Initial native stage"} map?]]
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
           (match/match-one (dissoc stage :joins :lib/stage-metadata)
             [:field {:join-alias (join-alias :guard (and join-alias
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
  ;;
  ;; [[common/internal-key?]] also drops all internal namespaced keys the query processor adds, keeping `:lib` keys like
  ;; `:lib/type`.
  (let [keys-to-remove #{:lib/metadata :info :parameters :viz-settings}]
    (m/filter-keys (fn [k]
                     (and (not (contains? keys-to-remove k))
                          (not (common/internal-key? k))))
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

(mr/def ::sandboxing.original-metadata
  "The columns a query was expected to return *before* sandboxes replaced its source tables, stashed on the query by
  the enterprise sandboxing middleware (see `expected-cols` in
  `metabase-enterprise.sandbox.query-processor.middleware.sandboxing`) and compared against the sandboxed results
  afterwards.

  In production these are legacy, `snake_cased` column metadata maps (i.e.
  `:metabase.legacy-mbql.schema/legacy-column-metadata`), but this key is a verbatim snapshot that must survive
  normalization untouched -- pointing at that schema here would rewrite its keys and drop deprecated ones, which
  breaks round-tripping (see `metabase.lib.convert-test/round-trip-preserve-metadata-test`). So the elements are
  declared as plain maps, which carry no decoders."
  [:sequential :map])

(mr/def ::query.snapshot
  "A whole copy of a query stashed on the query itself under one of the internal keys below.

  Deliberately NOT `[:ref ::query]`: [[malli.util/merge]] recurses into the entries that the two schemas being merged
  share, so a self-referential `::query` entry makes `[:merge ::query [:map [<same key> ::query]]]` -- which
  [[metabase.query-processor.util.add-alias-info]] uses -- recur until the stack blows. This shallow shape says what
  the value is without reintroducing the cycle."
  [:map
   [:lib/type [:= {:decode/normalize common/normalize-keyword} :mbql/query]]
   [:stages   [:ref ::stages]]])

(mr/def ::cache-strategy.nocache
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:type [:= {:decode/normalize common/normalize-keyword} :nocache]]
   [:name {:optional true} [:maybe :string]]])

(mr/def ::cache-strategy.ttl
  "Cache for a multiple of the query's average execution time. Typed as plain numbers here: a strategy reaches a query
  from several places (the Card, a Dashboard, the Database), and `metabase.cache.api` is the one that asks for integers."
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:type            [:= {:decode/normalize common/normalize-keyword} :ttl]]
   [:multiplier      number?]
   [:min_duration_ms number?]])

(mr/def ::cache-strategy.duration
  "Cache for a fixed duration (EE)."
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:type                  [:= {:decode/normalize common/normalize-keyword} :duration]]
   [:duration              number?]
   [:unit                  [:enum "hours" "minutes" "seconds" "days"]]
   [:refresh_automatically {:optional true} [:maybe :boolean]]])

(mr/def ::cache-strategy.schedule
  "Cache until the next run of a cron schedule (EE)."
  [:map {:closed true, :decode/normalize common/normalize-map-no-kebab-case}
   [:type                  [:= {:decode/normalize common/normalize-keyword} :schedule]]
   [:schedule              :string]
   [:refresh_automatically {:optional true} [:maybe :boolean]]])

(mr/def ::cache-strategy.on-query
  "What is added to a strategy once it is attached to a query."
  [:map {:closed true}
   [:invalidated-at   {:optional true} [:maybe [:or :string #?@(:clj [(common/instance-of-class java.time.temporal.Temporal)])]]]
   [:avg-execution-ms {:optional true} [:int {:min 0}]]])

(mr/def ::cache-strategy
  "The caching strategy the results-cache middleware should apply to this query, attached
  by [[metabase.query-processor.card]]. Any of the strategy types: which ones an instance may configure is
  `metabase.cache.api`'s business, not the query's."
  [:multi {:dispatch         (fn [strategy] (some-> (:type strategy) keyword))
           :decode/normalize common/normalize-map-no-kebab-case}
   [:nocache  [:merge ::cache-strategy.nocache  ::cache-strategy.on-query]]
   [:ttl      [:merge ::cache-strategy.ttl      ::cache-strategy.on-query]]
   [:duration [:merge ::cache-strategy.duration ::cache-strategy.on-query]]
   [:schedule [:merge ::cache-strategy.schedule ::cache-strategy.on-query]]])

(mr/def ::compiled-native-query
  "A native query compiled from this query by [[metabase.query-processor.compile]], ready to hand to the driver.
  `:query` is whatever native form the driver uses -- a string for SQL drivers, a map for Mongo -- so it is only
  constrained to be non-`nil`.

  Deliberately NOT closed: drivers add their own keys, e.g. Mongo adds `:collection`, `:projections` and `:mbql?`
  (see `:metabase.driver.mongo.query-processor/compiled-pipeline`), and for a query that was already native the
  compiled form is the native stage itself, carrying every key a `::stage.native` has."
  [:map
   [:query  :some]
   [:params {:optional true} [:maybe [:sequential [:ref ::literal/param-value]]]]])

(mr/def ::query
  [:and
   [:map
    {:description        "Valid MBQL 5 query."
     :decode/normalize   #'normalize-query
     :decode/api         #'common/remove-internal-keys
     :encode/serialize   #'serialize-query
     :encode/for-hashing #'encode-query-for-hashing
     :closed             true}
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
    [:async?      {:optional true} :boolean]
    [:cache-strategy {:optional true} [:maybe [:ref ::cache-strategy]]]
    [:was-pivot
     {:optional true
      :description
      "Whether this query was originally run as a pivot query. Stamped into the saved `json_query` by
  `metabase.query-processor.middleware.process-userland-query` and sent back by clients re-downloading pivot query
  results."}
     [:maybe :boolean]]
    [:referenced-entities
     {:optional true
      :description
      "Entities whose values `POST /api/dataset` should run alongside the query and return under
  `data.referenced_entities`. Sent by clients for dynamic goals; read off the raw body and stripped from the
  query by the endpoint, so it never reaches the query processor."}
     [:maybe [:sequential [:map {:closed true}
                           [:type     :string]
                           [:id       :int]
                           [:columns  {:optional true} [:maybe [:sequential :string]]]
                           [:max_rows {:optional true} [:maybe :int]]]]]]
    [:pivot-rows         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
    [:pivot-cols         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
    [:pivot-measures     {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
    [:show-row-totals    {:optional true} [:maybe :boolean]]
    [:show-column-totals {:optional true} [:maybe :boolean]]
    [:pivot_rows         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
    [:pivot_cols         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
    [:pivot_measures     {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
    [:show_row_totals    {:optional true} [:maybe :boolean]]
    [:show_column_totals {:optional true} [:maybe :boolean]]
    [:viz-settings {:optional true} [:maybe [:ref ::common/visualization-settings]]]
    [:user-parameters {:optional true} [:ref ::lib.schema.parameter/parameters]]
    [:lib.convert/converted? {:optional true} :boolean]
    [:qp/compiled        {:optional true} [:ref ::compiled-native-query]]
    [:qp/compiled-inline {:optional true} [:ref ::compiled-native-query]]
    [:qp/source-card-id {:optional true} [:ref ::id/card]]
    [:qp/skip-result-metadata-persistence {:optional true} :boolean]
    [:qp.pivot/unremapped-breakout-combination {:optional true} [:sequential [:int {:min 0}]]]
    [:qp.pivot/remapped-breakout-combination   {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
    [:qp.pivot/num-remapped-cols               {:optional true} [:int {:min 0}]]
    [:qp.pivot/num-unremapped-breakouts        {:optional true} [:int {:min 0}]]
    [:qp.pivot/num-remapped-breakouts          {:optional true} [:int {:min 0}]]
    [:qp.pivot/remapped-indexes                {:optional true} [:map-of [:int {:min 0}] [:int {:min 0}]]]
    [:query-permissions/referenced-card-ids {:optional true} [:maybe [:set [:ref ::id/card]]]]
    [:destination-database/id {:optional true} [:ref ::id/database]]
    [:impersonation/role         {:optional true} ::common/non-blank-string]
    [:impersonation/admin?       {:optional true} :boolean]
    [:impersonation/allow-write? {:optional true} :boolean]
    [:metabase.query-processor.util.add-alias-info/original {:optional true} [:ref ::query.snapshot]]
    [:metabase.query-processor.middleware.add-remaps/external-remaps {:optional true} [:ref ::external-remappings]]
    [:metabase-enterprise.sandbox.query-processor.middleware.sandboxing/original-metadata
     {:optional true}
     [:ref ::sandboxing.original-metadata]]
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
   [:ref ::pivot-only-on-last-stage]
   (common/disallowed-keys
    {:expressions  ":expressions is not allowed in the top level of a query, only in MBQL stages"
     :pivot        ":pivot is a stage clause and only allowed on the last stage of a query"
     :filter       ":filter is not allowed in MBQL 5, and it's not allowed in the top-level of a stage in any MBQL version"
     :filters      ":filters is not allowed in the top level of a query, only in MBQL stages"
     :joins        ":joins is not allowed in the top level of a query, only in MBQL stages"
     :native       ":native is not allowed in MBQL 5, use :stages instead."
     :query        ":query is not allowed in MBQL 5, use :stages instead."
     :source-query ":source-query is not allowed in MBQL 5, and it's not allowed in the top-level of a stage in any MBQL version"
     :source-table ":source-table is not allowed in the top level of a query, only in MBQL stages"
     :type         ":type is not allowed in MBQL 5, use :lib/type instead."})])

(mr/def ::external-query
  "Schema for \"External MBQL\" 5 query."
  [:schema {:registry {::id/database :string
                       ::id/card :string
                       ::id/segment :string
                       ::id/measure :string
                       ::id/snippet :string
                       ::id/schema [:or nil? :string]
                       ::id/table [:cat ::id/database ::id/schema :string]
                       ::id/field [:cat ::id/database ::id/schema :string [:+ :string]]
                       ;; this spec has a :multi clause that assumes field IDs
                       ;; must be integers. the 3 in the assoc-in call refers to
                       ;; the :multi and the 2 refers to :dispatch-type/integer;
                       ;; if those get moved, this will need to change
                       :mbql.clause/field (assoc-in (mr/schema :mbql.clause/field)
                                                    [3 2 0] :dispatch-type/sequential)
                       ;; similarly we need to get rid of the :lib/uuid key of
                       ::common/options (update (mr/schema ::common/options) 2
                                                (fn [map-form]
                                                  (into []
                                                        (remove #(and (vector? %) (= :lib/uuid (first %))))
                                                        map-form)))}}
   [:ref ::query]])

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
