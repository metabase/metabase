(ns metabase.models.interface
  "Stuff useful to ALL models.

    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    !!!                                                                                             !!!
    !!! PLEASE DON'T ADD NEW TRANSFORMS HERE, GO PUT THEM IN RELEVANT MODULES THAT USE THEM INSTEAD !!!
    !!!                                                                                             !!!
    !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.memoize :as memoize]
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.app-db.core :as mdb]
   [metabase.events.batch :as events.batch]
   ;; Toucan out-transforms normalize stored legacy MBQL on read; needed until the app db is MBQL 5
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   ;; stored card queries/refs are still legacy MBQL; validated against the legacy schema on read/write
   [metabase.lib.core :as lib]
   [metabase.models.db :as models.db]
   [metabase.models.dispatch :as models.dispatch]
   [metabase.models.resolution]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.protocols :as t2.protocols]
   [toucan2.realize :as t2.realize]
   [toucan2.tools.after :as t2.after]
   [toucan2.tools.before-insert :as t2.before-insert]
   [toucan2.tools.before-update :as t2.before-update]
   [toucan2.tools.hydrate :as t2.hydrate]
   [toucan2.util :as t2.u])
  (:import
   (java.sql Blob)
   (java.time OffsetDateTime ZoneOffset)
   (java.time.temporal ChronoUnit)
   (toucan2.instance Instance)))

(set! *warn-on-reflection* true)

;;; even tho this gets loaded by `.init`, it's important for REPL usage it gets loaded ASAP so other model namespaces
;;; work correctly so I'm including it here as well to make the REPL work nicer -- Cam
(comment metabase.models.resolution/keep-me)

(p/import-vars
 [models.dispatch
  toucan-instance?
  instance-of?
  model
  instance])

