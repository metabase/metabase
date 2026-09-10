(ns metabase.util.secret
  "A value that cannot be read without stating who it is being disclosed to.

  A [[Secret]] wraps a credential so that it is redacted in logs, `str`, and API responses, and so that obtaining the
  plaintext requires naming an *audience* -- the party the credential is about to be presented to. The audience is
  checked against the one the secret is bound to, which closes the credential-redirection class of bug where a caller
  points a connection at a host they control while echoing back a masked secret.

  \"Audience\" is the JWT `aud` concept: the party a credential may be presented to. It deliberately covers not only
  *who receives* the credential but *who can observe it in transit*, which is why the transport is part of it --
  downgrading TLS widens the audience just as surely as changing the host does."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]
   [pretty.core :as pretty])
  (:import
   (java.net URI)))

(set! *warn-on-reflection* true)

;; An audience *schema* declares which fields of a record form the audience, and how each is compared. It is an
;; ordinary Malli map schema -- plain `:string`, `:int` and `:boolean` for most fields -- so it registers and
;; introspects like every other schema in the codebase.
;;
;; Comparison behavior is declared per field rather than guessed from the key's name: a rule inferred from naming
;; silently equates two genuinely different destinations the moment a key does not mean what its name suggests --
;; `:vhost` ends in "host" but a RabbitMQ vhost is case-sensitive -- and that direction of error is a false negative,
;; which is exactly what this check exists to prevent.

(defn- trimmed [v]
  (when (string? v) (not-empty (str/trim v))))

(defn- decode-ci [v]
  ;; DNS names and URL schemes are case-insensitive by spec, so folding case is a true equivalence rather than a guess
  (if (string? v) (some-> (trimmed v) u/lower-case-en) v))

