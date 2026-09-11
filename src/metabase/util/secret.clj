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
   [pretty.core :as pretty]))

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
  "The audience fields of `m` that `schema`, an ordinary Malli map schema, declares, each normalized by the schema it
  is declared with. `m` may be a whole details or settings map; keys the schema does not name are dropped, and so are
  fields that normalize to nothing: an absent key, `nil` and `\"\"` all mean unset. Never fills in a default for an
  absent field.

  Plain `:string`, `:int` and `:boolean` compare exactly (a `:string` keeps case and whitespace); [[::hostname]],
  [[::url-scheme]], [[::url-path]] and [[::url]] relax the comparison for the spellings those kinds treat as
  equivalent."
  [schema m]
  ;; nothing in Metabase records what an absent port resolves to (driver connection properties carry a `:placeholder`,
  ;; never a `:default`, and the JDBC driver applies the real one), so filling a default in here would duplicate
  ;; knowledge that can drift and silently release a secret to a different destination. `nil` stays distinct instead.
  (let [decode (mr/cached ::audience-decoder schema #(mc/decoder schema audience-transformer))]
    (into {}
          (remove (fn [[_ v]] (or (nil? v) (and (string? v) (str/blank? v)))))
          (decode (or m {})))))

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

  * `to-creator` -- showing a just-created credential to its creator, once.
  * `fixed-endpoint` -- presenting it to a peer no setting selects, so there is no audience to compare. The Slack API
    is the example: its address is not configurable, so nothing a caller writes can redirect the credential.
  * `local-keystore` -- unlocking a keystore file on this instance's own disk, which never leaves the process but
    needs the plaintext as a `char[]` rather than a derivation."
  #{:disclosure/to-creator
    :disclosure/fixed-endpoint
    :disclosure/local-keystore})

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
               "Apply `f` to the plaintext and return its result, without the plaintext ever becoming a binding in
    caller scope.

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

(defn- assert-same-audience!
  "Throw a 400 with `:error-code :secret-audience-mismatch` unless `requested` names the audience `bound`, comparing
  both under `schema`. `bound` is `nil` for a secret not bound to any network peer, which is refused outright."
  [schema bound requested]
  (when (nil? bound)
    (throw (ex-info "This secret has no bound audience, so it cannot be presented to a network peer."
                    {:error-code :secret-unbound})))
  (when-not (same-audience? schema bound requested)
    ;; the only way to reach a mismatch is a caller-supplied destination, so this is always a client error
    (throw (ex-info (tru "This secret is not bound to the requested audience.")
                    {:status-code 400
                     :error-code  :secret-audience-mismatch
                     :bound       bound
                     :requested   (canonical-audience schema requested)}))))

(defn- assert-disclosure-reason!
  "Throw unless `reason` is one of [[disclosure-reasons]]."
  [reason]
  (when-not (contains? disclosure-reasons reason)
    (throw (ex-info (format "Unknown disclosure reason %s" (pr-str reason))
                    {:error-code :secret-unknown-disclosure-reason
                     :reason     reason}))))

(p/deftype+ Secret [value-fn audience-schema audience prefix-length]
  ISecret
  (expose [_this requested]
    (cond
      (keyword? requested) (assert-disclosure-reason! requested)
      (map? requested)     (assert-same-audience! audience-schema audience requested)
      :else                (throw (ex-info "An audience must be an audience map or a known disclosure reason."
                                           {:error-code :secret-invalid-audience})))
    (value-fn))

  (derive-with [_this f] (f (value-fn)))

  (prefix [_this]
    (when-not prefix-length
      (throw (ex-info "This secret declares no prefix length, so no part of it is safe to reveal."
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
                    (throw (ex-info "Refusing to JSON-encode a Secret: expose it to an audience, or mask it, first."
                                    {:error-code :secret-json-encode}))))

(defn secret
  "Create a `Secret` that can't be read without calling [[expose]] with an audience.

  Options:

  * `:audience-schema` -- how this kind of secret's audience fields are compared: an ordinary Malli map schema, as
    [[canonical-audience]] takes. Declare it once per integration. Required alongside `:audience`, and used again to
    normalize the audience a caller later presents to [[expose]], so both sides are compared the same way.
  * `:audience` -- the record the secret lives in, from which the schema selects the audience fields. Nothing is
    persisted, so changing what counts as an audience never invalidates a stored secret. When the schema selects
    nothing from it the secret is unbound: it opens to a disclosure reason, never to a network peer.
  * `:prefix-length` -- how many leading characters this *kind* of secret may reveal, for kinds whose prefix is a
    non-sensitive lookup identifier (an API key's `mb_1234`). Drives both [[prefix]] and [[mask]]. Omit it and the
    secret has no revealable part and masks opaquely."
  ([value]
   (secret value nil))
  ([value {schema :audience-schema, aud :audience, prefix-length :prefix-length}]
   (when (and aud (not schema))
     (throw (ex-info "A secret bound to an audience must declare an :audience-schema for comparing it."
                     {:error-code :secret-missing-audience-schema})))
   (->Secret (constantly value)
             schema
             ;; a record the schema selects nothing from binds to no destination: `{}` would compare equal to every
             ;; requested map under an empty schema and so open to any peer
             (when aud (not-empty (canonical-audience schema aud)))
             prefix-length)))

(defn secret?
  "Whether `x` is an instance of a `Secret`."
  [x]
  (instance? metabase.util.secret.ISecret x))

(defn maybe-expose
  "[[expose]] `v` to `audience` when it is a Secret; return it untouched otherwise.

  The shape every sink wants: a credential the caller just typed is a plain String and goes wherever they said, while
  a stored one is a bound Secret and opens only to the destination it is bound to.

  A refusal is a 400 carrying its own message and `:error-code :secret-audience-mismatch`. Call this *outside* any
  `try` that would translate an exception into a message of its own: the refusal depends only on data already in
  hand, never on the network, so every sink has a place for it ahead of the risky part."
  [v audience]
  (cond-> v
    (secret? v) (expose audience)))

(defn maybe-derive-with
  "[[derive-with]] when `v` is a Secret; apply `f` to `v` directly otherwise.

  The partner of [[maybe-expose]] for a derivation that stays in the process: it tolerates a caller, or a test, that
  already holds the plain value. Pair it with `some->` where `f` cannot take nil."
  [v f]
  (if (secret? v)
    (derive-with v f)
    (f v)))

(mr/def ::secret
  "An instance of a metabase.util.secret.ISecret."
  [:fn
   {:error/message "An instance of a metabase.util.secret.ISecret."}
   #'secret?])