(def ^{:arglists '([x & _args])} dispatch-on-model
  "Helper dispatch function for multimethods. Dispatches on the first arg, using [[models.dispatch/model]]."
  ;; make sure model namespace gets loaded e.g. `:model/Database` should load `metabase.model.database` if needed.
  (comp t2/resolve-model t2.u/dispatch-on-first-arg))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Toucan Extensions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;;;; [[define-simple-hydration-method]] and [[define-batched-hydration-method]]

(s/def ::define-hydration-method
  (s/cat :fn-name       symbol?
         :hydration-key keyword?
         :docstring     string?
         :fn-tail       (s/alt :arity-1 :clojure.core.specs.alpha/params+body
                               :arity-n (s/+ (s/spec :clojure.core.specs.alpha/params+body)))))

(defonce ^:private defined-hydration-methods
  (atom {}))

(defn- define-hydration-method [hydration-type fn-name hydration-key fn-tail]
  {:pre [(#{:hydrate :batched-hydrate} hydration-type)]}
  ;; Let's be EXTRA nice and make sure there are no duplicate hydration keys!
  (let [fn-symb (symbol (str (ns-name *ns*)) (name fn-name))]
    (when-let [existing-fn-symb (get @defined-hydration-methods hydration-key)]
      (when (not= fn-symb existing-fn-symb)
        (throw (ex-info (str (format "Hydration key %s already exists at %s" hydration-key existing-fn-symb)
                             "\n\n"
                             "You can remove it with"
                             "\n"
                             (pr-str (list 'swap! `(deref ~#'defined-hydration-methods) 'dissoc hydration-key)))
                        {:hydration-key       hydration-key
                         :existing-definition existing-fn-symb}))))
    (swap! defined-hydration-methods assoc hydration-key fn-symb))
  `(do
     (defn ~fn-name
       ~@fn-tail)
     ~(case hydration-type
        :hydrate
        `(methodical/defmethod t2.hydrate/simple-hydrate
           [:default ~hydration-key]
           [~'_model k# row#]
           (assoc row# k# (~fn-name row#)))

        :batched-hydrate
        `(methodical/defmethod t2.hydrate/batched-hydrate
           [:default ~hydration-key]
           [~'_model ~'_k rows#]
           (~fn-name rows#)))))

(defmacro define-simple-hydration-method
  "Define a Toucan hydration function (Toucan 1) or method (Toucan 2) to do 'simple' hydration (this function is called
  for each individual object that gets hydrated). This helper is in place to make the switch to Toucan 2 easier to
  accomplish. Toucan 2 uses multimethods instead of regular functions with `:hydrate` metadata. When we switch to
  Toucan 2, we won't need to rewrite all of our hydration methods at once -- we can just change the implementation of
  this function, and eventually remove it entirely."
  {:style/indent :defn}
  [fn-name hydration-key & fn-tail]
  (define-hydration-method :hydrate fn-name hydration-key fn-tail))

(s/fdef define-simple-hydration-method
  :args ::define-hydration-method
  :ret  any?)

(defmacro define-batched-hydration-method
  "Like [[define-simple-hydration-method]], but defines a Toucan 'batched' hydration function (Toucan 1) or
  method (Toucan 2). 'Batched' hydration means this function can be used to hydrate a sequence of objects in one call.

  See docstring for [[define-simple-hydration-method]] for more information as to why this macro exists."
  {:style/indent :defn}
  [fn-name hydration-key & fn-tail]
  (define-hydration-method :batched-hydrate fn-name hydration-key fn-tail))

(s/fdef define-batched-hydration-method
  :args ::define-hydration-method
  :ret  any?)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Toucan 2 Extensions                                              |
;;; +----------------------------------------------------------------------------------------------------------------+
;; --- transforms methods

(defn json-in
  "Default in function for columns given a Toucan type `:json`. Serializes object as JSON."
  [obj]
  (if (string? obj)
    obj
    (json/encode obj)))

(defn- json-out [s keywordize-keys?]
  (if (string? s)
    (try
      (json/decode s keywordize-keys?)
      (catch Throwable e
        (log/errorf "Error parsing JSON: %s" (ex-message e))
        s))
    s))

(defn json-out-with-keywordization
  "Default out function for columns given a Toucan type `:json`. Parses serialized JSON string and keywordizes keys."
  [obj]
  (json-out obj true))

(defn json-out-without-keywordization
  "Out function for columns given a Toucan type `:json-no-keywordization`. Similar to `:json-out` but does leaves keys
  as strings."
  [obj]
  (json-out obj false))

(defn- elide-data [obj]
  (match/replace-all obj
    #'string? (string/elide &match 250)
    (xs :guard (and (sequential? xs) (> (count xs) 50))) (take 50 xs)))

(defn- json-in-with-eliding
  [obj]
  (if (string? obj)
    obj
    (json/encode (elide-data obj))))

(def transform-json
  "Transform for json."
  {:in  json-in
   :out json-out-with-keywordization})

(def transform-json-eliding
  "Serializes object as JSON, but:
    - elides any long strings to a max of 250 chars
    - limits sequences to the first 50 entries
   Useful for debugging/human-consuming information which can be unbounded-ly large"
  {:in  json-in-with-eliding
   :out json-out-with-keywordization})

(defn catch-normalization-exceptions
  "Wraps normalization fn `f` and returns a version that gracefully handles Exceptions during normalization. When
  invalid queries (etc.) come out of the Database, it's best we handle normalization failures gracefully rather than
  letting the Exception cause the entire API call to fail because of one bad object. (See #8914 for more details.)"
  [f]
  (fn [x]
    (try
      (doall (f x))
      (catch Throwable e
        (log/errorf "Unable to normalize: %s" (ex-message e))
        nil))))

(def ^{:deprecated "0.57.0"} transform-legacy-field-ref
  "Transform field refs"
  {:in  json-in
   ;; inside the deprecated transform itself; legacy refs from the app DB need the legacy normalizer
   :out (comp (catch-normalization-exceptions #_{:clj-kondo/ignore [:deprecated-var]} mbql.normalize/normalize-field-ref)
              json-out-with-keywordization)})

(defn- result-metadata-out
  "Transform the Card result metadata as it comes out of the DB. Convert columns to keywords where appropriate."
  [metadata]
  ;; TODO -- can we make this whole thing a lazy seq?
  (when-let [metadata (not-empty (json-out-with-keywordization metadata))]
    (not-empty (mapv lib/normalize-result-metadata-column metadata))))

(def transform-result-metadata
  "Transform for card.result_metadata like columns."
  {:in  json-in
   :out result-metadata-out})

(def transform-keyword
  "Transform for keywords."
  {:in  u/qualified-name
   :out keyword})

(def transform-boolean
  "Transform for booleans; a boolean computed in SQL comes back as a number from MySQL and MariaDB."
  {:in  identity
   :out (fn [v] (if (number? v) (pos? v) v))})

(def transform-trim
  "Transform that trims whitespace on input and output. Useful for fixed-width char columns that pad with spaces."
  {:in  str/trim
   :out str/trim})

(def transform-json-no-keywordization
  "Transform for json-no-keywordization"
  {:in  json-in
   :out json-out-without-keywordization})

(def transform-edn
  "Transform that stores Clojure data as EDN strings. Preserves keywords, sets, and other
   types that JSON cannot represent. Strings are assumed to already be EDN and passed through."
  {:in  (fn [v] (cond (nil? v)    nil
                      (string? v) v
                      :else       (pr-str v)))
   :out (fn [s] (when (string? s) (edn/read-string s)))})

(mu/defn assert-enum
  "Assert that a value is one of the values in `enum`."
  [enum  :- [:set [:maybe [:or :keyword :string]]]
   value :- [:maybe [:or :keyword :string]]]
  (when-not (contains? enum value)
    (throw (ex-info (format "Invalid value %s. Must be one of %s" value (str/join ", " enum)) {:status-code 400
                                                                                               :value       value}))))

(mu/defn assert-optional-enum
  "Assert that a value is one of the values in `enum` or `nil`."
  [enum :- [:set [:or :keyword :string]]
   value :- [:maybe [:or :keyword :string]]]
  (when (some? value)
    (assert-enum enum value)))

(mu/defn assert-namespaced
  "Assert that a value is a namespaced keyword under `qualified-ns`."
  [qualified-ns :- string?
   value        :- [:or :keyword :string]]
  (when-not (= qualified-ns (-> value keyword namespace))
    (throw (ex-info (format "Must be a namespaced keyword under :%s, got: %s" qualified-ns value) {:status-code 400
                                                                                                   :value       value}))))

(defn transform-validator-with-fixes
  "Like [[transform-validator]], but applies `fixes` (a fn of old-value->new-value) before validation on both read
   and write. Use this when an enum has been renamed and old values may still exist in the database or in
   serialization exports."
  [tf assert-fn fixes]
  (-> tf
      (update :out (fn [f]
                     (fn [x]
                       (let [out (fixes (f x))]
                         (assert-fn out)
                         out))))
      (update :in (fn [f]
                    (fn [x]
                      (let [x (fixes x)]
                        (assert-fn x)
                        (f x)))))))

(defn transform-validator
  "Given a transform, returns a transform that call `assert-fn` on the \"out\" value.

  E.g: A keyword transformer that throw an error if the value is not namespaced
    (transform-validator
      transform-keyword (fn [x]
      (when-not (-> x namespace some?)
        (throw (ex-info \"Value is not namespaced\")))))"
  [tf assert-fn]
  (transform-validator-with-fixes tf assert-fn identity))

(def encrypted-json-in
  "Serialize encrypted json."
  (comp encryption/maybe-encrypt json-in))

(defn encrypted-json-out
  "Deserialize encrypted json, requiring the value to be encrypted when `MB_ENCRYPTION_SECRET_KEY` is set (see
  [[encryption/maybe-decrypt]]): a plaintext value at rest is rejected. A value that decrypts (or, with no key set,
  passes through) but is not valid JSON is logged and returned as-is rather than crashing the read."
  [v]
  (let [decrypted (encryption/maybe-decrypt v)]
    (try
      (some-> decrypted json/decode+kw)
      (catch Throwable e
        (if (or (encryption/possibly-encrypted-string? decrypted)
                (encryption/possibly-encrypted-bytes? decrypted))
          (log/error "Could not decrypt encrypted field! Have you forgot to set MB_ENCRYPTION_SECRET_KEY?")
          (log/errorf "Error parsing JSON: %s" (ex-message e)))
        v))))

(def ^:private cached-encrypted-json-out
  (memoize/ttl encrypted-json-out :ttl/threshold (* 60 60 1000)))

(defn decrypt-error-context
  "Wrap a decrypting transform `out-fn` so a failure names `source` (a \"table.column\" string) in the exception
  message. The reader of an encrypted-at-rest column otherwise fails with a bare \"Expected an encrypted value...\"
  that cannot be traced to a row without a debugger: only the message survives into the logs (ex-data is not
  logged), so the source has to be part of it. The message never includes the value."
  [source out-fn]
  (fn [v]
    (try
      (out-fn v)
      (catch Throwable e
        (throw (ex-info (format "Error decrypting %s: %s" source (ex-message e))
                        {:source source}
                        e))))))

(defn transform-encrypted-json
  "Encrypted-json transform for the column named by `source` (a \"table.column\" string, used in decrypt error
  messages). When `MB_ENCRYPTION_SECRET_KEY` is set, a plaintext value at rest is rejected on read."
  [source]
  {:in  encrypted-json-in
   :out (decrypt-error-context source cached-encrypted-json-out)})

(def ^:private json-schema-transformer
  "The same [[malli.transform/json-transformer]] [[metabase.api.macros]] decodes request bodies with, so a
  value has one JSON shape rather than one for the wire and another for the app DB."
  (mtx/json-transformer))

(defn- json-schema-encoder [schema]
  (mr/cached ::json-schema-encoder schema #(mc/encoder schema json-schema-transformer)))

(defn- json-schema-decoder [schema]
  (mr/cached ::json-schema-decoder schema #(mc/decoder schema json-schema-transformer)))

(defn transform-json-with-schema
  "Like [[transform-json]], but runs the value through `schema`'s malli JSON encoder and decoder, so a column
  can hold keywords and anything else JSON cannot carry on its own. `source` is a \"table.column\" string,
  named in the log message when a blob cannot be read.

  Values always go through `schema`; there is no string passthrough, since an already-encoded string would
  skip the decode this transform exists to do.

  An unreadable blob reads as `nil` rather than throwing, so one bad row cannot break a whole `t2/select`. It
  is logged at `:log-level` (`:warn` by default); pass `:error` when a failure carries a security
  consequence."
  ([source schema]
   (transform-json-with-schema source schema nil))

  ([source schema {:keys [log-level] :or {log-level :warn}}]
   {:in  (fn [v]
           (when (some? v)
             (json/encode ((json-schema-encoder schema) v))))
    :out (fn [s]
           (when (string? s)
             (try
               ((json-schema-decoder schema) (json/decode+kw s))
               (catch Throwable e
                 (if (= log-level :error)
                   (log/errorf e "Failed to parse %s; returning nil" source)
                   (log/warnf e "Failed to parse %s; returning nil" source))
                 nil))))}))

(defn transform-encrypted-json-with-schema
  "[[transform-json-with-schema]] for a column that is also encrypted at rest. [[decrypt-error-context]] names
  the column when a decrypt fails, instead of a bare \"Expected an encrypted value\".

  Unlike [[transform-encrypted-json]], the decrypt is not memoized: that cache holds both ciphertext and
  decoded value for an hour, which is the wrong trade for the unbounded blobs these columns tend to hold."
  ([source schema]
   (transform-encrypted-json-with-schema source schema nil))

  ([source schema opts]
   (let [{:keys [in out]} (transform-json-with-schema source schema opts)]
     {:in  (comp encryption/maybe-encrypt in)
      :out (comp out (decrypt-error-context source encryption/maybe-decrypt))})))

(defn transform-encrypted-text
  "Whole-column encrypted text transform for the column named by `source` (a \"table.column\" string, used in decrypt
  error messages). When `MB_ENCRYPTION_SECRET_KEY` is set, a plaintext value at rest is rejected on read (see
  [[encryption/maybe-decrypt]]) — a value written outside the encrypting path cannot stand in for a properly
  encrypted one."
  [source]
  {:in  encryption/maybe-encrypt
   :out (decrypt-error-context source encryption/maybe-decrypt)})

(def ^{:arglists '([s])} ^:private validate-cron-string
  (let [validator (mr/validator u.cron/CronScheduleString)]
    (partial mu/validate-throw validator)))

(def transform-cron-string
  "Transform for encrypted json."
  {:in  validate-cron-string
   :out identity})

(defn- blob->bytes [^Blob b]
  (.getBytes ^Blob b 0 (.length ^Blob b)))

(defn- maybe-blob->bytes [v]
  (if (instance? Blob v)
    (blob->bytes v)
    v))

(defn transform-secret-value
  "Transform for a secret `^bytes` column named by `source` (a \"table.column\" string, used in decrypt error
  messages). When `MB_ENCRYPTION_SECRET_KEY` is set, a plaintext value at rest is rejected on read."
  [source]
  {:in  (comp encryption/maybe-encrypt-bytes codecs/to-bytes)
   :out (decrypt-error-context source (comp encryption/maybe-decrypt-bytes maybe-blob->bytes))})

#_(defn decompress
    "Decompress `compressed-bytes`."
    [compressed-bytes]
    (if (instance? Blob compressed-bytes)
      (recur (blob->bytes compressed-bytes))
      (with-open [bis     (ByteArrayInputStream. compressed-bytes)
                  bif     (BufferedInputStream. bis)
                  gz-in   (GZIPInputStream. bif)
                  data-in (DataInputStream. gz-in)]
        (nippy/thaw-from-in! data-in))))

#_(def transform-compressed
    "Transform for compressed fields."
    {:in identity
     :out decompress})

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !!!                                                                                             !!!
;;; !!! PLEASE DON'T ADD NEW TRANSFORMS HERE, GO PUT THEM IN RELEVANT MODULES THAT USE THEM INSTEAD !!!
;;; !!!                                                                                             !!!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

;; --- predefined hooks

(defmulti non-timestamped-fields
  "Return a set of fields that should not affect the timestamp of a model."
  {:arglists '([instance])}
  dispatch-on-model)

(defmethod non-timestamped-fields :default
  [_]
  #{})

(defn now
  "Return a HoneySQL form for a SQL function call to get current moment in time. Currently this is `now()` for Postgres
  and H2 and `now(6)` for MySQL/MariaDB (`now()` for MySQL only return second resolution; `now(6)` uses the
  max (nanosecond) resolution)."
  []
  (h2x/current-datetime-honeysql-form (mdb/db-type)))

(defn ->integer
  "Return a HoneySQL form casting `expr` to an integer in the app DB: `SIGNED` for MySQL/MariaDB, which have no
  `INTEGER` cast type."
  [expr]
  [:cast expr (case (mdb/db-type)
                :mysql :signed
                :integer)])

(defn current-timestamp
  "The current moment in UTC at the microsecond precision of the app DB's timestamp columns, so it reads back unchanged."
  []
  (.truncatedTo (OffsetDateTime/now ZoneOffset/UTC) ChronoUnit/MICROS))

(defn- add-created-at-timestamp [obj & _]
  (cond-> obj
    (not (:created_at obj)) (assoc :created_at (now))))

(defn- add-updated-at-timestamp [obj]
  (let [changed-fields (set (keys (if (t2/instance obj)
                                    (t2/changes obj)
                                    obj)))
        ; don't stomp on `:updated_at` if it's already explicitly specified.
        changes-already-include-updated-at? (some #{:updated_at} changed-fields)
        has-non-ignored-fields? (seq (set/difference changed-fields (non-timestamped-fields obj)))
        should-set-updated-at? (and has-non-ignored-fields? (not changes-already-include-updated-at?))]
    (cond-> obj
      should-set-updated-at? (assoc :updated_at (now)))))

(t2/define-before-insert :hook/timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp
      add-created-at-timestamp))

(t2/define-before-update :hook/timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp))

(t2/define-before-insert :hook/created-at-timestamped?
  [instance]
  (-> instance
      add-created-at-timestamp))

(t2/define-before-insert :hook/updated-at-timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp))

(t2/define-before-update :hook/updated-at-timestamped?
  [instance]
  (-> instance
      add-updated-at-timestamp))

(defn- add-entity-id [obj & _]
  (cond-> obj
    (nil? (:entity_id obj)) (assoc :entity_id (u/generate-nano-id))))

(t2/define-before-insert :hook/entity-id
  [instance]
  (-> instance
      add-entity-id))

(methodical/prefer-method! #'t2.before-insert/before-insert :hook/timestamped? :hook/entity-id)
(methodical/prefer-method! #'t2.before-insert/before-insert :hook/updated-at-timestamped? :hook/entity-id)
(methodical/prefer-method! #'t2.before-insert/before-insert :hook/created-at-timestamped? :hook/entity-id)

(defn prefer-hook-trait!
  "Orders the hooks of `trait` after those of the timestamp and entity id traits, so they see the row those complete."
  [trait]
  (doseq [hook [:hook/timestamped? :hook/created-at-timestamped? :hook/updated-at-timestamped? :hook/entity-id]]
    (methodical/prefer-method! #'t2.before-insert/before-insert hook trait))
  (doseq [hook [:hook/timestamped? :hook/updated-at-timestamped?]]
    (methodical/prefer-method! #'t2.before-update/before-update hook trait)))

;; --- helper fns
(defn changes-with-pk
  "The row merged with the changes in pre-update hooks.
  This is to match the input of pre-update for toucan1 methods"
  [row]
  (t2.protocols/with-current row (merge (t2.model/primary-key-values-map row)
                                        (t2.protocols/changes row))))

(defn do-after-select
  "Do [[toucan2.tools.after-select]] stuff for row map `object` using methods for `modelable`."
  [modelable row-map]
  {:pre [(map? row-map)]}
  (let [model (t2/resolve-model modelable)]
    (try
      (models.db/after-select-via-identity-query {:model model :row row-map})
      (catch Throwable e
        (throw (ex-info (format "Error doing after-select for model %s: %s" model (ex-message e))
                        {:model model}
                        e))))))

(defmulti after-archived-change
  "Writes what an UPDATE of a `model` row that changed `:archived` takes to the rows that follow it, called by
  [[define-update-in-transaction]] after the UPDATE with the rows as they were before it, so the parent is written first."
  {:arglists '([model rows changes])}
  (fn [model _rows _changes] model))

(defmethod after-archived-change :default
  [_model _rows _changes]
  nil)

(defn rows-changing-archived
  "The rows of `model` that the UPDATE given by `parsed-args` and `resolved-query` selects and whose `:archived` differs
  from the one in `changes`."
  [model parsed-args resolved-query changes]
  (filterv #(not= (boolean (:archived %)) (boolean (:archived changes)))
           (t2.pipeline/transduce-query ((map t2.realize/realize) conj)
                                        :toucan.query-type/select.instances.from-update
                                        model parsed-args resolved-query)))

(defn runs-statement?
  "Whether the UPDATE of `model` as `query-type` runs its statement here, rather than handing it to Toucan's after-update
  tool, which runs it again as a query returning instances."
  [query-type model]
  (or (isa? query-type :toucan.result-type/instances)
      (methodical/is-default-primary-method? t2.after/each-row-fn [query-type model])))

(defmacro define-update-in-transaction
  "Runs every UPDATE of `model`, with its before-update hooks, in one transaction, and calls [[after-archived-change]]
  after it for the rows whose `:archived` it changed, with the events of the UPDATE and of the cascade delivered as one
  batch."
  [model]
  `(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/update.* ~model :default]
     [rf# query-type# model# parsed-args# resolved-query#]
     (t2.conn/with-transaction [_conn# nil {:nested-transaction-rule :ignore}]
       (let [changes# (:changes parsed-args#)
             rows#    (when (and (contains? changes# :archived)
                                 (contains? (methods after-archived-change) model#)
                                 (runs-statement? query-type# model#))
                        (rows-changing-archived model# parsed-args# resolved-query# changes#))]
         (if (seq rows#)
           (events.batch/do-with-write-batch
            #(u/prog1 (~'next-method rf# query-type# model# parsed-args# resolved-query#)
               (after-archived-change model# rows# changes#)))
           (~'next-method rf# query-type# model# parsed-args# resolved-query#))))))

(defn archived-directly
  "The `archived_directly` of `row`, an update that changes `:archived`: the one the write gives, else true when `row` is
  archived by itself, which is when `parent-archived?`, a function of no arguments, says that its parent is not."
  [row parent-archived?]
  (if (contains? (t2/changes row) :archived_directly)
    (:archived_directly row)
    (boolean (and (:archived row) (not (parent-archived?))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             New Permissions Stuff                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; TODO -- consider moving all this stuff into the `permissions` module

(defn- model-name
  "The name of the model of `instance`, for a message."
  [instance]
  (let [model (some-> instance t2/model)]
    (cond
      (class? model)   (.getSimpleName ^Class model)
      (keyword? model) (name model)
      :else            (str model))))

(defn- hydrated-answer
  "The `answer` hydration left under `k` for `instance`, throwing when there is none."
  [instance k answer]
  (when (nil? answer)
    (throw (ex-info (format "No %s is hydrated on a %s." k (model-name instance))
                    {:status-code 500})))
  answer)

(defn can-read?
  "Whether the current user reads `instance`, as its `:can_read` hydration answered in its metadata."
  [instance]
  (hydrated-answer instance :can_read (:can_read (meta instance))))

(defn can-write?
  "Whether the current user writes `instance`, as its `:can_write` hydration answered."
  [instance]
  (hydrated-answer instance :can_write (:can_write instance)))

(defn can-query?
  "Whether the current user runs queries against `instance`, as its `:can_query` hydration answered."
  [instance]
  (hydrated-answer instance :can_query (:can_query instance)))

(defn readable
  "Those of `instances` the current user can read, in a vector, their `:can_read` hydrated together."
  [instances]
  (filterv can-read? (t2/hydrate instances :can_read)))

(defn writable
  "Those of `instances` the current user can write, in a vector, their `:can_write` hydrated together."
  [instances]
  (filterv can-write? (t2/hydrate instances :can_write)))

(methodical/defmethod t2.hydrate/needs-hydration? [:default :can_read]
  "Whether `instance` lacks the answer `:can_read` hydration keeps in its metadata, since `:can_read` is not a key of
  the row."
  [_model _k instance]
  (nil? (:can_read (meta instance))))

(defn- no-check-hydration
  "Throws for `instance`, whose model has no hydration of the check `k`."
  [k instance]
  (throw (ex-info (format "%s has no %s hydration." (model-name instance) k) {:status-code 500})))

(methodical/defmethod t2.hydrate/simple-hydrate [:default :can_read]
  "Throws: a model answers `:can_read` in a hydration of its own."
  [_model k instance]
  (no-check-hydration k instance))

(methodical/defmethod t2.hydrate/simple-hydrate [:default :can_write]
  "Throws: a model answers `:can_write` in a hydration of its own."
  [_model k instance]
  (no-check-hydration k instance))

(methodical/defmethod t2.hydrate/batched-hydrate [:default :can_query]
  "Sets `:can_query` on each of `instances` to its `:can_read`, for a model that answers both alike."
  [_model k instances]
  (for [instance (t2/hydrate instances :can_read)]
    (when instance
      (assoc instance k (can-read? instance)))))

(defmulti can-create?
  "Whether the current user may create a `model` row with the properties in the map `m`, the question `api/create-check` asks."
  {:added "0.32.0", :arglists '([model m])}
  dispatch-on-model)

(defmethod can-create? :default
  [model _m]
  (throw
   (NoSuchMethodException.
    (str (format "%s does not yet have an implementation for [[can-create?]]. " (name model))
         "Please consider adding one. See dox for [[can-create?]] for more details."))))

(defmulti can-update?
  "Whether the current user may apply the `changes` map to `instance`, as `(t2/update! model id changes)` would, the
  question `api/update-check` asks."
  {:added "0.36.0", :arglists '([instance changes])}
  dispatch-on-model)

(defmethod can-update? :default
  [instance _changes]
  (throw
   (NoSuchMethodException.
    (str (format "%s does not yet have an implementation for `can-update?`. " (name (models.dispatch/model instance)))
         "Please consider adding one. See dox for `can-update?` for more details."))))

(defn changes-archived?
  "Whether `changes` give `row` another value of `:archived`."
  [row changes]
  (and (contains? changes :archived)
       (not= (boolean (:archived row)) (boolean (:archived changes)))))

(defn changes-only-archived?
  "Whether `changes` give `row` another value of `:archived` and change nothing else."
  [row changes]
  (and (changes-archived? row changes)
       (every? #{:archived} (keys changes))))

(defmulti can-update-all?
  "Whether the current user may apply `changes` to every one of the `model` `rows`, each hydrated with `:can_write`; a
  model implements it to answer once for all rows what its [[can-update?]] would ask for each."
  {:arglists '([model rows changes])}
  dispatch-on-model)

(defmethod can-update-all? :default
  [model rows changes]
  (if (contains? (methods can-update?) model)
    (every? #(can-update? % changes) rows)
    (every? can-write? rows)))

(defn can-update-each?
  "Whether the current user may apply `changes` to each of the `model` `rows`, which are hydrated with `:can_write`
  once together and answered by [[can-update-all?]]."
  [model rows changes]
  (or (empty? rows)
      (can-update-all? model (t2/hydrate (vec rows) :can_write) changes)))

(defmulti can-update-followers?
  "Whether the current user may apply `changes`, an archive or restore of the row the `model` `rows` follow, to them: by
  default what [[can-update-each?]] answers, and for a model whose write access is not about archiving, what an archive
  asks of it."
  {:arglists '([model rows changes])}
  dispatch-on-model)

(defmethod can-update-followers? :default
  [model rows changes]
  (can-update-each? model rows changes))

(defn archive-followers-updatable?
  "Whether the current user may apply `changes` to the `model` rows that archiving or restoring `row` takes along, which
  `followers` selects given whether `changes` archive."
  [row changes model followers]
  (or (not (changes-archived? row changes))
      (can-update-followers? model (followers (boolean (:archived changes))) changes)))

(defn superuser?
  "Is [[metabase.api.common/*current-user*]] is a superuser? Ignores args. Intended for use as an implementation
  of [[can-read?]] and/or [[can-write?]]."
  [& _]
  @(requiring-resolve 'metabase.api.common/*is-superuser?*))

(defn current-user-id
  "Return the ID of the current user."
  []
  @(requiring-resolve 'metabase.api.common/*current-user-id*))

(methodical/defmethod t2/simple-hydrate [::read-policy.always-allow :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean true)))

(methodical/defmethod t2/simple-hydrate [::write-policy.always-allow :can_write]
  [_model k instance]
  (assoc instance k (boolean true)))

(methodical/defmethod t2/simple-hydrate [::read-policy.superuser :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (superuser?))))

(methodical/defmethod t2/simple-hydrate [::write-policy.superuser :can_write]
  [_model k instance]
  (assoc instance k (boolean (superuser?))))

(defmethod can-create? ::create-policy.superuser
  [_model _m]
  (superuser?))

;;;; [[to-json]]

(methodical/defmulti to-json
  "Serialize an `instance` to JSON."
  {:arglists            '([instance json-generator])
   :defmethod-arities   #{2}
   :dispatch-value-spec (some-fn keyword? symbol?)} ; dispatch value should be either keyword model name or symbol
  t2.u/dispatch-on-first-arg)

(methodical/defmethod to-json :default
  "Default method for encoding instances of a Toucan model to JSON."
  [instance json-generator]
  (json/generate-map instance json-generator))

(json/add-encoder
 Instance
 #'to-json)

;;;; etc

;;; Trigger errors when hydrate encounters a key that has no corresponding method defined.
(reset! t2.hydrate/global-error-on-unknown-key true)

(methodical/defmethod t2.hydrate/fk-keys-for-automagic-hydration :default
  "In Metabase the FK key used for automagic hydration should use underscores (work around upstream Toucan 2 issue)."
  [_original-model dest-key _hydrated-key]
  [(u/->snake_case_en (keyword (str (name dest-key) "_id")))])

(mr/def ::hydratable-item
  "An item to hydrate: usually a Toucan instance, but callers may pass a plain map (or nil, for a sparse position)
  since this helper only assocs a hydration key onto it."
  [:maybe [:map {:closed false, :description "a Toucan instance or a plain map"}]])

(mu/defn instances-with-hydrated-data
  ;; TODO: this example is wrong, we don't get a vector of tables
  "Helper function to write batched hydrations.
  Assoc to each `instances` a key `hydration-key` with data from calling `instance-key->hydrated-data-fn` by `instance-key`.

    (instances-with-hydrated-data
      (t2/select :model/Database)
      :tables
      #(t2/select-fn->fn :db_id identity :model/Table)
      :id)
    ;; => [{:id 1 :tables [...tables-from-db-1]}
           {:id 2 :tables [...tables-from-db-2]}]

  - key->hydrated-items-fn: is a function that returns a map with key is `instance-key` and value is the hydrated data of that instance."
  [instances                      :- [:sequential ::hydratable-item]
   hydration-key                  :- :keyword
   instance-key->hydrated-data-fn :- fn?
   instance-key                   :- :keyword
   & [{:keys [default] :as _options}] :- [:* [:map {:closed true}
                                              [:default {:optional true}
                                               [:maybe [:or :boolean number? [:map {:closed true}] [:= []]]]]]]]
  (when (seq instances)
    (let [key->hydrated-items (instance-key->hydrated-data-fn)]
      (for [item instances]
        (when item
          (assoc item hydration-key (get key->hydrated-items (get item instance-key) default)))))))

(defmulti non-internal-filter-clause
  "The HoneySQL clause over the table of `model` aliased `alias` selecting the rows that are no internal content, such
  as Metabase Analytics, the sample database or the internal user; every row by default."
  {:arglists '([model alias])}
  dispatch-on-model)

(defmethod non-internal-filter-clause :default
  [_model _alias]
  [:= [:inline 1] [:inline 1]])