(defn- decode-url-path [v]
  (if (string? v) (some-> (trimmed v) (str/replace #"/+$" "") not-empty) v))

;; Only behaviors Malli has no built-in for get a schema of their own, and each is named for what the value *is*
;; rather than as a parallel type system: the normalization follows from the semantics. Everything else uses plain
;; `:string`, `:int` and `:boolean`, decoded by `mtx/string-transformer`.
;;
;; Note that plain `:string` deliberately does not trim. For a hostname the surrounding whitespace is not part of the
;; name, so trimming is an equivalence; for an opaque field like `additional-options` it might not be, and comparing
;; exactly fails closed.

(mr/def ::hostname
  "A host name, compared case-insensitively because DNS is."
  [:string {:decode/audience decode-ci}])

(mr/def ::url-scheme
  "A URL scheme, compared case-insensitively because RFC 3986 says schemes are."
  [:string {:decode/audience decode-ci}])

(mr/def ::url-path
  "A URL path, where a trailing slash is insignificant."
  [:string {:decode/audience decode-url-path}])

(mr/def ::url
  "A whole URL compared exactly, except for surrounding whitespace, which is never part of it. Case is kept: paths are
  case-sensitive, and folding the scheme and host alone would need parsing, so a differently-cased host reads as a
  different audience, which fails closed."
  [:string {:decode/audience trimmed}])

(def ^:private audience-transformer
  ;; strip-extra-keys is what lets a caller hand in a whole details or settings map and have the schema select the
  ;; audience fields out of it; string-transformer is what makes plain `:int` and `:boolean` accept "5432" and "true",
  ;; so those need no schema of ours
  (mtx/transformer mtx/strip-extra-keys-transformer
                   mtx/string-transformer
                   {:name :audience}))

(defn canonical-audience
  "Select and normalize the audience fields of `m` according to `schema`, an ordinary Malli map schema.

  The schema does the selecting, so a caller can hand in a whole details or settings map and let the declaration pick
  out the fields that decide where a credential's bytes go and how they are protected. Fields absent from the schema
  are not part of the audience and are ignored, as are fields that normalize to nothing -- an absent key, `nil` and
  `\"\"` all mean unset, which matters because a form submits an untouched field as an empty string where storage
  holds `nil`.

  Use plain `:string`, `:int` and `:boolean` for most fields; [[::hostname]], [[::url-scheme]] and [[::url-path]] for
  the three kinds whose spelling has a true equivalence Malli has no built-in for. `:string` is the safe default:
  compared exactly, case and whitespace and all, so a field only loses strictness by naming a schema that relaxes it.
  None of the relaxations can make two genuinely different destinations compare equal.

  It deliberately does **not** resolve defaults. Nothing in Metabase records what an absent port resolves to -- every
  driver connection property carries a `:placeholder`, never a `:default`, and the real default is applied inside the
  JDBC driver. Filling one in here would duplicate knowledge that lives outside this codebase and can drift, and a
  drifted default silently releases a secret bound to one destination to a different one. Leaving `nil` distinct from
  an explicit value fails closed instead. The same reasoning rules out deriving a transport enum from `ssl` plus
  `sslmode` plus driver behaviour -- declare the raw fields and a weakened channel reads as a changed audience without
  anyone having to model what the channel means."
  [schema m]
  (let [decode (mr/cached ::audience-decoder schema #(mc/decoder schema audience-transformer))]
    (into {}
          (remove (fn [[_ v]] (or (nil? v) (and (string? v) (str/blank? v)))))
          (decode (or m {})))))

(mr/def ::url-audience
  "Audience schema for the `{:scheme :host :port :path}` shape produced by [[url->audience-fields]]."
  [:map
   [:scheme {:optional true} ::url-scheme]
   [:host   {:optional true} ::hostname]
   [:port   {:optional true} :int]
   [:path   {:optional true} ::url-path]])

(defn url->audience-fields
  "Decompose a base URL into the raw fields [[::url-audience]] describes. An absent port stays absent rather than being
  filled in with the scheme's default, for the reason given on [[canonical-audience]]."
  [url]
  (let [uri (URI. (str/trim (str url)))]
    {:scheme (.getScheme uri)
     :host   (.getHost uri)
     :port   (let [p (.getPort uri)] (when (pos? p) p))
     :path   (.getPath uri)}))

(defn same-audience?
  "Whether a secret bound to `stored` may be presented to `incoming`, comparing both under `schema`.

  Anything that differs -- a new host, a new port, SSL turned off, an edited free-text options field -- reads as a
  different audience and fails closed. Turning protection *up* is refused too; that is a deliberate trade of a small
  annoyance for not having to model what every driver's transport settings mean."
  [schema stored incoming]
  (= (canonical-audience schema stored) (canonical-audience schema incoming)))

;;; ------------------------------------------------ disclosure ------------------------------------------------------

(def disclosure-reasons
  "The closed set of reasons a secret may be handed out as plaintext to something other than a network peer.

  Deliberately tiny. Anything whose *output* is non-sensitive by construction belongs on the type as a method
  ([[prefix]], [[mask]]) rather than here, and anything needing caller-supplied logic should use [[derive-with]], which
  confines the plaintext to one expression. What is left is the case no mechanism can verify: handing a credential to
  a person.

  * `to-creator` -- showing a just-created credential to its creator, once."
  #{:disclosure/to-creator})

(def ^:const mask-string
  "The fixed, value-independent portion of a mask. Constant width so it leaks neither the length nor any character of
  the secret, and cannot be reconstructed from a guess at the value."
  "**********")

;;; -------------------------------------------------- Secret --------------------------------------------------------

;; Define an interface for secrets to make things harder to accidentally expose.
;;
;; This uses `definterface` rather than `defprotocol` because [[secret?]] below only works correctly for classes that
;; implement it at definition time; making it an interface discourages people from thinking an object that you
;; `extend-protocol`-ed would work
(p/definterface+ ISecret
  (expose [this audience]
          "Expose the secret to `audience`, which is either an audience map naming the network peer it is about to be
    presented to (canonicalized here, so a raw details or settings map is fine), or a keyword from
    [[disclosure-reasons]]. Throws unless the secret is bound to a matching audience. There is deliberately no arity
    that omits it.")
  (derive-with [this f]
               "Apply `f` to the plaintext and return its result, without the plaintext ever becoming a binding in caller scope.

    For one-way derivations that need caller-supplied logic and so cannot be methods here -- hashing a credential for
    storage being the motivating case, since this namespace must not depend on the crypto layer. Weaker than a method
    (nothing stops `identity` being passed) but it removes the unverifiable-reason keyword such call sites would
    otherwise need, and confines the value to a single expression.")
  (prefix [this]
          "The leading characters of the secret that its *kind* declared safe to reveal, via `:prefix-length`.

    The length is fixed at construction rather than chosen by the caller precisely so that a call site cannot ask for
    most of the credential.")
  (mask [this]
        "A rendering of this secret that is safe to return over the API.")
  (bound-audience [this]
                  "The canonical audience this secret is bound to, or `nil` if it is not bound to a network peer."))

(p/deftype+ Secret [value-fn audience-schema audience prefix-length]
  ISecret
  (expose [_this requested]
    (cond
      (keyword? requested)
      (if (contains? disclosure-reasons requested)
        (value-fn)
        (throw (ex-info (tru "Unknown disclosure reason {0}" (pr-str requested))
                        {:error-code :secret-unknown-disclosure-reason
                         :reason     requested})))

      (map? requested)
      (cond
        (nil? audience)
        (throw (ex-info (tru "This secret has no bound audience, so it cannot be presented to a network peer.")
                        {:error-code :secret-unbound}))

        (same-audience? audience-schema audience requested)
        (value-fn)

        :else
        ;; the only way to reach a mismatch is a caller-supplied destination, so this is always a client error
        (throw (ex-info (tru "This secret is not bound to the requested audience.")
                        {:status-code 400
                         :error-code  :secret-audience-mismatch
                         :bound       audience
                         :requested  (canonical-audience audience-schema requested)})))

      :else
      (throw (ex-info (tru "An audience must be an audience map or a known disclosure reason.")
                      {:error-code :secret-invalid-audience}))))

  (derive-with [_this f] (f (value-fn)))

  (prefix [_this]
    (when-not prefix-length
      (throw (ex-info (tru "This secret declares no prefix length, so no part of it is safe to reveal.")
                      {:error-code :secret-no-declared-prefix})))
    (let [v (str (value-fn))]
      (subs v 0 (min (long prefix-length) (count v)))))

  (mask [this]
    (if prefix-length
      (str (prefix this) mask-string)
      mask-string))

  (bound-audience [_this] audience)

  Object
  (toString [_this] (trs "<< REDACTED SECRET >>"))

  pretty/PrettyPrintable
  (pretty [this]
    (.toString this)))

;; A Secret in a JSON response is a leak in the making: the value never belongs on the wire, and the catch-all
;; encoder would otherwise render it as the redaction string, hiding the bug rather than surfacing it. Registered on
;; the interface so every implementation is covered, and an interface impl wins over the `Object` catch-all.
(json/add-encoder metabase.util.secret.ISecret
                  (fn [_secret _generator]
                    (throw (ex-info (trs "Refusing to JSON-encode a Secret: expose it to an audience, or mask it, first.")
                                    {:error-code :secret-json-encode}))))

(defn secret
  "Create a `Secret` that can't be read without calling [[expose]] with an audience.

  Options:

  * `:audience-schema` -- how this kind of secret's audience fields are compared: an ordinary Malli map schema, as
    [[canonical-audience]] takes. Declare it once per integration. Required alongside `:audience`, and used again to
    normalize the audience a caller later presents to [[expose]], so both sides are compared the same way.
  * `:audience` -- the record the secret lives in, from which the schema selects the audience fields. Nothing is
    persisted, so changing what counts as an audience never invalidates a stored secret.
  * `:prefix-length` -- how many leading characters this *kind* of secret may reveal, for kinds whose prefix is a
    non-sensitive lookup identifier (an API key's `mb_1234`). Drives both [[prefix]] and [[mask]]. Omit it and the
    secret has no revealable part and masks opaquely."
  ([value]
   (secret value nil))
  ([value {schema :audience-schema, aud :audience, prefix-length :prefix-length}]
   (when (and aud (not schema))
     (throw (ex-info (tru "A secret bound to an audience must declare an :audience-schema for comparing it.")
                     {:error-code :secret-missing-audience-schema})))
   (->Secret (constantly value)
             schema
             (when aud (canonical-audience schema aud))
             prefix-length)))

(defn secret?
  "Whether `x` is an instance of a `Secret`."
  [x]
  (instance? metabase.util.secret.ISecret x))

(defn maybe-expose
  "[[expose]] `v` to `audience` when it is a Secret; return it untouched otherwise.

  The shape every sink wants: a credential the caller just typed is a plain String and goes wherever they said, while
  a stored one is a bound Secret and opens only to the destination it is bound to.

  Call this *outside* any `try` that would translate an exception into a message of its own. The refusal depends only
  on data already in hand, never on the network, so every sink has a place for it ahead of the risky part. Where the
  sink is itself called from inside such a `try`, that handler must call [[rethrow-if-audience-mismatch!]] first."
  [v audience]
  (cond-> v
    (secret? v) (expose audience)))

(defn- audience-mismatch
  "The refusal in `e`'s cause chain, if any: the exception [[expose]] threw for an audience the secret is not bound to.

  Walks the chain rather than merging it (as `u/all-ex-data` would), because a wrapping exception with an
  `:error-code` of its own would otherwise hide the refusal underneath it. Returns the refusal itself, so a caller
  rethrows the exception carrying the right message and status rather than the wrapper."
  [e]
  (some (fn [t]
          (when (= :secret-audience-mismatch (:error-code (ex-data t)))
            t))
        (take-while some? (iterate ex-cause e))))

(defn audience-mismatch?
  "Whether `e` is, or was caused by, a refusal to present a secret to an audience it is not bound to."
  [e]
  (some? (audience-mismatch e)))

(defn rethrow-if-audience-mismatch!
  "Rethrow the refusal in `e` if there is one; return nil otherwise.

  A refused audience is a client naming a destination the stored credential is not bound to. It carries its own
  message and 400, and must not be reported as whatever failure the surrounding handler exists to describe. Call this
  first in any `catch` that translates exceptions into a message of its own and could see a secret being opened
  beneath it.

  Prefer arranging the sink so this is unnecessary: open the secret ahead of the `try`, as [[maybe-expose]] says.
  This is for the case where that is not possible because the sink itself is called from inside such a handler."
  [e]
  (when-let [refusal (audience-mismatch e)]
    (throw refusal)))

(defn masked?
  "Whether `v` looks like a value produced by [[mask]] -- i.e. the client echoed back a mask rather than supplying a
  new secret.

  This answers a *data* question and is deliberately not an authorization primitive: whether a caller may use a stored
  secret is decided by the audience comparison, never by recognizing a mask. A forged or malformed mask therefore
  cannot authorize anything; at worst it is treated as a freshly supplied value, which fails safe."
  [v]
  (boolean (and (string? v) (str/includes? v mask-string))))

(mr/def ::secret
  "An instance of a metabase.util.secret.ISecret."
  [:fn
   {:error/message "An instance of a metabase.util.secret.ISecret."}
   #'secret?])
