(ns metabase.driver.mongo.query-processor
  "Logic for translating MBQL queries into Mongo Aggregation Pipeline queries. See
  https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/ for more details."
  (:refer-clojure :exclude [some mapv empty? get-in])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.mongo.operators :refer [$add $addFields $addToSet $and
                                            $avg $concat $cond $dayOfMonth
                                            $dayOfWeek $dayOfYear $divide $eq
                                            $expr $group $gt $gte $hour $limit
                                            $literal $lookup $lt $lte $match
                                            $max $min $minute $mod $month
                                            $multiply $ne $not $or $project
                                            $regexMatch $second
                                            $setWindowFields $size $skip $sort
                                            $strcasecmp $subtract $sum
                                            $toBool $toLower $unwind $year]]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]
   [metabase.util.performance :as perf :refer [empty? get-in mapv some]])
  (:import
   (org.bson BsonBinarySubType)
   (org.bson.types Binary ObjectId)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Schema                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; this is just a very limited schema to make sure we're generating valid queries. We should expand it more in the
;; future

(mr/def ::$project-stage
  [:map-of
   [:= "$project"]
   [:map-of ::lib.schema.common/non-blank-string :any]])

(mr/def ::$sort-stage
  [:map-of
   [:= "$sort"]
   [:map-of ::lib.schema.common/non-blank-string [:enum -1 1]]])

(mr/def ::$match-stage
  [:map-of
   [:= "$match"]
   [:map-of
    [:and
     [:or ::lib.schema.common/non-blank-string :keyword]
     [:fn
      {:error/message "not a $not condition"}
      (complement #{:$not "$not"})]]
    :any]])

(mr/def ::$group-stage
  [:map-of
   [:= "$group"]
   [:map-of ::lib.schema.common/non-blank-string :any]])

(mr/def ::$add-fields-stage
  [:map-of
   [:= "$addFields"]
   [:map-of ::lib.schema.common/non-blank-string :any]])

(mr/def ::$lookup-stage
  [:map-of
   [:= "$lookup"]
   [:map
    {:closed true} ; add more stuff as needed
    [:from     :string]
    [:let      [:map
                [:vars {:optional true} :any]
                [:in   {:optional true} :any]]]
    [:pipeline [:ref ::pipeline]]
    [:as       :string]]])

(mr/def ::$unwind-stage
  [:map-of
   [:= "$unwind"]
   [:map-of [:or :keyword :string] :any]])

(mr/def ::$limit-stage
  [:map-of
   [:= "$limit"]
   pos-int?])

(mr/def ::$skip-stage
  [:map-of
   [:= "$skip"]
   pos-int?])

(mr/def ::$set-window-fields-stage
  [:map-of
   [:= "$setWindowFields"]
   [:map-of ::lib.schema.common/non-blank-string :any]])

(mr/def ::stage
  [:multi
   {:dispatch #(boolean (instance? org.bson.Document %))}
   [true
    ;; TODO (Cam 2026-07-17) consider whether we should parsed the BSON documents out into Ordered Maps so we can
    ;; properly validate them... even tho they implement `java.util.Map` Malli won't validate them as `:map` because
    ;; they're not `map?`
    (lib.schema.common/instance-of-class org.bson.Document)]
   [false
    [:and
     :map
     [:fn
      {:error/message "map with a single key"}
      #(= (count %) 1)]
     [:multi
      {:dispatch (fn [m]
                   (when (map? m)
                     (first (keys m))))}
      ["$project"         ::$project-stage]
      ["$sort"            ::$sort-stage]
      ["$group"           ::$group-stage]
      ["$addFields"       ::$add-fields-stage]
      ["$lookup"          ::$lookup-stage]
      ["$unwind"          ::$unwind-stage]
      ["$match"           ::$match-stage]
      ["$limit"           ::$limit-stage]
      ["$skip"            ::$skip-stage]
      ["$setWindowFields" ::$set-window-fields-stage]]]]])

(mr/def ::pipeline
  [:sequential ::stage])

(mr/def ::projection
  :string)

(mr/def ::projections
  "Schema for the `:projections` generated by the functions in this namespace. It is a sequence of the column names
  returned in an MBQL query. e.g.

    [\"_id\" \"date\" \"user_id\" \"venue_id\"]"

  [:and
   [:sequential ::projection]
   [:fn
    {:error/message "projected column names should be distinct"}
    (fn [coll]
      (if (seq coll)
        (apply distinct? coll)
        true))]])

(mr/def ::compiled-pipeline
  "Compiled pipeline query. Note that this is actually a subset of `:metabase.query-processor.compile/compiled`.

  This is also the schema for the value of `:native` in a MBQL stage for MongoDB."
  [:map
   {:closed true} ; we should document anything else we add here.
   [:projections {:optional true} [:maybe ::projections]]
   [:query       ::pipeline]
   ;; TODO (Cam 2026-07-17) it's not really clear if `:collection` is supposed to be in the top-level of the stage e.g.
   ;;
   ;;    {:lib/type :mbql.stage/native, :collection "X", :native {...}}
   ;;
   ;; or within `:native` e.g.
   ;;
   ;;    {:lib/type :mbql.stage/native, :native {:collection "X", ...}}
   ;;
   ;; [[metabase.query-processor.middleware.fetch-source-query/fix-mongodb-first-stage]] seems to put it in `:native`
   ;; itself but the [[metabase.driver/execute-reducible-query]] implementation for
   ;; MongoDB (in [[metabase.driver.mongo]]) assumes it's in the top level.
   ;;
   ;; I'm not clear where the FE sets it either.
   ;;
   ;; Let's standardize on one or the other and update the Lib schema to enforce the key being in the right
   ;; place (normalizing if needed).
   [:collection {:optional true} :string]])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    QP Impl                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:dynamic ^:private *next-alias-index*
  "Tracks index of next alias for join compilation. It is bound in [[mbql->native]] to `volatile!` valued 0. Hence
   every compilation starts with a fresh 0. Indices are used in [[handle-join]] to make aliases unique. Index values
   are gathered using [[next-alias-index]], hence first used index is of value 1."
  nil)

(defn- next-alias-index
  "Increment [[*next-alias-index*]] counter and return new index. Further context can be found in
   [[*next-alias-index*]] docstring."
  []
  (vswap! *next-alias-index* inc))

(def ^:dynamic ^:private *field-mappings*
  "The mapping from the fields to the projected names created
  by the nested query."
  {})

(defn- find-mapped-field-name
  "Finds the name of a mapped field, if any.
  First it does a quick exact match and if the field is not found, it searches for a field with the same ID/name and
  the same join alias.
  Note that during the compilation of joins, the field :join-alias is renamed to ::join-local to prevent prefixing the
  fields of the current join to be prefixed with the join alias."
  [[_ field-id params :as field]]
  (or (get *field-mappings* field)
      (some (fn [[e n]]
              (when (and (vector? e)
                         (= (subvec e 0 2) [:field field-id])
                         (= (:join-alias (e 2)) (:join-alias params))
                         (= (::join-local (e 2)) (::join-local params)))
                n))
            *field-mappings*)))

(defn- get-join-alias
  "Calculates the name of the join field used for `join-alias`, if any.
  It is assumed that join aliases are unique in the query (this is ensured by the escape-join-aliases middleware),
  so the alias is simply prefixed with a string to make it less likely that join filed we introduce in the $unwind
  stage overwrites a field of the document being joined to."
  [join-alias]
  (some->> join-alias (str "join_alias_")))

(mu/defn- get-mongo-version
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable]
  (driver-api/cached ::version
                     (driver/dbms-version :mongo (driver-api/database metadata-providerable))))

(defmulti ^:private ->rvalue
  "Format this MBQL clause or value for use as the right hand value of an expression, e.g. by adding `$` to a `Field`'s
  name"
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (when (vector? x)
      (assert (lib/clause? x)
              "Attempted to call ->rvalue on a vector that is not an MBQL clause!"))
    (driver-api/dispatch-by-clause-name-or-class x)))

(defmulti ^:private ->lvalue
  "Return an escaped name that can be used as the name of a given Field."
  {:arglists '([query stage-number field])}
  (fn [_query _stage-number field]
    (driver-api/dispatch-by-clause-name-or-class field)))

(mu/defn- col->name-components :- [:sequential :string]
  [metadata-providerable                                    :- ::lib.schema.metadata/metadata-providerable
   {:keys [parent-id nfc-path], field-name :name, :as _col} :- ::lib.schema.metadata/column]
  (cond
    ;; mongo sync stores `:nfc-path` with the field's own name as the last element, matching sql-jdbc nested json
    (seq nfc-path)
    nfc-path

    ;; fall back to walking `:parent-id` for fields synced before `:nfc-path` was populated
    parent-id
    (concat (col->name-components metadata-providerable (driver-api/field metadata-providerable parent-id))
            [field-name])

    :else
    [field-name]))

(defn- raw-path->components
  "Split a `parent.child.leaf`-style Mongo path string into a vector of path components. The Mongo driver
  treats `.` as the unambiguous nested-key separator everywhere (sync, projection, ordering); literal dots in
  document field names aren't supported."
  [^String path]
  (str/split path #"\."))

(mu/defn field->name
  "Return a single string name for column metadata `col` For nested fields, this creates a combined qualified name."
  ([metadata-providerable col]
   (field->name metadata-providerable col \.))

  ([metadata-providerable :- ::lib.schema.metadata/metadata-providerable
    col                   :- ::lib.schema.metadata/column
    separator             :- [:or :string char?]]
   (str/join separator (col->name-components metadata-providerable col))))

(defmacro ^:private mongo-let
  {:style/indent 1}
  [[field value] & body]
  {:$let {:vars {(keyword field) value}
          :in   `(let [~field ~(keyword (str "$$" (name field)))]
                   ~@body)}})

(declare with-rvalue-temporal-bucketing)

(mu/defn- scope-with-join-field :- :string
  "Adjust `field-name` for fields coming from joins. For use in `->[lr]value` for `:field` and `:metadata/column`."
  [field-name   :- [:maybe :string]
   join-field   :- [:maybe :string]
   source-alias :- [:maybe :string]]
  (cond->> (or source-alias field-name)
    join-field (str join-field \.)))

(defmethod ->lvalue :metadata/column
  [query _stage-number {::keys [join-field source-alias] :as field}]
  (scope-with-join-field (field->name query field) join-field source-alias))

(mu/defmethod ->lvalue :expression
  [_query _stage-number [_ opts expression-name] :- :mbql.clause/expression]
  (or (get opts driver-api/qp.add.desired-alias) expression-name))

(mu/defmethod ->rvalue :default
  [_query _stage-number x]
  x)

(mu/defmethod ->rvalue :expression
  [query stage-number [_ {:keys [temporal-unit]} expression-name] :- :mbql.clause/expression]
  (let [expression-value (lib/resolve-expression query stage-number expression-name)
        rvalue           (cond->> (->rvalue query stage-number expression-value)
                           (driver-api/is-clause? :value expression-value) (array-map $literal))]
    (cond-> rvalue
      temporal-unit (with-rvalue-temporal-bucketing query temporal-unit))))

(def ^:private base64-decoder "
function(bin) {
          if (!bin) return null;

          try {
            var base64 = bin.base64();

            // Manual base64 decode implementation
            var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            var result = '';
            var i = 0;

            // Remove any padding
            base64 = base64.replace(/=+$/, '');

            while (i < base64.length) {
              var a = chars.indexOf(base64.charAt(i++));
              var b = chars.indexOf(base64.charAt(i++));
              var c = chars.indexOf(base64.charAt(i++));
              var d = chars.indexOf(base64.charAt(i++));

              var bitmap = (a << 18) | (b << 12) | (c << 6) | d;

              result += String.fromCharCode((bitmap >> 16) & 255);
              if (c !== -1) result += String.fromCharCode((bitmap >> 8) & 255);
              if (d !== -1) result += String.fromCharCode(bitmap & 255);
            }

            return result;
          } catch(e) {
            return null;
          }
        }
")

(mu/defmethod ->rvalue :metadata/column
  [query
   _stage-number
   {coercion :coercion-strategy, ::keys [source-alias join-field inherited?] :as field} :- ::lib.schema.metadata/column]
  (let [field-name (str \$ (scope-with-join-field (field->name query field) join-field source-alias))
        coercion   (when-not inherited?
                     coercion)]
    (cond
      (isa? coercion :Coercion/UNIXNanoSeconds->DateTime)
      {:$dateFromParts {:millisecond {$divide [field-name 1000000]}, :year 1970, :timezone "UTC"}}

      (isa? coercion :Coercion/UNIXMicroSeconds->DateTime)
      {:$dateFromParts {:millisecond {$divide [field-name 1000]}, :year 1970, :timezone "UTC"}}

      (isa? coercion :Coercion/UNIXMilliSeconds->DateTime)
      {:$dateFromParts {:millisecond field-name, :year 1970, :timezone "UTC"}}

      (isa? coercion :Coercion/UNIXSeconds->DateTime)
      {:$dateFromParts {:second field-name, :year 1970, :timezone "UTC"}}

      (isa? coercion :Coercion/YYYYMMDDHHMMSSString->Temporal)
      {"$dateFromString" {:dateString field-name
                          :format     "%Y%m%d%H%M%S"
                          :onError    field-name}}

      (isa? coercion :Coercion/YYYYMMDDHHMMSSBytes->Temporal)
      {"$dateFromString" {:dateString {"$function"
                                       {:body base64-decoder
                                        :args [field-name]
                                        :lang "js"}}
                          :format     "%Y%m%d%H%M%S"
                          :onError    field-name}}

      (isa? coercion :Coercion/ISO8601Bytes->Temporal)
      {"$dateFromString" {:dateString {"$function"
                                       {:body base64-decoder
                                        :args [field-name]
                                        :lang "js"}}
                          :onError    field-name}}

      ;; mongo only supports datetime
      (isa? coercion :Coercion/ISO8601->DateTime)
      {"$dateFromString" {:dateString field-name
                          :onError    field-name}}

      (isa? coercion :Coercion/ISO8601->Date)
      (throw (ex-info (tru "MongoDB does not support parsing strings as dates. Try parsing to a datetime instead")
                      {:type              driver-api/qp.error-type.unsupported-feature
                       :coercion-strategy coercion}))

      (isa? coercion :Coercion/ISO8601->Time)
      (throw (ex-info (tru "MongoDB does not support parsing strings as times. Try parsing to a datetime instead")
                      {:type              driver-api/qp.error-type.unsupported-feature
                       :coercion-strategy coercion}))

      (isa? coercion :Coercion/DateTime->Date)
      (with-rvalue-temporal-bucketing query field-name :day)

      (isa? coercion :Coercion/String->Float)
      {"$toDouble" field-name}

      (isa? coercion :Coercion/String->Integer)
      {"$toLong" field-name}

      (isa? coercion :Coercion/Float->Integer)
      {"$toLong" {"$round" {"$toDouble" field-name}}}

      :else field-name)))

;; Don't think this needs to implement `->lvalue` because you can't assign something to an aggregation e.g.
;;
;;    aggregations[0] = 20
;;
(mu/defmethod ->lvalue :aggregation
  [query stage-number ag-ref :- :mbql.clause/aggregation]
  (driver-api/mbql-5-aggregation-name query stage-number ag-ref))

(mu/defmethod ->lvalue :field
  [query stage-number [_ {:keys [join-alias] :as opts} id-or-name :as field] :- :mbql.clause/field]
  (if (pos-int? id-or-name)
    (or (find-mapped-field-name field)
        (->lvalue query stage-number (assoc (driver-api/field query id-or-name)
                                            ::source-alias (driver-api/qp.add.source-alias opts)
                                            ::join-field (get-join-alias join-alias))))
    (scope-with-join-field (name id-or-name) (get-join-alias join-alias) (driver-api/qp.add.source-alias opts))))

(defn- add-start-of-week-offset [expr offset]
  (cond
    (zero? offset) expr
    (neg? offset)  (recur expr (+ offset 7))
    :else          {$mod [{$add [expr offset]}
                          7]}))

(defn- day-of-week
  [column]
  (mongo-let [day_of_week (add-start-of-week-offset {$dayOfWeek {:date column :timezone (driver-api/results-timezone-id)}}
                                                    (driver.common/start-of-week-offset :mongo))]
    {$cond {:if   {$eq [day_of_week 0]}
            :then 7
            :else day_of_week}}))

(defn- week
  [column]
  {$subtract [column
              {$multiply [{$subtract [(day-of-week column)
                                      1]}
                          (* 24 60 60 1000)]}]})

(defn- truncate-to-resolution [column resolution]
  (mongo-let [parts {:$dateToParts {:timezone (driver-api/results-timezone-id)
                                    :date column}}]
    {:$dateFromParts (into {:timezone (driver-api/results-timezone-id)}
                           (for [part (concat (take-while (partial not= resolution)
                                                          [:year :month :day :hour :minute :second :millisecond])
                                              [resolution])]
                             [part (str (name parts) \. (name part))]))}))

(mu/defn- days-till-start-of-first-full-week
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column]
  (let [start-of-year                (with-rvalue-temporal-bucketing metadata-providerable column :year)
        day-of-week-of-start-of-year (with-rvalue-temporal-bucketing metadata-providerable start-of-year :day-of-week)]
    {:$subtract [8 day-of-week-of-start-of-year]}))

(mu/defn- week-of-year
  "Full explanation of this magic is in [[metabase.driver.sql.query-processor/week-of-year]]."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column
   mode]
  (let [doy    (with-rvalue-temporal-bucketing metadata-providerable column :day-of-year)
        dtsofw (binding [driver.common/*start-of-week* (case mode
                                                         :us :sunday
                                                         :instance nil)]
                 (days-till-start-of-first-full-week metadata-providerable column))]
    {:$toInt {:$add [1 {:$ceil {:$divide [{:$subtract [doy dtsofw]} 7]}}]}}))

(defn- extract
  [op column]
  {op {:date column :timezone (driver-api/results-timezone-id)}})

(mu/defn- with-rvalue-temporal-bucketing
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column
   unit :- ::lib.schema.temporal-bucketing/unit]
  {:style/indent [:form]}
  (if (= unit :default)
    column
    (let [supports-dateTrunc? (-> (get-mongo-version metadata-providerable)
                                  :semantic-version
                                  (driver.u/semantic-version-gte [5]))
          column column]
      (letfn [(truncate [unit]
                (if supports-dateTrunc?
                  {:$dateTrunc {:date column
                                :unit (name unit)
                                :timezone (driver-api/results-timezone-id)
                                :startOfWeek (name (driver-api/start-of-week))}}
                  (truncate-to-resolution column unit)))]
        (case unit
          :default          column
          :second-of-minute (extract $second column)
          :minute           (truncate :minute)
          :minute-of-hour   (extract $minute column)
          :hour             (truncate :hour)
          :hour-of-day      (extract $hour column)
          :day              (truncate :day)
          :day-of-week      (day-of-week column)
          :day-of-week-iso  (binding [driver.common/*start-of-week* :monday]
                              (day-of-week column))
          :day-of-month     (extract $dayOfMonth column)
          :day-of-year      (extract $dayOfYear column)
          :week             (if supports-dateTrunc?
                              (truncate :week)
                              (truncate-to-resolution (week column) :day))
          :week-of-year     (let [week-start (if supports-dateTrunc?
                                               (truncate :week)
                                               (week column))]
                              {:$ceil {$divide [{$dayOfYear week-start}
                                                7.0]}})
          :week-of-year-iso (extract :$isoWeek column)
          :week-of-year-us  (week-of-year metadata-providerable column :us)
          :week-of-year-instance  (week-of-year metadata-providerable column :instance)
          :month            (truncate :month)
          :month-of-year    (extract $month column)
          ;; For quarter we'll just subtract enough days from the current date to put it in the correct month and
          ;; stringify it as yyyy-MM Subtracting (($dayOfYear(column) % 91) - 3) days will put you in correct month.
          ;; Trust me.
          :quarter
          (if supports-dateTrunc?
            (truncate :quarter)
            (mongo-let [#_{:clj-kondo/ignore [:unused-binding]} parts {:$dateToParts {:date column :timezone (driver-api/results-timezone-id)}}]
              {:$dateFromParts {:year  :$$parts.year
                                :month {$subtract [:$$parts.month
                                                   {$mod [{$add [:$$parts.month 2]}
                                                          3]}]}
                                :timezone (driver-api/results-timezone-id)}}))

          :quarter-of-year
          {:$toInt {:$ceil {$divide [(extract $month column) 3.0]}}}

          :year
          (truncate :year)

          :year-of-era
          (extract $year column))))))

(mu/defmethod ->rvalue :field
  [query                                                                :- ::lib.schema/query
   stage-number                                                         :- :int
   [_ {:keys [temporal-unit join-alias] :as opts} id-or-name :as field] :- :mbql.clause/field]
  (let [join-field   (get-join-alias join-alias)
        source-alias (driver-api/qp.add.source-alias opts)
        rvalue       (if (pos-int? id-or-name)
                       (if-let [mapped (find-mapped-field-name field)]
                         (str \$ mapped)
                         (->rvalue query stage-number (assoc (driver-api/field query id-or-name)
                                                             ::source-alias source-alias
                                                             ::join-field   join-field
                                                             ::inherited?   (not (or (pos-int? (driver-api/qp.add.source-table opts))
                                                                                     (:qp/allow-coercion-for-columns-without-integer-qp.add.source-table opts))))))
                       (if-let [mapped (find-mapped-field-name field)]
                         (str \$ mapped)
                         (str \$ (scope-with-join-field (name id-or-name) join-field source-alias))))]
    (if temporal-unit
      (with-rvalue-temporal-bucketing query rvalue temporal-unit)
      rvalue)))

;; Values clauses below; they only need to implement `->rvalue`

(mu/defmethod ->rvalue nil
  [_query _stage-number _nil]
  nil)

(defn- uuid->bsonbinary
  [u]
  (let [lo (.getLeastSignificantBits ^java.util.UUID u)
        hi (.getMostSignificantBits  ^java.util.UUID u)
        ba (-> (java.nio.ByteBuffer/allocate 16) ; UUID is 128 bits-long
               (.putLong hi)
               (.putLong lo)
               (.array))]
    (Binary. BsonBinarySubType/UUID_STANDARD ba)))

(mu/defmethod ->rvalue :value
  [_query _stage-number [_ {base-type :base-type} value] :- :mbql.clause/value]
  (cond
    ;; Passing nil or "" to the ObjectId or Binary constructor throws an exception
    (or (nil? value) (= value ""))
    value

    (isa? base-type :type/MongoBSONID)
    (ObjectId. (str value))

    (isa? base-type :type/MongoBinData)
    (try
      (-> (str value)
          java.util.UUID/fromString
          uuid->bsonbinary)
      (catch IllegalArgumentException _
        ;; Allow comparison with non-UUID values for things like string search
        value))

    :else value))

(defn- $date-from-string [s]
  {:$dateFromString {:dateString (str s)}})

(mu/defn- absolute-datetime-or-time->rvalue
  [metadata-providerable
   [_ _opts t unit] :- [:or :mbql.clause/absolute-datetime :mbql.clause/time]]
  (let [report-zone (t/zone-id (or (driver-api/report-timezone-id-if-supported :mongo (driver-api/database metadata-providerable))
                                   "UTC"))
        t           (condp = (class t)
                      java.time.LocalDate      t
                      java.time.LocalTime      t
                      java.time.LocalDateTime  t
                      java.time.OffsetTime     (t/offset-time t report-zone)
                      java.time.OffsetDateTime (t/offset-date-time t report-zone)
                      java.time.ZonedDateTime  (t/offset-date-time t report-zone))]
    (letfn [(extract [unit]
              (u.date/extract t unit))
            (bucket [unit]
              ($date-from-string (u.date/bucket t unit)))]
      (case (or unit :default)
        :default         ($date-from-string t)
        :minute          (bucket :minute)
        :minute-of-hour  (extract :minute-of-hour)
        :hour            (bucket :hour)
        :hour-of-day     (extract :hour-of-day)
        :day             (bucket :day)
        :day-of-week     (extract :day-of-week)
        :day-of-month    (extract :day-of-month)
        :day-of-year     (extract :day-of-year)
        :week            (bucket :week)
        :week-of-year    (extract :week-of-year)
        :month           (bucket :month)
        :month-of-year   (extract :month-of-year)
        :quarter         (bucket :quarter)
        :quarter-of-year (extract :quarter-of-year)
        :year            (bucket :year)))))

(mu/defmethod ->rvalue :absolute-datetime
  [query _stage-number clause :- :mbql.clause/absolute-datetime]
  (absolute-datetime-or-time->rvalue query clause))

(mu/defmethod ->rvalue :time
  [query _stage-number clause :- :mbql.clause/time]
  (absolute-datetime-or-time->rvalue query clause))

(mu/defmethod ->rvalue :relative-datetime
  [query _stage-number [_ _opts amount unit] :- :mbql.clause/relative-datetime]
  (let [t (-> (t/zoned-date-time)
              (t/with-zone-same-instant (t/zone-id (or (driver-api/report-timezone-id-if-supported :mongo (driver-api/database query))
                                                       "UTC"))))]
    ($date-from-string
     (t/offset-date-time
      (if (= unit :default)
        t
        (-> t
            (u.date/add unit amount)
            (u.date/bucket unit)))))))

;;; ---------------------------------------------------- functions ---------------------------------------------------

;; It doesn't make 100% sense to have lvalues for all these but it's a formal requirement

(defmethod ->lvalue :avg       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :stddev    [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :var       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :sum       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :min       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :max       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))

(defmethod ->lvalue :floor     [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :ceil      [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :round     [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :abs       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))

(defmethod ->lvalue :log       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :exp       [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :sqrt      [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))

(defmethod ->lvalue :trim      [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :ltrim     [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :rtrim     [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :upper     [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :lower     [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))
(defmethod ->lvalue :length    [query stage-number [_ _opts inp]] (->lvalue query stage-number inp))

(defmethod ->lvalue :power     [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))
(defmethod ->lvalue :replace   [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))
(defmethod ->lvalue :concat    [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))
(defmethod ->lvalue :substring [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))

(defmethod ->lvalue :+ [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))
(defmethod ->lvalue :- [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))
(defmethod ->lvalue :* [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))
(defmethod ->lvalue :/ [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))

(defmethod ->lvalue :coalesce [query stage-number [_ _opts & args]] (->lvalue query stage-number (first args)))

(mu/defmethod ->rvalue :avg
  [query stage-number [_ _opts inp] :- :mbql.clause/avg]
  {$avg (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :stddev
  [query stage-number [_ _opts expr] :- :mbql.clause/stddev]
  {"$stdDevSamp" (->rvalue query stage-number expr)})

(mu/defmethod ->rvalue :sum
  [query stage-number [_ _opts inp] :- :mbql.clause/sum]
  {"$sum" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :min
  [query stage-number [_ _opts inp] :- :mbql.clause/min]
  {$min (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :max
  [query stage-number [_ _opts inp] :- :mbql.clause/max]
  {$max (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :floor
  [query stage-number [_ _opts inp] :- :mbql.clause/floor]
  {"$floor" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :ceil
  [query stage-number [_ _opts inp] :- :mbql.clause/ceil]
  {"$ceil" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :round
  [query stage-number [_ _opts inp] :- :mbql.clause/round]
  {"$round" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :abs
  [query stage-number [_ _opts inp] :- :mbql.clause/abs]
  {"$abs" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :log
  [query stage-number [_ _opts inp] :- :mbql.clause/log]
  {"$log10" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :exp
  [query stage-number [_ _opts inp] :- :mbql.clause/exp]
  {"$exp" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :sqrt
  [query stage-number [_ _opts inp] :- :mbql.clause/sqrt]
  {"$sqrt" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :trim
  [query stage-number [_ _opts inp] :- :mbql.clause/trim]
  {"$trim" {"input" (->rvalue query stage-number inp)}})

(mu/defmethod ->rvalue :ltrim
  [query stage-number [_ _opts inp] :- :mbql.clause/ltrim]
  {"$ltrim" {"input" (->rvalue query stage-number inp)}})

(mu/defmethod ->rvalue :rtrim
  [query stage-number [_ _opts inp] :- :mbql.clause/rtrim]
  {"$rtrim" {"input" (->rvalue query stage-number inp)}})

(mu/defmethod ->rvalue :upper
  [query stage-number [_ _opts inp] :- :mbql.clause/upper]
  {"$toUpper" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :lower
  [query stage-number [_ _opts inp] :- :mbql.clause/lower]
  {"$toLower" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :length
  [query stage-number [_ _opts inp] :- :mbql.clause/length]
  {"$strLenCP" (->rvalue query stage-number inp)})

(mu/defmethod ->rvalue :power
  [query stage-number [_ _opts & args] :- :mbql.clause/power]
  {"$pow" (mapv (partial ->rvalue query stage-number) args)})

(mu/defmethod ->rvalue :concat
  [query stage-number [_ _opts & args] :- :mbql.clause/concat]
  {"$concat" (mapv (partial ->rvalue query stage-number) args)})

(mu/defmethod ->rvalue :temporal-extract
  [query stage-number [_ _opts inp unit] :- :mbql.clause/temporal-extract]
  (with-rvalue-temporal-bucketing query (->rvalue query stage-number inp) unit))

(mu/defmethod ->rvalue :replace
  [query stage-number [_ _opts & args] :- :mbql.clause/replace]
  (let [version (get-mongo-version query)]
    (if (driver.u/semantic-version-gte (:semantic-version version) [4 4])
      (let [[expr fnd replacement] (mapv (partial ->rvalue query stage-number) args)]
        {"$replaceAll" {"input" expr "find" fnd "replacement" replacement}})
      (throw (ex-info "Replace requires MongoDB 4.4 or above"
                      {:database-version version})))))

(mu/defmethod ->rvalue :substring
  [query stage-number [_ _opts string-expr start length] :- :mbql.clause/substring]
  (let [expr-val (->rvalue query stage-number string-expr)
        idx-val {"$subtract" [(->rvalue query stage-number start) 1]}]
    {"$substrCP" [expr-val
                  idx-val
                  ;; The last argument is not optional in mongo
                  (if (some? length)
                    (->rvalue query stage-number length)
                    {"$subtract" [{"$strLenCP" expr-val} idx-val]})]}))

(mu/defmethod ->rvalue :/
  [query stage-number [_ _opts & [_ & divisors :as args]] :- :mbql.clause//]
  ;; division works outside in (/ 1 2 3) => (/ (/ 1 2) 3)
  (let [division (reduce
                  (fn [accum head]
                    (if accum
                      {"$divide" [accum head]}
                      head))
                  nil
                  (map (partial ->rvalue query stage-number) args))
        literal-zero? (some #(and (number? %) (zero? %)) divisors)
        non-literal-nil-checks (mapv (fn [divisor] {"$eq" [(->rvalue query stage-number divisor) 0]}) (remove number? divisors))]
    (cond
      literal-zero?
      nil

      (empty? non-literal-nil-checks)
      division

      (= 1 (count non-literal-nil-checks))
      {"$cond" [(first non-literal-nil-checks) nil
                division]}

      :else
      {"$cond" [{"$or" non-literal-nil-checks} nil
                division]})))

;;; Intervals are not first class Mongo citizens, so they cannot be translated on their own.
;;; The only thing we can do with them is adding to or subtracting from a date valued expression.
;;; Also, date arithmetic with intervals was first implemented in version 5. (Before that only
;;; ordinary addition could be used: one of the operands of the addition could be a date, their
;;; rest of the operands had to be integers and would be treated as milliseconds.)
;;; Because of this, whenever we translate date arithmetic with intervals, we check the major
;;; version of the database and throw a nice exception if it's less than 5.

(defn- check-date-operations-supported [metadata-providerable]
  (let [{mongo-version :version, [major-version] :semantic-version} (get-mongo-version metadata-providerable)]
    (when (and major-version (< major-version 5))
      (throw (ex-info "Date arithmetic not supported in versions before 5"
                      {:database-version mongo-version})))))

(defn- interval? [expr]
  (and (vector? expr) (= (first expr) :interval)))

(defn- summarize-interval [op date-expr [_ _opts amount unit]]
  {op {:startDate date-expr
       :unit unit
       :amount amount}})

(defn- summarize-num-or-interval
  [query stage-number number-op date-op mongo-expr mbql-expr]
  (cond
    (interval? mbql-expr)            (summarize-interval date-op mongo-expr mbql-expr)
    (contains? mongo-expr number-op) (update mongo-expr number-op conj (->rvalue query stage-number mbql-expr))
    :else                            {number-op [mongo-expr (->rvalue query stage-number mbql-expr)]}))

(defn- num-or-interval-reducer [query stage-number plus-or-minus]
  (case plus-or-minus
    :+ #(summarize-num-or-interval query stage-number "$add"      "$dateAdd"      %1 %2)
    :- #(summarize-num-or-interval query stage-number "$subtract" "$dateSubtract" %1 %2)))

(mu/defmethod ->rvalue :+
  [query stage-number [_ _opts & args] :- :mbql.clause/+]
  ;; Addition is commutative and any but not all elements of `args` can be intervals.
  ;; We pick the first arg that is not an interval and add the rest of args to it.
  ;; (It's the callers responsibility to make sure that the first non-interval argument
  ;; represents a date and not an offset like an integer would.)
  ;; If none of the args is an interval, we shortcut with a simple addition.
  (if (some interval? args)
    (if-let [[arg others] (u/pick-first (complement interval?) args)]
      (do
        (check-date-operations-supported query)
        (reduce (num-or-interval-reducer query stage-number :+) (->rvalue query stage-number arg) others))
      (throw (ex-info "Summing intervals is not supported" {:args args})))
    {"$add" (mapv (partial ->rvalue query stage-number) args)}))

(mu/defmethod ->rvalue :- :- :any ; [[mu/defmethod]] seems to get tripped up if the dispatch value is `:-` with no return value schema
  [query stage-number [_ _opts & [arg & others :as args]] :- :mbql.clause/-]
  ;; Subtraction is not commutative so `arg` cannot be an interval.
  ;; If none of the args is an interval, we shortcut with a simple subtraction.
  (if (some interval? others)
    (do
      (check-date-operations-supported query)
      (reduce (num-or-interval-reducer query stage-number :-) (->rvalue query stage-number arg) others))
    {"$subtract" (mapv (partial ->rvalue query stage-number) args)}))

(mu/defmethod ->rvalue :*
  [query stage-number [_ _opts & args] :- :mbql.clause/*]
  {"$multiply" (mapv (partial ->rvalue query stage-number) args)})

(mu/defmethod ->rvalue :coalesce
  [query stage-number [_ _opts & args] :- :mbql.clause/coalesce]
  {"$ifNull" (mapv (partial ->rvalue query stage-number) args)})

(mu/defmethod ->rvalue :now
  [query _stage-number _ :- :mbql.clause/now]
  (if (driver/database-supports? :mongo :now (driver-api/database query))
    "$$NOW"
    (throw (ex-info (tru "now is not supported for MongoDB versions before 4.2")
                    {:database-version (:version (get-mongo-version query))}))))

(mu/defmethod ->rvalue :text
  [query stage-number [_ _opts expr] :- :mbql.clause/text]
  {"$toString" (->rvalue query stage-number expr)})

(mu/defmethod ->rvalue :date
  [query stage-number [_ _opts expr] :- :mbql.clause/date]
  (let [rvalue (->rvalue query stage-number expr)]
    (with-rvalue-temporal-bucketing
      query
      {"$cond" [{"$eq" [{"$type" rvalue} "string"]}
                {"$toDate" rvalue}
                rvalue]}
      :day)))

(mu/defmethod ->rvalue :today
  [query stage-number _ :- :mbql.clause/today]
  (->rvalue query stage-number [:date [:now]]))

(mu/defmethod ->rvalue :datetime
  [query stage-number [_ {:keys [mode], :as _opts} expr] :- :mbql.clause/datetime]
  (let [rvalue (->rvalue query stage-number expr)]
    (case (or mode :iso)
      :iso
      {"$dateFromString" {:dateString rvalue
                          :onError    rvalue}}

      :simple
      {"$dateFromString" {:dateString rvalue
                          :format     "%Y%m%d%H%M%S"
                          :onError    rvalue}}

      :simple-bytes
      {"$dateFromString" {:dateString {"$function"
                                       {:body base64-decoder
                                        :args [rvalue]
                                        :lang "js"}}
                          :format     "%Y%m%d%H%M%S"
                          :onError    rvalue}}

      :iso-bytes
      {"$dateFromString" {:dateString {"$function"
                                       {:body base64-decoder
                                        :args [rvalue]
                                        :lang "js"}}
                          :onError    rvalue}}

      :unix-nanoseconds
      {:$dateFromParts {:millisecond {$divide [rvalue 1000000]}, :year 1970, :timezone "UTC"}}

      :unix-microseconds
      {:$dateFromParts {:millisecond {$divide [rvalue 1000]}, :year 1970, :timezone "UTC"}}

      :unix-milliseconds
      {:$dateFromParts {:millisecond rvalue, :year 1970, :timezone "UTC"}}

      :unix-seconds
      {:$dateFromParts {:second rvalue, :year 1970, :timezone "UTC"}}

      ;; else
      (throw (ex-info (tru "Driver {0} does not support {1}" :mongo mode)
                      {:type driver-api/qp.error-type.unsupported-feature})))))

(mu/defmethod ->rvalue :datetime-add
  [query stage-number [_ _opts inp amount unit] :- :mbql.clause/datetime-add]
  (check-date-operations-supported query)
  {"$dateAdd" {:startDate (->rvalue query stage-number inp)
               :unit      unit
               :amount    amount}})

(mu/defmethod ->rvalue :datetime-subtract
  [query stage-number [_ _opts inp amount unit]]
  (check-date-operations-supported query)
  {"$dateSubtract" {:startDate (->rvalue query stage-number inp)
                    :unit      unit
                    :amount    amount}})

(defmulti datetime-diff
  "Helper function for ->rvalue for `datetime-diff` clauses."
  {:added "0.46.0" :arglists '([x y unit])}
  (fn [_ _ unit] unit))

(defmethod datetime-diff :year
  [x y _unit]
  {$divide [(datetime-diff x y :month) 12]})

(defmethod datetime-diff :quarter
  [x y _unit]
  {$divide [(datetime-diff x y :month) 3]})

(defmethod datetime-diff :month
  [x y _unit]
  {$add [{"$dateDiff" {:startDate x, :endDate y, :unit "month"}}
         ;; dateDiff counts month boundaries not whole months, so we need to adjust
         ;; if x<y but x>y in the month calendar then subtract one month
         ;; if x>y but x<y in the month calendar then add one month
         {:$switch {:branches [{:case {:$and [{$lt [x y]}
                                              {$gt [{$dayOfMonth x} {$dayOfMonth y}]}]}
                                :then -1}
                               {:case {:$and [{$gt [x y]}
                                              {$lt [{$dayOfMonth x} {$dayOfMonth y}]}]}
                                :then 1}]
                    :default  0}}]})

(defmethod datetime-diff :week
  [x y _unit]
  {$divide [(datetime-diff x y :day) 7]})

(defn- simple-datediff
  [x y unit]
  {"$dateDiff" {:startDate x, :endDate y, :unit unit}})

(defmethod datetime-diff :day    [x y unit] (simple-datediff x y unit))
(defmethod datetime-diff :minute [x y unit] (simple-datediff x y unit))
(defmethod datetime-diff :second [x y unit] (simple-datediff x y unit))

(defmethod datetime-diff :hour
  [x y _unit]
  ;; mongo's dateDiff with hour isn't accurate to the millisecond
  {$divide [{"$dateDiff" {:startDate x, :endDate y, :unit "millisecond"}}
            3600000]})

(mu/defmethod ->rvalue :datetime-diff
  [query stage-number [_ _opts x y unit] :- :mbql.clause/datetime-diff]
  (check-date-operations-supported query)
  (datetime-diff (->rvalue query stage-number x) (->rvalue query stage-number y) unit))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               CLAUSE APPLICATION                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ----------------------------------------------------- filter -----------------------------------------------------

;; represents a regex pattern that should be compiled to `{$not <regex}`
(lib.schema.mbql-clause/define-mbql-clause ::not-regex :- :type/Text
  [:tuple
   [:= ::not-regex]
   [:ref ::lib.schema.common/options]
   (lib.schema.common/instance-of-class java.util.regex.Pattern)])

;; TODO (Cam 2026-07-23) this actually gets compiled by [[str-match-pattern]], consider whether that behavior should
;; get rolled into this method or we should just remove this method altogether since it's not meant to actually be
;; used
(mu/defmethod ->rvalue ::not-regex
  [query stage-number [_ _opts pattern] :- ::not-regex]
  {$not (->rvalue query stage-number pattern)})

(lib.schema.mbql-clause/define-mbql-clause ::size :- :type/Integer
  [:tuple
   [:= ::size]
   [:ref ::lib.schema.common/options]
   :string])

(mu/defmethod ->rvalue ::size
  [_query _stage-number [_ _opts x]]
  {$size x})

(defmulti compile-filter
  "Compile an mbql filter clause to datastructures suitable to query mongo. Note this is not the whole query but just
  compiling the \"where\" clause equivalent."
  {:added "0.39.0" :arglists '([query stage-number clause])}
  (fn [_query _stage-number clause]
    (driver-api/dispatch-by-clause-name-or-class clause)))

(defmethod compile-filter :between
  [query stage-number [_ _opts expr min-val max-val]]
  (compile-filter query stage-number (lib/and
                                      (lib/>= expr min-val)
                                      (lib/<= expr max-val))))

(defn- str-match-pattern [query stage-number field options prefix value suffix]
  (if (driver-api/is-clause? ::not-regex value)
    (let [[_tag _opts pattern] value]
      {$not (str-match-pattern query stage-number field options prefix pattern suffix)})
    (do
      (assert (and (contains? #{nil "^"} prefix) (contains? #{nil "$"} suffix))
              "Wrong prefix or suffix value.")
      {$regexMatch {"input" (->rvalue query stage-number field)
                    "regex" (if (= (first value) :value)
                              (str prefix (->rvalue query stage-number value) suffix)
                              {$concat (into [] (remove nil?) [(when (some? prefix) {$literal prefix})
                                                               (->rvalue query stage-number value)
                                                               (when (some? suffix) {$literal suffix})])})
                    "options" (if (get options :case-sensitive true) "" "i")}})))

;; these are changed to {field {$regex "regex"}} instead of {field #regex} for serialization purposes. When doing
;; native query substitution we need a string and the explicit regex form is better there
(defmethod compile-filter :contains
  [query stage-number [_ opts field v]]
  {$expr (str-match-pattern query stage-number field opts nil v nil)})

(defmethod compile-filter :starts-with
  [query stage-number [_ opts field v]]
  {$expr (str-match-pattern query stage-number field opts "^" v nil)})

(defmethod compile-filter :ends-with
  [query stage-number [_ opts field v]]
  {$expr (str-match-pattern query stage-number field opts nil v "$")})

(defn- rvalue-is-variable? [rvalue]
  (and (string? rvalue)
       (str/starts-with? rvalue "$$")))

(defn- rvalue-is-field? [rvalue]
  (and (string? rvalue)
       (str/starts-with? rvalue "$")
       (not (rvalue-is-variable? rvalue))))

(defn- rvalue-can-be-compared-directly?
  "Whether `rvalue` is something simple that can be compared directly e.g.

    {$match {$field {$eq rvalue}}}

  as opposed to

    {$match {$expr {$eq [$field rvalue]}}}"
  [rvalue]
  (or (rvalue-is-field? rvalue)
      (and (not (map? rvalue))
           (not (rvalue-is-variable? rvalue))
           (not (instance? java.util.regex.Pattern rvalue)))))

(defn- filter-expr [query stage-number operator field value]
  (let [field-rvalue (->rvalue query stage-number field)
        value-rvalue (->rvalue query stage-number value)]
    (if (and (rvalue-is-field? field-rvalue)
             (not (rvalue-is-field? value-rvalue))
             (rvalue-can-be-compared-directly? value-rvalue))
      ;; if we don't need to do anything fancy with field we can generate a clause like
      ;;
      ;;    {field {$lte 100}}
      {(str/replace-first field-rvalue #"^\$" "")
       ;; for the $eq operator we actually don't need to do {field {$eq 100}}, we can just do {field 100}
       (if (= (name operator) "$eq")
         value-rvalue
         {operator value-rvalue})}
      ;; if we need to do something fancy then we have to use `$expr` e.g.
      ;;
      ;;    {$expr {$lte [{$add [$field 1]} 100]}}
      {$expr {operator [field-rvalue value-rvalue]}})))

(defmethod compile-filter :=
  [query stage-number [_ _opts field value]]
  (filter-expr query stage-number $eq field value))

(defmethod compile-filter :!=
  [query stage-number [_ _opts field value]]
  (filter-expr query stage-number $ne field value))

(defmethod compile-filter :<
  [query stage-number [_ _opts field value]]
  (filter-expr query stage-number $lt field value))

(defmethod compile-filter :>
  [query stage-number [_ _opts field value]]
  (filter-expr query stage-number $gt field value))

(defmethod compile-filter :<=
  [query stage-number [_ _opts field value]]
  (filter-expr query stage-number $lte field value))

(defmethod compile-filter :>=
  [query stage-number [_ _opts field value]]
  (filter-expr query stage-number $gte field value))

(defmethod compile-filter :and
  [query stage-number [_and _opts & args]]
  {$and (mapv (partial compile-filter query stage-number) args)})

(defmethod compile-filter :or
  [query stage-number [_or _opts & args]]
  {$or (mapv (partial compile-filter query stage-number) args)})

;;; MongoDB doesn't support negating top-level filter clauses. So we can leverage the MBQL lib's
;;; `negate-filter-clause` to negate everything, with the exception of the string filter clauses, which we will
;;; convert to a `{not <regex}` clause (see `->rvalue` for `::not-regex` above). `negate` below wraps the MBQL lib
;;; function

(defmulti ^:private negate
  {:arglists '([mbql-clause])}
  driver-api/dispatch-by-clause-name-or-class)

(mu/defmethod negate :default :- ::lib.schema.mbql-clause/clause
  [expr :- ::lib.schema.expression/boolean]
  (lib/negate-boolean-expression expr))

(mu/defmethod negate :and :- ::lib.schema.mbql-clause/clause
  [[_ opts & subclauses] :- :mbql.clause/and]
  (into [:or opts]  (map negate) subclauses))

(mu/defmethod negate :or  :- ::lib.schema.mbql-clause/clause
  [[_ opts & subclauses] :- :mbql.clause/or]
  (into [:and opts] (map negate) subclauses))

(mu/defn- not-regex [pattern :- (lib.schema.common/instance-of-class java.util.regex.Pattern)]
  [::not-regex {:lib/uuid (str (random-uuid))} pattern])

(mu/defmethod negate :contains :- ::lib.schema.mbql-clause/clause
  [[_ opts field v] :- :mbql.clause/contains]
  [:contains opts field (not-regex v)])

(mu/defmethod negate :starts-with :- ::lib.schema.mbql-clause/clause
  [[_ opts field v] :- :mbql.clause/starts-with]
  [:starts-with opts field (not-regex v)])

(mu/defmethod negate :ends-with :- ::lib.schema.mbql-clause/clause
  [[_ opts field v] :- :mbql.clause/ends-with]
  [:ends-with opts field (not-regex v)])

(mu/defmethod compile-filter :not :- ::lib.schema.mbql-clause/clause
  [query stage-number [_ _opts subclause] :- :mbql.clause/not]
  (compile-filter query stage-number (negate subclause)))

(mu/defmethod compile-filter :expression
  [query stage-number [_ _opts expression-name] :- :mbql.clause/expression]
  (let [expression-value (lib/resolve-expression query stage-number expression-name)]
    (compile-filter query stage-number expression-value)))

(mu/defmethod compile-filter :field
  [query stage-number field-clause :- :mbql.clause/field]
  {$expr {$toBool (->rvalue query stage-number field-clause)}})

(mu/defmethod compile-filter :value
  [query stage-number value-clause :- :mbql.clause/value]
  {$expr (->rvalue query stage-number value-clause)})

(mu/defn- handle-filters :- ::compiled-pipeline
  ([query stage-number pipeline-ctx]
   (handle-filters query stage-number pipeline-ctx (lib/filters query stage-number)))
  ([query          :- ::lib.schema/query
    stage-number   :- :int
    pipeline-ctx   :- ::compiled-pipeline
    filter-clauses :- [:maybe [:ref ::lib.schema/filters]]]
   (if (empty? filter-clauses)
     pipeline-ctx
     (let [combined-filter-clause (if (> (count filter-clauses) 1)
                                    (apply lib/and filter-clauses)
                                    (first filter-clauses))]
       (update pipeline-ctx :query conj {$match (compile-filter query stage-number combined-filter-clause)})))))

(defmulti ^:private compile-cond
  {:arglists '([query stage-number mbql-clause])}
  (mu/fn [_query _stage-number mbql-clause :- ::lib.schema.mbql-clause/clause]
    (driver-api/dispatch-by-clause-name-or-class mbql-clause)))

(mu/defmethod compile-cond :between
  [query stage-number [_ _opts field min-val max-val] :- :mbql.clause/between]
  (compile-cond query stage-number (lib/and (lib/>= field min-val) (lib/<= field max-val))))

(defn- index-of-code-point
  "See https://docs.mongodb.com/manual/reference/operator/aggregation/indexOfCP/"
  [query stage-number source needle case-sensitive?]
  (let [source (if case-sensitive?
                 (->rvalue query stage-number source)
                 {$toLower (->rvalue query stage-number source)})
        needle (if case-sensitive?
                 (->rvalue query stage-number needle)
                 {$toLower (->rvalue query stage-number needle)})]
    {:$indexOfCP [source needle]}))

(mu/defmethod compile-cond :contains
  [query stage-number [_ opts field value] :- :mbql.clause/contains]
  {$ne [(index-of-code-point query stage-number field value (get opts :case-sensitive true)) -1]})

(mu/defmethod compile-cond :starts-with
  [query stage-number [_ opts field value] :- :mbql.clause/starts-with]
  {$eq [(index-of-code-point query stage-number field value (get opts :case-sensitive true)) 0]})

(mu/defmethod compile-cond :ends-with
  [query stage-number [_ opts field value] :- :mbql.clause/ends-with]
  (let [strcmp (fn [a b]
                 {$eq (if (get opts :case-sensitive true)
                        [a b]
                        [{$strcasecmp [a b]} 0])})]
    (strcmp {:$substrCP [(->rvalue query stage-number field)
                         {$subtract [{:$strLenCP (->rvalue query stage-number field)}
                                     {:$strLenCP (->rvalue query stage-number value)}]}
                         {:$strLenCP (->rvalue query stage-number value)}]}
            (->rvalue query stage-number value))))

(mu/defmethod compile-cond :=
  [query stage-number [_ _opts field value] :- :mbql.clause/=]
  {$eq [(->rvalue query stage-number field) (->rvalue query stage-number value)]})

(mu/defmethod compile-cond :!=
  [query stage-number [_ _opts field value] :- :mbql.clause/!=]
  {$ne [(->rvalue query stage-number field) (->rvalue query stage-number value)]})

(mu/defmethod compile-cond :<
  [query stage-number [_ _opts field value] :- :mbql.clause/<]
  {$lt [(->rvalue query stage-number field) (->rvalue query stage-number value)]})

(mu/defmethod compile-cond :>
  [query stage-number [_ _opts field value] :- :mbql.clause/>]
  {$gt [(->rvalue query stage-number field) (->rvalue query stage-number value)]})

(mu/defmethod compile-cond :<=
  [query stage-number [_ _opts field value] :- :mbql.clause/<=]
  {$lte [(->rvalue query stage-number field) (->rvalue query stage-number value)]})

(mu/defmethod compile-cond :>=
  [query stage-number [_ _opts field value] :- :mbql.clause/>=]
  {$gte [(->rvalue query stage-number field) (->rvalue query stage-number value)]})

(mu/defmethod compile-cond :and
  [query stage-number [_ _opts & args] :- :mbql.clause/and]
  {$and (mapv (partial compile-cond query stage-number) args)})

(mu/defmethod compile-cond :or
  [query stage-number [_ _opts & args] :- :mbql.clause/or]
  {$or (mapv (partial compile-cond query stage-number) args)})

(mu/defmethod compile-cond :not
  [query stage-number [_ _opts subclause] :- :mbql.clause/not]
  (compile-cond query stage-number (negate subclause)))

(mu/defmethod compile-cond :expression
  [query stage-number [_ _opts expression-name] :- :mbql.clause/expression]
  (let [expression-value (lib/resolve-expression query stage-number expression-name)]
    (compile-cond query stage-number expression-value)))

(mu/defmethod compile-cond :field
  [query stage-number field-clause :- :mbql.clause/field]
  (->rvalue query stage-number field-clause))

(mu/defmethod compile-cond :value
  [query stage-number value-clause :- :mbql.clause/value]
  (->rvalue query stage-number value-clause))

;;; ----------------------------------------------------- joins ------------------------------------------------------

(mu/defn- find-source-collection :- :string
  "Determine the source collection of a :join clause by recursively searching for a :source-table or a :collection
  clause in :source-query clauses."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   join-or-query         :- [:or
                             ::lib.schema/query
                             ::lib.schema.join/join]]
  (or (-> join-or-query :collection)
      (let [table-id (case (:lib/type join-or-query)
                       :mbql/query (lib/primary-source-table-id join-or-query)
                       ;; TODO (Cam 2026-07-13) -- need a better way to do this for joins...
                       :mbql/join  (get-in join-or-query [:stages 0 :source-table]))]
        (:name (driver-api/table metadata-providerable table-id)))))

(defn- localize-join-alias
  "Rename `:join-alias` properties in `:field` ref options to `::join-local`.

  See [[find-mapped-field-name]] for an explanation why this is done."
  [expr join-alias]
  (match/replace expr
    [:field {:join-alias (a :guard (= a join-alias))} _id-or-name]
    (lib/update-options &match set/rename-keys {:join-alias ::join-local})))

(mu/defn- get-field-mappings :- [:map-of ::lib.schema.mbql-clause/clause ::projection]
  [query        :- ::lib.schema/query
   stage-number :- :int
   projections]
  (let [stage (lib/query-stage query stage-number)]
    (zipmap (mapcat stage [:fields :breakout :aggregation])
            projections)))

(declare ^:private mbql->native-rec)

(defn- ^:deprecated append-projections
  "Projection names must be unique, for historic reasons the MongoDB driver does things like `col` and `col_2` instead
  of `col` and `Join - col`."
  [pipeline-ctx new-projections]
  (letfn [(update-projections [existing-projections]
            (let [existing-projections (vec existing-projections)
                  f                    (lib/non-truncating-unique-name-generator existing-projections)]
              (into existing-projections (map f) new-projections)))]
    (update pipeline-ctx :projections update-projections)))

(mu/defn- handle-join
  [query        :- ::lib.schema/query
   stage-number :- :int
   pipeline-ctx
   {join-alias :alias, :keys [conditions stages strategy], :as join}]
  (let [join-query (assoc query :stages stages)
        {:keys [projections], pipeline :query, :or {projections [], pipeline []}} (mbql->native-rec join-query)
        ;; Get the mappings introduced by the source query.
        source-field-mappings (get-field-mappings query stage-number projections)
        ;; Find the fields the join condition refers to that are not coming from the joined query.
        ;; These have to be bound in the :let property of the $lookup stage, they cannot be referred to directly.
        own-fields (match/match-many conditions
                     [:field (opts :guard (not= (:join-alias opts) join-alias)) _id-or-name] &match)
        ;; Map the own fields to a fresh alias and to its rvalue.
        mapping (map (fn [f] (let [alias (-> (format "let_%s_" (->lvalue query stage-number f))
                                             ;; Mongo `$lookup` let variable names allow ASCII letters, digits,
                                             ;; underscores, and non-ASCII characters; any other ASCII character
                                             ;; (e.g. `~`, `.`, space, `-`, `:`) trips a parser error. Match only
                                             ;; disallowed ASCII characters so non-ASCII chars in source names are
                                             ;; preserved (#32182, #52807, #76722).
                                             (str/replace #"[\p{ASCII}&&[^A-Za-z0-9_]]" "_")
                                             (str "__" (next-alias-index)))]
                               {:field f, :rvalue (->rvalue query stage-number f), :alias alias}))
                     own-fields)]
    ;; Add the mappings from the source query and the let bindings of $lookup to the field mappings.
    ;; In the join pipeline the let bindings have to referenced with the prefix $$, so we add $ to the name.
    (binding [*field-mappings* (merge *field-mappings*
                                      source-field-mappings
                                      (into {} (map (juxt :field #(str \$ (:alias %)))) mapping))]
      (let [filters   (localize-join-alias conditions join-alias)
            pipeline  (-> (handle-filters query -1 {:query pipeline} filters)
                          :query)
            lookup-as (get-join-alias join-alias)
            stages    [{$lookup {:from     (find-source-collection query join)
                                 :let      (into {} (map (juxt :alias :rvalue)) mapping)
                                 :pipeline pipeline
                                 :as       lookup-as}}
                       {$unwind {:path (str \$ lookup-as)
                                 ;; left and inner joins are supported, the default is left join
                                 :preserveNullAndEmptyArrays (not= strategy :inner-join)}}]]
        (-> pipeline-ctx
            (append-projections projections)
            (update :query into stages))))))

(mu/defn- handle-joins :- ::compiled-pipeline
  [query        :- ::lib.schema/query
   stage-number :- :int
   pipeline-ctx :- ::compiled-pipeline]
  (reduce (partial handle-join query stage-number)
          pipeline-ctx
          (lib/joins query stage-number)))

;;; -------------------------------------------------- aggregation ---------------------------------------------------

(def ^:private aggregation-op
  "The set of operators handled by [[aggregation->rvalue]] and [[expand-aggregation]]."
  #{:avg :count :count-where :distinct :max :min :share :stddev :sum :sum-where :var :cum-sum :cum-count})

(mu/defmethod ->rvalue :case
  [query stage-number [_ _opts cases default-value] :- :mbql.clause/case]
  {:$switch {:branches (vec (for [[pred expr] cases]
                              {:case (compile-cond query stage-number pred)
                               :then (->rvalue query stage-number expr)}))
             :default  (->rvalue query stage-number default-value)}})

(mu/defn- aggregation->rvalue
  [query        :- ::lib.schema/query
   stage-number :- :int
   ag           :- ::lib.schema.mbql-clause/clause]
  (match/match-one ag
    [:count _opts]
    {$sum 1}

    [:count _opts arg]
    {$sum {$cond {:if   (->rvalue query stage-number arg)
                  :then 1
                  :else 0}}}

    ;; these aggregation types can all be used in expressions as well so their implementations live above in the
    ;; general [[->rvalue]] implementations
    [#{:avg :stddev :sum :min :max} & _]
    (->rvalue query stage-number &match)

    [:distinct _opts arg]
    {$addToSet (->rvalue query stage-number arg)}

    [:sum-where _opts arg pred]
    {$sum {$cond {:if   (compile-cond query stage-number pred)
                  :then (->rvalue query stage-number arg)
                  :else 0}}}

    [:count-where _opts pred]
    (&recur (lib/sum-where (lib/value {:effective-type :type/Integer} 1) pred))

    _
    (throw
     (ex-info (tru "Don''t know how to handle aggregation {0}" ag)
              {:type :invalid-query, :clause ag}))))

(defn- field-alias
  [query stage-number [_tag opts _id-or-name, :as field-ref]]
  (or (driver-api/qp.add.desired-alias opts)
      (->lvalue query stage-number field-ref)))

(mu/defn- breakouts-and-ags->projected-fields :- [:maybe
                                                  [:and
                                                   [:sequential [:tuple ::lib.schema.common/non-blank-string :any]]
                                                   [:fn
                                                    {:error/message "projected fields should have distinct names"}
                                                    (fn [projected-fields]
                                                      (apply distinct? (map first projected-fields)))]]]
  "Determine field projections for MBQL breakouts and aggregations. Returns a sequence of pairs like
  `[projected-field-name source]`."
  [query stage-number]
  (let [breakouts    (lib/breakouts query stage-number)
        aggregations (lib/aggregations query stage-number)]
    (concat
     (for [field-or-expr breakouts]
       [(field-alias query stage-number field-or-expr) (format "$_id.%s" (field-alias query stage-number field-or-expr))])
     (for [ag-ref aggregations
           :let   [ag-name (driver-api/mbql-5-aggregation-name query stage-number ag-ref)]]
       [ag-name true]))))

(defmulti ^:private expand-aggregation
  "Expand aggregations like `:share` and `:var` that can't be done as top-level aggregations in the `$group` stage
  alone. See [[group-and-post-aggregations]] for more info. See also
  https://www.mongodb.com/docs/manual/reference/operator/aggregation/group/#accumulator-operator for a list of what
  aggregation operators are allowed inside `$group` (vs the ones that have to be done in a later stage)."
  {:arglists '([query stage-number mbql-clause])}
  (mu/fn [_query        :- ::lib.schema/query
          _stage-number :- :int
          mbql-clause   :- ::lib.schema.mbql-clause/clause]
    (driver-api/dispatch-by-clause-name-or-class mbql-clause)))

;;; Note that this code doesn't handle expression aggregations, but that's ok because we do not support
;;; `:expression-aggregations` for Mongo DB.
(mr/def ::expand-aggregation.lhs-column-name
  :string)

(mr/def ::expanded-aggregation.rhs-definition
  :any)

(mr/def ::expanded-aggregation.lhs->rhs
  [:map-of
   ::expand-aggregation.lhs-column-name
   ::expanded-aggregation.rhs-definition])

(mr/def ::expanded-aggregation
  [:map
   {:closed true}
   [:group {:description "A map containing the groups of aggregation expression. Done in the `$group` stage."}
    ::expanded-aggregation.lhs->rhs]
   [:post {:optional    true
           :description (str "a vector of maps containing the expressions referring to the fields generated by the"
                             " groups. Each map in the `:post` vector may (and usually does) refer to the fields"
                             " introduced by the preceding maps. Done in the `$addFields` stage immediately following"
                             " the `$group` stage.")}
    [:sequential ::expanded-aggregation.lhs->rhs]]
   ;; TODO (Cam 2026-07-16) document this! William added window function support to MongoDB but didn't document this
   ;; stuff.
   [:window {:optional true}
    ::expanded-aggregation.lhs->rhs]])

(mu/defmethod expand-aggregation :share :- ::expanded-aggregation
  [query stage-number [_ _opts pred :as ag] :- :mbql.clause/share]
  (let [count-where-expr (name (gensym "$count-where-"))
        count-expr       (name (gensym "$count-"))
        pred             (if (= (first pred) :share)
                           (second pred)
                           pred)]
    {:group {(subs count-where-expr 1) (aggregation->rvalue query stage-number (lib/count-where pred))
             (subs count-expr 1)       (aggregation->rvalue query stage-number (lib/count))}
     :post  [{(driver-api/mbql-5-aggregation-name query stage-number ag) {$divide [count-where-expr count-expr]}}]}))

;; MongoDB doesn't have a variance operator, but you calculate it by taking the square of the standard deviation.
;; However, `$pow` is not allowed in the `$group` stage. So calculate standard deviation in the
(mu/defmethod expand-aggregation :var :- ::expanded-aggregation
  [query stage-number ag :- :mbql.clause/var]
  (let [stddev-expr (name (gensym "$stddev-"))]
    {:group {(subs stddev-expr 1) (aggregation->rvalue query stage-number (lib/stddev ag))}
     :post  [{(driver-api/mbql-5-aggregation-name query stage-number ag) {:$pow [stddev-expr 2]}}]}))

(mu/defmethod expand-aggregation :cum-sum :- ::expanded-aggregation
  [query stage-number ag :- :mbql.clause/cum-sum]
  (let [sum-expr (name (gensym "$sum-"))]
    {:group {(subs sum-expr 1) (aggregation->rvalue query stage-number (lib/sum ag))}
     :window {(driver-api/mbql-5-aggregation-name query stage-number ag) sum-expr}}))

(mu/defmethod expand-aggregation :cum-count :- ::expanded-aggregation
  [query stage-number ag :- :mbql.clause/cum-count]
  (let [count-expr (name (gensym "$count-"))]
    {:group {(subs count-expr 1) (aggregation->rvalue query stage-number (lib/count))}
     :window {(driver-api/mbql-5-aggregation-name query stage-number ag) count-expr}}))

(mu/defmethod expand-aggregation :default :- ::expanded-aggregation
  [query stage-number ag :- ::lib.schema.mbql-clause/clause]
  {:group {(driver-api/mbql-5-aggregation-name query stage-number ag) (aggregation->rvalue query stage-number ag)}})

(defn- extract-aggregations
  "Extract aggregation expressions embedded in `aggr-expr` using `parent-name`
  as a namespace for the names introduced for the aggregation expressions.
  The function returns a pair with the first element an expression like
  `aggr-expr` with aggregations replaced by new names. The second element of
  the pair is a map from the extracted aggregations to the new names conjoined
  on `aggregations-seen`.

  For example, given \"expression\" as `parent-name`, the expression

    [:+ {:name \"expression\"}
     [:count {} [:field {} 1144]]
     [:* {}
      [:count {} [:field {} 1144]]
      [:sum {}
       [:+ {}
        [:field {} 1142]
        1]]]]

  is mapped to

    [[:+ \"$expression~count\" [:* \"$expression~count\" \"$expression~sum\"]]
     {[:count [:field 1144]]      \"expression~count\"
      [:sum [:+ [:field 1142] 1]] \"expression~sum\"}]"
  ([query stage-number aggr-expr parent-name]
   (extract-aggregations query stage-number aggr-expr parent-name {}))
  ([query stage-number aggr-expr parent-name aggregations-seen]
   (if (and (vector? aggr-expr) (seq aggr-expr))
     (let [[op opts & args] aggr-expr
           seen              (get aggregations-seen aggr-expr)]
       (cond
         seen
         [(str \$ seen) aggregations-seen]

         (aggregation-op op)
         (let [aliases-taken (set (vals aggregations-seen))
               aggr-name     (driver-api/mbql-5-aggregation-name query stage-number aggr-expr)
               desired-alias (str parent-name "~" aggr-name)
               ;; find a free alias by appending increasing integers
               ;; to the desired alias
               aggr-name     (some (fn [suffix]
                                     (let [alias (str desired-alias suffix)]
                                       (when-not (aliases-taken alias)
                                         alias)))
                                   (cons "" (iterate inc 1)))]
           [(str \$ aggr-name) (assoc aggregations-seen aggr-expr aggr-name)])

         :else
         (reduce (fn [[partial-clause ags-seen] arg] ; codespell:ignore
                   (let [[extracted-arg ags-seen'] (extract-aggregations
                                                    query
                                                    stage-number
                                                    arg
                                                    parent-name
                                                    ags-seen)]
                     [(conj partial-clause extracted-arg) ags-seen'])) ; codespell:ignore
                 [[op opts] aggregations-seen]
                 args)))
     [aggr-expr aggregations-seen])))

(defn- simplify-extracted-aggregations
  "Simplifies the extracted aggregation for `aggr-name` if the expression
  contains only a single top-level aggregation. In this case there is no
  need for namespacing and `ag-name` can be used as the name of the group
  introduced for the aggregation.
  `extracted-aggr` is typically the result of [[extract-aggregations]]."
  [ag-name [extracted-ag-name aggregations-seen :as extracted-aggr]]
  (if-let [aggr-group (and (string? extracted-ag-name)
                           (str/starts-with? extracted-ag-name (str \$ ag-name "~"))
                           (= (count aggregations-seen) 1)
                           (let [[seen-ag-expr seen-ag-name] (first aggregations-seen)]
                             (when (= seen-ag-name (subs extracted-ag-name 1)) ; remove prefix '$'
                               seen-ag-expr)))]
    [(str \$ ag-name) {aggr-group ag-name}]
    extracted-aggr))

(mu/defn- adjust-distinct-aggregations :- [:tuple
                                           ;; if this returns a vector, it must be an MBQL clause.
                                           [:multi {:dispatch vector?}
                                            [true  ::lib.schema.mbql-clause/clause]
                                            [false :any]]
                                           :any]
  "This function transforms `aggr-expr'` as in [[expand-aggregations]] so identifiers representing array that is
  a set of _distinct_ values are wrapped in `{$size...}.

  `aggr-expr` is expected to be a clause that is a result of [[extract-aggregations]]. For details see its docstring.

  Distinct values are computed using the `$addToSet` in a `$group` stage. `$size` transforms them to actual count."
  [[aggr-expr mappings :as x] :- [:tuple
                                  #_aggr-expr
                                  [:or
                                   [:ref ::lib.schema.mbql-clause/clause]
                                   :string] ; Mongo expr
                                  #_mappings
                                  [:map-of
                                   #_ag-clause [:or
                                                [:ref ::lib.schema.mbql-clause/clause]
                                                :string]
                                   #_name      :string]]]
  (let [distinct-keys (filter (fn [[tag, :as _ag-clause]] (= :distinct tag)) (keys mappings))
        distinct-vals (into #{}
                            (comp (map #(get mappings %))
                                  ;; \$ is added to identifiers so eg. `q~count1` becomes `$q~count1`. Those values
                                  ;; are used match against `aggr-expr` where identifiers have the prefix.
                                  (map #(str \$ %)))
                            distinct-keys)]
    [(perf/postwalk (fn [x]
                      (if (and (string? x)
                               (distinct-vals x))
                        [::size {:lib/uuid (str (random-uuid))} x]
                        x))
                    aggr-expr)
     mappings]))

(mu/defn- expand-aggregations :- ::expanded-aggregation
  "Expands the aggregations in `aggr-expr` into groupings and post processing
  expressions."
  [query        :- ::lib.schema/query
   stage-number :- :int
   aggr-expr    :- ::lib.schema.mbql-clause/clause]
  (let [aggr-name                      (driver-api/mbql-5-aggregation-name query stage-number aggr-expr)
        [aggr-expr' aggregations-seen] (->> (extract-aggregations query stage-number aggr-expr aggr-name)
                                            (simplify-extracted-aggregations aggr-name)
                                            adjust-distinct-aggregations)
        aggr-expr-rvalue               (->rvalue query stage-number aggr-expr')
        expandeds                      (map (fn [[ag-clause ag-name]]
                                              (expand-aggregation query stage-number
                                                                  (lib/update-options ag-clause assoc :name ag-name)))
                                            aggregations-seen)]
    {:group  (into {} (map :group) expandeds)
     :post   (cond-> [(into {} (mapcat :post) expandeds)]
               (not= aggr-expr-rvalue (str \$ aggr-name)) (conj {aggr-name aggr-expr-rvalue}))
     :window (into {} (map :window) expandeds)}))

(defn- order-postprocessing
  "Takes a sequence of post processing vectors (see [[expand-aggregations]]) and
  returns a sequence with the maps at the same index merged.
  This is an optimization to reduce the number of stages in the pipeline and
  assumes that
    a) maps can only depend on maps preceding them in their own vector and
    b) the keys in the maps at the same level are unique."
  [posts]
  (when (seq posts)
    (for [i (range (apply max (map count posts)))]
      (into {} (map #(get % i)) posts))))

(mu/defn- order-by->$sort :- [:map-of ::lib.schema.common/non-blank-string [:enum -1 1]]
  [query stage-number]
  (into
   (ordered-map/ordered-map)
   (map (fn [[direction _opts field]]
          [(->lvalue query stage-number field) (case direction
                                                 :asc   1
                                                 :desc -1)]))
   (lib/order-bys query stage-number)))

(defn- window-output-clause
  "Takes a pair of [output-name input-name] and generates an output clause suitable for
  including in a `$setWindowFields` output block."
  [input-name]
  {$sum input-name
   "window" {"documents" ["unbounded" "current"]}})

(defn- sort-lookup
  "Generates a lookup string for a particular field"
  [id name]
  (if (id name)
    (str "_id." name)
    name))

(defn- window-sort
  "Converts a `$sort` body to something that can be used in a `sortBy` clause in a
  `$setWindowFields` stage."
  [id pairs]
  (when-let [pair-seq (seq pairs)]
    (into (ordered-map/ordered-map)
          (map (fn [[name dir]] [(sort-lookup id name) dir]))
          pair-seq)))

(defn- window-sort-and-partitions
  "Calculates the appropriate sort and partition fields for a `$setWindowFields` stage."
  [query stage-number id]
  (let [breakouts             (lib/breakouts query stage-number)
        finest-temporal-index (driver-api/finest-temporal-breakout-index breakouts 2)
        order-bys             (lib/order-bys query stage-number)
        sort-index            (or finest-temporal-index
                                  (dec (count breakouts)))
        sort-name             (first (nth (seq id) sort-index))
        default-sort          {(sort-lookup id sort-name) 1}
        user-sort             (when order-bys
                                (binding [*field-mappings*
                                          (merge *field-mappings*
                                                 (into {} (map (juxt identity field-alias)) breakouts))]
                                  (order-by->$sort query stage-number)))
        sort-expr             (or
                               ;; if there is only one breakout, always use the user's sort order
                               (when (= (count id) 1)
                                 (window-sort id user-sort))
                               ;; if we don't have a temporal breakout, sort by the last breakout, but
                               ;; use the user's sort direction if specified
                               (when-not finest-temporal-index
                                 (->> user-sort
                                      (filter #(= sort-name (first %)))
                                      (window-sort id)))
                               default-sort)

        partition-expr (into {}
                             (map (fn [[name]] [name (str "$_id." name)]))
                             (m/remove-nth sort-index id))]
    {:sort-expr      sort-expr
     :partition-expr partition-expr}))

(defn- window-accumulators
  "Takes a map of {output-name input-name ...} and generates a `$setWindowFields` stage that
  produces a cumulative sum of those fields."
  [query stage-number window-vals id]
  ;; if id is empty, we don't have any breakouts and so don't need to fiddle around with $setWindowFields
  (if (empty? id)
    [{$addFields window-vals}]
    (let [{:keys [sort-expr partition-expr]} (window-sort-and-partitions query stage-number id)]
      [{$setWindowFields
        (cond-> {"sortBy" sort-expr
                 "output" (update-vals window-vals window-output-clause)}
          (seq partition-expr) (assoc "partitionBy" partition-expr))}])))

(defn- group-and-post-aggregations
  "Mongo is picky about which top-level aggregations it allows with groups. Eg. even
   though [:/ [:count-if ...] [:count]] is a perfectly fine reduction, it's not allowed. Therefore
   more complex aggregations are split in two: the reductions are done in `$group` stage after which
   we do postprocessing in `$addFields` stage to arrive at the final result.
   The groups are assumed to be independent an collapsed into a single stage, but separate
   `$addFields` stages are created for post processing so that stages can refer to the results
   of preceding stages.
   The intermittent results accrued in `$group` stage are discarded in the final `$project` stage.
   Meanwhile, cumulative aggregations cannot be done in either a `$group` or a `$addFields` stage
   and instead need their own `$setWindowFields` stage."
  [query stage-number id]
  (let [breakouts     (lib/breakouts query stage-number)
        aggregations  (lib/aggregations query stage-number)
        order-bys     (lib/order-bys query stage-number)
        expanded-ags  (map (partial expand-aggregations query stage-number) aggregations)
        group-ags     (mapcat :group expanded-ags)
        post-ags      (order-postprocessing (map :post expanded-ags))
        window-values (into {} (map :window) expanded-ags)]
    (into [{$group (into (ordered-map/ordered-map "_id" id) group-ags)}]
          cat
          [(when (seq window-values)
             (window-accumulators window-values id breakouts order-bys))
           (keep (fn [p] (when (seq p) {$addFields p}))
                 post-ags)])))

(defn- projection-group-map [query stage-number]
  (reduce
   (fn [m breakout]
     (assoc-in
      m
      (match/match-one breakout
        [:field _opts (id :guard (or (integer? id) (string? id)))]
        (str/split (field-alias query stage-number breakout) #"\.")

        [:expression _opts expr-name]
        [expr-name])
      (->rvalue query stage-number breakout)))
   (ordered-map/ordered-map)
   (lib/breakouts query stage-number)))

(defn- breakouts-and-ags->pipeline-stages
  "Return a sequeunce of aggregation pipeline stages needed to implement MBQL breakouts and aggregations."
  [query stage-number projected-fields]
  (mapcat
   (partial remove nil?)
   [ ;; create the $group clause
    (group-and-post-aggregations
     query
     stage-number
     (when (seq (lib/breakouts query stage-number))
       (projection-group-map query stage-number)))
    [ ;; Sort by _id (group)
     {$sort {"_id" 1}}
     ;; now project back to the fields we expect
     {$project (into
                (ordered-map/ordered-map "_id" false)
                projected-fields)}]]))

(mu/defn- handle-breakout+aggregation :- ::compiled-pipeline
  "Add projections, groupings, sortings, and other things needed to the Query pipeline context (`pipeline-ctx`) for
  MBQL `aggregations` and `breakout-fields`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   pipeline-ctx :- ::compiled-pipeline]
  (if-not (or (seq (lib/breakouts query stage-number))
              (seq (lib/aggregations query stage-number)))
    ;; if both aggregations and breakouts are empty, there's nothing to do...
    pipeline-ctx
    ;; determine the projections we'll need. projected-fields is like [[projected-field-name source]]`
    (let [projected-fields (breakouts-and-ags->projected-fields query stage-number)
          pipeline-stages  (breakouts-and-ags->pipeline-stages query stage-number projected-fields)]
      (-> pipeline-ctx
          ;; add :projections key which is just a sequence of the names of projections from above
          (assoc :projections (mapv first projected-fields))
          ;; now add additional clauses to the end of :query as applicable
          (update :query into pipeline-stages)))))

;;; ---------------------------------------------------- order-by ----------------------------------------------------

(defn- field-id->path
  "Return the full document-path components for `field-id` as a vector of strings. Uses [[col->name-components]],
  which prefers `:nfc-path` and falls back to walking `:parent-id` for fields synced before `:nfc-path` was populated."
  [metadata-providerable field-id]
  (vec (col->name-components metadata-providerable (driver-api/field metadata-providerable field-id))))

(mu/defn- field-clauses->id->path :- [:map-of
                                      [:or ::lib.schema.id/field :string]
                                      [:sequential :string]]
  "Build a map of `field-id-or-name -> path-vector` for all `:field` clauses in `clauses`. Integer IDs are
  resolved via the metadata provider; for string refs (e.g. from a wrapper stage), the path is derived from
  the opts `:source-alias` populated by `add-alias-info` (and path-prepended by [[HACK-update-aliases]] for
  nested fields), falling back to `id-or-name` when no source-alias is present. The path-joined string is
  split on the Mongo path delimiter."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   clauses               :- [:sequential ::lib.schema.mbql-clause/clause]]
  (into {}
        (keep (fn [[tag opts id-or-name]]
                (when (= tag :field)
                  (cond
                    (pos-int? id-or-name)
                    [id-or-name (field-id->path metadata-providerable id-or-name)]

                    (string? id-or-name)
                    [id-or-name (raw-path->components
                                 (get opts driver-api/qp.add.source-alias id-or-name))]))))
        clauses))

(mu/defn- remove-parent-fields :- [:sequential ::lib.schema.mbql-clause/clause]
  "Removes any and all entries in `clauses` that are parents of another `:field` in `clauses` This is necessary because
  as of MongoDB 4.4, including both will result in an error (see:
  `https://www.mongodb.com/docs/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields`).

  Removing parents is useful when sorting, because leaf fields sort."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   clauses               :- [:sequential ::lib.schema.mbql-clause/clause]]
  (let [id->path     (field-clauses->id->path metadata-providerable clauses)
        parent-paths (into #{}
                           (keep (fn [path]
                                   (when (> (count path) 1)
                                     (vec (butlast path)))))
                           (vals id->path))]
    (remove (fn [[tag _opts id-or-name]]
              (and (= tag :field)
                   (contains? parent-paths (id->path id-or-name))))
            clauses)))

(mu/defn- remove-child-fields :- [:sequential ::lib.schema.mbql-clause/clause]
  "Removes any and all entries in `clauses` that are children of another `:field` in `clauses`. This is necessary
  because as of MongoDB 4.4, including both will result in an error (see:
  `https://www.mongodb.com/docs/manual/reference/operator/aggregation/project/#path-collision-errors-in-embedded-fields`).

  Removing children is useful when projecting, because the return value of a mongo query is json, and so a parent
  includes all of its children."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   clauses               :- [:sequential ::lib.schema.mbql-clause/clause]]
  (let [id->path  (field-clauses->id->path metadata-providerable clauses)
        all-paths (set (vals id->path))]
    (remove (fn [[tag _opts id-or-name :as _clause]]
              (when (= tag :field)
                (let [path (id->path id-or-name)]
                  (and path
                       (> (count path) 1)
                       (contains? all-paths (vec (butlast path)))))))
            clauses)))

(mu/defn- handle-order-by :- ::compiled-pipeline
  [query        :- ::lib.schema/query
   stage-number :- :int
   pipeline-ctx :- ::compiled-pipeline]
  (let [order-bys               (lib/order-bys query stage-number)
        breakouts               (lib/breakouts query stage-number)
        aggregations            (lib/aggregations query stage-number)
        breakout-fields         (set breakouts)
        sort-fields             (for [field (remove-parent-fields query (map last order-bys))
                                      ;; We only care about expressions and bucketing not added as breakout
                                      :when (and (not (some #(lib.equality/= % field)
                                                            breakout-fields))
                                                 (let [dispatch-value (driver-api/dispatch-by-clause-name-or-class field)]
                                                   (or (= :expression dispatch-value)
                                                       (and (= :field dispatch-value)
                                                            (let [[_tag {:keys [temporal-unit], :as _opts} _id-or-name] field]
                                                              (and (some? temporal-unit)
                                                                   (not= temporal-unit :default)))))))]
                                  [(->lvalue query stage-number field) (->rvalue query stage-number field)])
        ;; We have already compiled breakout fields into the document.
        breakout-field-mappings (into {}
                                      (map (juxt identity (partial field-alias query stage-number)))
                                      breakouts)
        ;; We have already sorted ascending by the breakout fields so we don't have to repeat the
        ;; same sort.
        explicit-order-by
        (when (and (seq order-bys)
                   (not (lib.equality/= order-bys
                                        (map #(lib/order-by-clause % :asc) breakouts))))
          (binding [*field-mappings* (merge *field-mappings* breakout-field-mappings)]
            (order-by->$sort query stage-number)))

        cumulative-order-by
        (when-let [finest-temporal-index
                   (and (seq (filter (fn [[agg-type :as _ag-clause]] (#{:cum-sum :cum-count} agg-type))
                                     aggregations))
                        (driver-api/finest-temporal-breakout-index breakouts 2))]
          (let [id (projection-group-map query stage-number)]
            (as-> (keys id) lst
              (m/remove-nth finest-temporal-index lst)
              (concat lst [(nth (keys id) finest-temporal-index)])
              (filter (fn [key] (not (and explicit-order-by
                                          (explicit-order-by key)))) lst)
              (map (fn [name] [name 1]) lst))))

        combined-order-by
        (when (or explicit-order-by cumulative-order-by)
          {$sort (into (ordered-map/ordered-map)
                       (concat explicit-order-by cumulative-order-by))})]
    (cond-> pipeline-ctx
      (seq sort-fields) (update :query conj
                                ;; We $addFields before sorting, otherwise expressions will not be available for the
                                ;; sort
                                {$addFields (into (ordered-map/ordered-map) sort-fields)})
      combined-order-by (update :query #(conj % combined-order-by)))))

;;; ----------------------------------------------------- fields -----------------------------------------------------

(mu/defn- handle-fields :- ::compiled-pipeline
  [query        :- ::lib.schema/query
   stage-number :- :int
   pipeline-ctx :- ::compiled-pipeline]
  (let [fields (lib/fields query stage-number)]
    (if (empty? fields)
      pipeline-ctx
      (let [new-projections (for [field (remove-child-fields query fields)]
                              [(field-alias query stage-number field) (->rvalue query stage-number field)])]
        (-> pipeline-ctx
            ;; we can't ask mongo for both a parent field and its child at the same time, because mongo will throw an
            ;; error. It's also unnecessary, because the parent includes the child. However, we need to list all fields
            ;; we think we want in :projections so that we know to look for them all once we get data back.
            (assoc :projections (mapv (partial field-alias query stage-number) fields))
            ;; add project _id = false to keep _id from getting automatically returned unless explicitly specified
            (update :query conj {$project (into
                                           (ordered-map/ordered-map "_id" false)
                                           new-projections)}))))))

;;; ----------------------------------------------------- limit ------------------------------------------------------

(mu/defn- handle-limit :- ::compiled-pipeline
  [query        :- ::lib.schema/query
   stage-number :- :int
   pipeline-ctx :- ::compiled-pipeline]
  (let [limit (lib/current-limit query stage-number)]
    (if-not limit
      pipeline-ctx
      (update pipeline-ctx :query conj {$limit limit}))))

;;; ------------------------------------------------------ page ------------------------------------------------------

(mu/defn- handle-page :- ::compiled-pipeline
  [query        :- ::lib.schema/query
   stage-number :- :int
   pipeline-ctx :- ::compiled-pipeline]
  (let [{page-num :page, items-per-page :items, :as page-clause} (lib/current-page query stage-number)]
    (if-not page-clause
      pipeline-ctx
      (update pipeline-ctx :query concat (filter some? [(let [offset (* items-per-page (dec page-num))]
                                                          (when-not (zero? offset)
                                                            {$skip offset}))
                                                        {$limit items-per-page}])))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Process & Run                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- add-aggregation-pipeline :- ::compiled-pipeline
  "Generate the aggregation pipeline. Returns a sequence of maps representing each stage."
  ([query stage-number]
   (add-aggregation-pipeline query stage-number {:projections [], :query []}))
  ([query        :- ::lib.schema/query
    stage-number :- :int
    pipeline-ctx :- ::compiled-pipeline]
   (reduce (mu/fn :- ::compiled-pipeline
             [pipeline-ctx :- ::compiled-pipeline
              f            :- ifn?]
             (f query stage-number pipeline-ctx))
           pipeline-ctx
           [#'handle-joins
            #'handle-filters
            #'handle-breakout+aggregation
            #'handle-order-by
            #'handle-fields
            #'handle-limit
            #'handle-page])))

(mu/defn- query->collection-name :- [:maybe :string]
  "Return `:collection` from a source query, if it exists."
  [query :- ::lib.schema/query]
  (some #(:collection (lib/query-stage query %))
        (range 0 (lib/stage-count query))))

(defn- log-aggregation-pipeline [form]
  (when-not driver-api/*disable-qp-logging*
    (log/tracef "\nMongo aggregation pipeline:\n%s\n"
                (u/pprint-to-str 'green (perf/postwalk #(if (symbol? %) (symbol (name %)) %) form)))))

(mu/defn parse-query-string :- ::pipeline
  "Parse a serialized native query. Like a normal JSON parse, but handles BSON/MongoDB extended JSON forms."
  [^String s :- :string]
  (let [query (try
                ;; Only way to parse _ejson array_ using bson library is through `BsonArray/parse`. That results in
                ;; sequence of `org.bson.BsonDocument`s. Currently `org.bson.Document` fits our needs better as it (1)
                ;; implements `Map` and (2) converts `BsonValue`s to java types.
                (mapv (fn [^org.bson.BsonValue v]
                        (-> v .asDocument .toJson org.bson.Document/parse))
                      (org.bson.BsonArray/parse s))
                (catch Throwable e
                  (throw (ex-info (tru "Unable to parse query: {0}" (.getMessage e))
                                  {:type  driver-api/qp.error-type.invalid-query
                                   :query s}
                                  e))))]
    query
    #_(u/prog1 (perf/postwalk
                (letfn [(bson-map->clj [m]
                          (into (ordered-map/ordered-map) m))
                        (bson-map? [x]
                          (and (instance? java.util.Map x)
                               (not (map? x))))]
                  (fn [x]
                    (cond-> x
                      (bson-map? x) bson-map->clj)))
                query)
        (def %query <>))))

(mu/defn- mbql->native-rec :- ::compiled-pipeline
  "Compile an MBQL 5 query."
  [query :- ::lib.schema/query]
  (transduce
   (map (mu/fn [stage-number :- :int]
          (let [compiled       (if (lib/native-stage? query stage-number)
                                 (let [raw-native-query (lib/raw-native-query query)
                                       native-query-map (if (map? raw-native-query)
                                                          raw-native-query
                                                          {:query       raw-native-query
                                                           :projections []})]
                                   (update native-query-map :query (fn [query]
                                                                     (cond-> query
                                                                       (string? query) parse-query-string))))
                                 {:query [], :projections []})
                field-mappings (get-field-mappings query stage-number (:projections compiled))]
            (binding [*field-mappings* field-mappings]
              (merge compiled (add-aggregation-pipeline query stage-number compiled))))))
   (completing
    (mu/fn :- ::compiled-pipeline
      [acc :- ::compiled-pipeline compiled-stage :- ::compiled-pipeline]
      (-> acc
          (update :query into (:query compiled-stage))
          (assoc :projections (:projections compiled-stage [])))))
   {:query [], :projections []}
   (range (lib/stage-count query))))

;;; TODO (Cam 6/20/25) -- MongoDB QP code is completely broken and does not consistently look at the keys added
;;; by [[driver-api/add-alias-info]]. Fixing all the busted code above is more work than I want to take on right now, so
;;; until we get around to fixing that let's just walk the query and replace all the non-add-alias-info keys with the
;;; values added by add-alias-info.
(defn- HACK-update-aliases [form]
  (letfn [(prepend-nfc-path [{nfc-path      driver-api/qp.add.nfc-path,
                              source-alias  driver-api/qp.add.source-alias
                              desired-alias driver-api/qp.add.desired-alias
                              :as           opts}]
            (when (seq nfc-path)
              (let [nfc-path-str (str/join \. nfc-path)]
                (-> opts
                    (assoc driver-api/qp.add.source-alias  (str nfc-path-str \. source-alias)
                           driver-api/qp.add.desired-alias (str nfc-path-str \. desired-alias))
                    (dissoc driver-api/qp.add.nfc-path)))))
          (update-name [{field-name :name, source-alias driver-api/qp.add.source-alias, :as opts}]
            (when (and source-alias
                       (not= field-name source-alias))
              (assoc opts :name source-alias)))
          (remove-bad-join-alias [{:keys [join-alias], source-table driver-api/qp.add.source-table, :as opts}]
            (when (and join-alias
                       (= source-table driver-api/qp.add.source))
              (dissoc opts :join-alias)))
          (update-join-alias [{:keys [join-alias], source-table driver-api/qp.add.source-table, :as opts}]
            (when (and join-alias
                       source-table
                       (not= join-alias source-table))
              (assoc opts :join-alias source-table)))
          (update-opts [opts]
            (reduce
             (fn
               [opts f]
               (or (f opts)
                   opts))
             opts
             [prepend-nfc-path
              update-join-alias
              update-name
              remove-bad-join-alias
              update-join-alias]))
          (update-field-ref [[_tag {source-alias driver-api/qp.add.source-alias, :as _opts} id-or-name, :as field-ref]]
            (let [field-ref' (lib/update-options field-ref update-opts)]
              (cond-> field-ref'
                (and (string? id-or-name)
                     source-alias)
                (assoc 2 source-alias))))]
    (match/replace form
      [:field & _]
      (update-field-ref &match)

      (:and join
            {:lib/type               :mbql/join
             driver-api/qp.add.alias (add-alias :guard (and add-alias (not= add-alias (:alias join))))})
      (&recur (-> join
                  (assoc :alias add-alias)
                  (m/update-existing :fields (fn [fields]
                                               (mapv (fn [field]
                                                       (lib/with-join-alias field add-alias))
                                                     fields))))))))

(mu/defn- preprocess :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (-> query
      (driver-api/add-alias-info {:globally-unique-join-aliases? true}) ; NOCOMMIT
      HACK-update-aliases))

(mr/def ::compiled
  [:merge
   :metabase.query-processor.compile/compiled
   [:map
    [:collection  :string]
    [:projections {:optional true} ::projections]
    [:mbql?       {:optional true} :boolean]]])

(mu/defn mbql->native :- ::compiled
  "Compile an MBQL query."
  [query :- ::lib.schema/query]
  (let [query (preprocess query)]
    (binding [*next-alias-index* (volatile! 0)]
      (let [source-table-name (if-let [source-table-id (lib/primary-source-table-id query)]
                                (:name (driver-api/table query source-table-id))
                                (query->collection-name query))
            compiled (mbql->native-rec query)]
        (log-aggregation-pipeline (:query compiled))
        (assoc compiled
               :collection (or source-table-name (:collection compiled))
               :mbql?       true)))))
