(ns metabase.util
  "Common utility functions useful throughout the codebase."
  (:require
   [camel-snake-kebab.internals.macros :as csk.macros]
   [clojure.data :refer [diff]]
   [clojure.pprint :as pprint]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [flatland.ordered.map :refer [ordered-map]]
   [medley.core :as m]
   [metabase.shared.util.i18n :refer [tru] :as i18n]
   [metabase.shared.util.namespaces :as u.ns]
   [metabase.util.format :as u.format]
   [metabase.util.log :as log]
   [metabase.util.memoize :as memoize]
   [net.cgrand.macrovich :as macros]
   [weavejester.dependency :as dep]
   #?@(:clj  ([clojure.math.numeric-tower :as math]
              [me.flowthing.pp :as pp]
              [metabase.config :as config]
              #_{:clj-kondo/ignore [:discouraged-namespace]}
              [metabase.util.jvm :as u.jvm]
              [metabase.util.string :as u.str]
              [potemkin :as p]
              [ring.util.codec :as codec])))
  #?(:clj (:import
           (java.text Normalizer Normalizer$Form)
           (java.util Locale)
           (org.apache.commons.validator.routines RegexValidator UrlValidator)))
  #?(:cljs (:require-macros [camel-snake-kebab.internals.macros :as csk.macros]
                            [metabase.util])))

(u.ns/import-fns
  [u.format colorize format-bytes format-color format-milliseconds format-nanoseconds format-seconds])

#?(:clj (p/import-vars [u.jvm
                        all-ex-data
                        auto-retry
                        decode-base64
                        decode-base64-to-bytes
                        deref-with-timeout
                        encode-base64
                        filtered-stacktrace
                        full-exception-chain
                        generate-nano-id
                        host-port-up?
                        host-up?
                        ip-address?
                        metabase-namespace-symbols
                        sorted-take
                        varargs
                        with-timeout
                        with-us-locale]
                       [u.str
                        build-sentence]))

(defmacro or-with
  "Like or, but determines truthiness with `pred`."
  {:style/indent 1}
  [pred & more]
  (reduce (fn [inner value]
            `(let [value# ~value]
               (if (~pred value#)
                 value#
                 ~inner)))
          nil
          (reverse more)))

(defmacro ignore-exceptions
  "Simple macro which wraps the given expression in a try/catch block and ignores the exception if caught."
  {:style/indent 0}
  [& body]
  `(try ~@body (catch ~(macros/case
                         :cljs 'js/Error
                         :clj  'Throwable)
                      ~'_)))

;; TODO -- maybe renaming this to `adoto` or `doto<>` or something would be a little clearer.
(defmacro prog1
  "Execute `first-form`, then any other expressions in `body`, presumably for side-effects; return the result of
  `first-form`.

    (def numbers (atom []))

    (defn find-or-add [n]
      (or (first-index-satisfying (partial = n) @numbers)
          (prog1 (count @numbers)
            (swap! numbers conj n))))

    (find-or-add 100) -> 0
    (find-or-add 200) -> 1
    (find-or-add 100) -> 0

   The result of `first-form` is bound to the anaphor `<>`, which is convenient for logging:

     (prog1 (some-expression)
       (println \"RESULTS:\" <>))

  `prog1` is an anaphoric version of the traditional macro of the same name in
   [Emacs Lisp](http://www.gnu.org/software/emacs/manual/html_node/elisp/Sequencing.html#index-prog1)
   and [Common Lisp](http://www.lispworks.com/documentation/HyperSpec/Body/m_prog1c.htm#prog1).

  Style note: Prefer `doto` when appropriate, e.g. when dealing with Java objects."
  {:style/indent :defn}
  [first-form & body]
  `(let [~'<> ~first-form]
     ~@body
     ~'<>))

(defn error
  "Takes a message string and returns a basic exception: [[java.lang.Exception]] on JVM and [[Error]] in JS."
  [^String msg]
  #?(:clj  (Exception. msg)
     :cljs (js/Error. msg)))

(defn qualified-name
  "Return `k` as a string, qualified by its namespace, if any (unlike `name`). Handles `nil` values gracefully as well
  (also unlike `name`).

     (u/qualified-name :type/FK) -> \"type/FK\""
  [k]
  (when (some? k)
    (if-let [namespac (when #?(:clj  (instance? clojure.lang.Named k)
                               :cljs (satisfies? INamed k))
                        (namespace k))]
      (str namespac "/" (name k))
      (name k))))

(defn remove-nils
  "Given a map, returns a new map with all nil values removed."
  [m]
  (m/filter-vals some? m))

(defn recursive-map-keys
  "Recursively replace the keys in a map with the value of `(f key)`."
  [f m]
  (walk/postwalk
   #(if (map? %)
      (m/map-keys f %)
      %)
   m))

(defn add-period
  "Fixes strings that don't terminate in a period; also accounts for strings
  that end in `:`. Used for formatting docs."
  [s]
  (let [text (str s)]
    (if (or (str/blank? text)
            (#{\. \? \!} (last text)))
      text
      (if (str/ends-with? text ":")
        (str (subs text 0 (- (count text) 1)) ".")
        (str text ".")))))

(defn lower-case-en
  "Locale-agnostic version of [[clojure.string/lower-case]]. [[clojure.string/lower-case]] uses the default locale in
  conversions, turning `ID` into `ıd`, in the Turkish locale. This function always uses the `en-US` locale."
  ^String [s]
  (when s
    #?(:clj  (.toLowerCase (str s) (Locale/US))
       :cljs (.toLowerCase (str s)))))

(defn upper-case-en
  "Locale-agnostic version of `clojure.string/upper-case`.
  `clojure.string/upper-case` uses the default locale in conversions, turning
  `id` into `İD`, in the Turkish locale. This function always uses the
  `en-US` locale."
  ^String [s]
  (when s
    #?(:clj  (.toUpperCase (str s) (Locale/US))
       :cljs (.toUpperCase (str s)))))

(defn capitalize-en
  "Locale-agnostic version of [[clojure.string/capitalize]]."
  ^String [^CharSequence s]
  (when-let [s (some-> s str)]
    (if (< (count s) 2)
      (upper-case-en s)
      (str (upper-case-en (subs s 0 1))
           (lower-case-en (subs s 1))))))

;;; define custom CSK conversion functions so we don't run into problems if the system locale is Turkish

;; so Kondo doesn't complain
(declare ^:private ->kebab-case-en*)
(declare ^:private ->camelCaseEn*)
(declare ^:private ->snake_case_en*)
(declare ^:private ->SCREAMING_SNAKE_CASE_EN*)

(csk.macros/defconversion "kebab-case-en*"           lower-case-en lower-case-en "-")
(csk.macros/defconversion "camelCaseEn*"             lower-case-en capitalize-en "")
(csk.macros/defconversion "snake_case_en*"           lower-case-en lower-case-en "_")
(csk.macros/defconversion "SCREAMING_SNAKE_CASE_EN*" upper-case-en upper-case-en "_")

(defn- wrap-csk-conversion-fn-to-handle-nil-and-namespaced-keywords
  "Wrap a CSK defconversion function so that it handles nil and namespaced keywords, which it doesn't support out of the
  box for whatever reason."
  [f]
  (fn [x]
    (when x
      (if (qualified-keyword? x)
        (keyword (f (namespace x)) (f (name x)))
        (f x)))))

(def ^{:arglists '([x])} ->kebab-case-en
  "Like [[camel-snake-kebab.core/->kebab-case]], but always uses English for lower-casing, supports keywords with
  namespaces, and returns `nil` when passed `nil` (rather than throwing an exception)."
  (memoize/lru (wrap-csk-conversion-fn-to-handle-nil-and-namespaced-keywords ->kebab-case-en*) :lru/threshold 256))

(def ^{:arglists '([x])} ->snake_case_en
  "Like [[camel-snake-kebab.core/->snake_case]], but always uses English for lower-casing, supports keywords with
  namespaces, and returns `nil` when passed `nil` (rather than throwing an exception)."
  (memoize/lru (wrap-csk-conversion-fn-to-handle-nil-and-namespaced-keywords ->snake_case_en*) :lru/threshold 256))

(def ^{:arglists '([x])} ->camelCaseEn
  "Like [[camel-snake-kebab.core/->camelCase]], but always uses English for upper- and lower-casing, supports keywords
  with namespaces, and returns `nil` when passed `nil` (rather than throwing an exception)."
  (memoize/lru (wrap-csk-conversion-fn-to-handle-nil-and-namespaced-keywords ->camelCaseEn*) :lru/threshold 256))


(def ^{:arglists '([x])} ->SCREAMING_SNAKE_CASE_EN
  "Like [[camel-snake-kebab.core/->SCREAMING_SNAKE_CASE]], but always uses English for upper- and lower-casing, supports
  keywords with namespaces, and returns `nil` when passed `nil` (rather than throwing an exception)."
  (memoize/lru (wrap-csk-conversion-fn-to-handle-nil-and-namespaced-keywords ->SCREAMING_SNAKE_CASE_EN*)
               :lru/threshold 256))

(defn capitalize-first-char
  "Like string/capitalize, only it ignores the rest of the string
  to retain case-sensitive capitalization, e.g., PostgreSQL."
  [s]
  (if (< (count s) 2)
    (upper-case-en s)
    (str (upper-case-en (subs s 0 1))
         (subs s 1))))

(defn snake-keys
  "Convert the keys in a map from `kebab-case` to `snake_case`."
  [m]
  (recursive-map-keys ->snake_case_en m))

(defn normalize-map
  "Given any map-like object, return it as a Clojure map with :kebab-case keyword keys.
  The input map can be a:
  - Clojure map with string or keyword keys,
  - JS object (with string keys)
  The keys are converted to `kebab-case` from `camelCase` or `snake_case` as necessary, and turned into keywords.

  Returns an empty map if nil is input (like [[update-keys]])."
  [m]
  (let [base #?(:clj  m
                ;; If we're running in CLJS, convert to a ClojureScript map as needed.
                :cljs (if (object? m)
                        (js->clj m)
                        m))]
    (update-keys base (comp keyword ->kebab-case-en))))

;; Log the maximum memory available to the JVM at launch time as well since it is very handy for debugging things
#?(:clj
   (when-not *compile-files*
     (log/info (i18n/trs "Maximum memory available to JVM: {0}" (u.format/format-bytes (.maxMemory (Runtime/getRuntime)))))))

;; Set the default width for pprinting to 120 instead of 72. The default width is too narrow and wastes a lot of space
#?(:clj  (alter-var-root #'pprint/*print-right-margin* (constantly 120))
   :cljs (set! pprint/*print-right-margin* (constantly 120)))

(defn email?
  "Is `s` a valid email address string?"
  ^Boolean [^String s]
  (boolean (when (string? s)
             (re-matches #"[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                         (lower-case-en s)))))

(defn state?
  "Is `s` a state string?"
  ^Boolean [s]
  (boolean
   (when (string? s)
     (contains? #{"alabama" "alaska" "arizona" "arkansas" "california" "colorado" "connecticut" "delaware"
                  "florida" "georgia" "hawaii" "idaho" "illinois" "indiana" "iowa" "kansas" "kentucky" "louisiana"
                  "maine" "maryland" "massachusetts" "michigan" "minnesota" "mississippi" "missouri" "montana"
                  "nebraska" "nevada" "new hampshire" "new jersey" "new mexico" "new york" "north carolina"
                  "north dakota" "ohio" "oklahoma" "oregon" "pennsylvania" "rhode island" "south carolina"
                  "south dakota" "tennessee" "texas" "utah" "vermont" "virginia" "washington" "west virginia"
                  "wisconsin" "wyoming"
                  "ak" "al" "ar" "az" "ca" "co" "ct" "de" "fl" "ga" "hi" "ia" "id" "il" "in" "ks" "ky" "la"
                  "ma" "md" "me" "mi" "mn" "mo" "ms" "mt" "nc" "nd" "ne" "nh" "nj" "nm" "nv" "ny" "oh" "ok"
                  "or" "pa" "ri" "sc" "sd" "tn" "tx" "ut" "va" "vt" "wa" "wi" "wv" "wy"}
                (lower-case-en s)))))

(def ^:private ^String url-regex-pattern
  (let [alpha #?(:clj "IsAlphabetic" :cljs "Alphabetic")]
    (str "^[\\p{" alpha "}\\d_\\-]+(\\.[\\p{" alpha "}\\d_\\-]+)*(:\\d*)?")))

(defn url?
  "Is `s` a valid HTTP/HTTPS URL string?"
  ^Boolean [s]
  #?(:clj  (let [validator (UrlValidator. (u.jvm/varargs String ["http" "https"])
                                          (RegexValidator. url-regex-pattern)
                                          UrlValidator/ALLOW_LOCAL_URLS)]
             (.isValid validator (str s)))
     :cljs (try
             (let [url (js/URL. (str s))]
               (boolean (and (re-matches (js/RegExp. url-regex-pattern "u")
                                         (.-host url))
                             (#{"http:" "https:"} (.-protocol url)))))
             (catch js/Error _
               false))))

(defn maybe?
  "Returns `true` if X is `nil`, otherwise calls (F X).
   This can be used to see something is either `nil` or statisfies a predicate function:

     (string? nil)          -> false
     (string? \"A\")        -> true
     (maybe? string? nil)   -> true
     (maybe? string? \"A\") -> true

   It can also be used to make sure a given function won't throw a `NullPointerException`:

     (str/lower-case nil)            -> NullPointerException
     (str/lower-case \"ABC\")        -> \"abc\"
     (maybe? str/lower-case nil)     -> true
     (maybe? str/lower-case \"ABC\") -> \"abc\"

   The latter use-case can be useful for things like sorting where some values in a collection
   might be `nil`:

     (sort-by (partial maybe? s/lower-case) some-collection)"
  [f x]
  (or (nil? x)
      (f x)))

(def ^String ^{:arglists '([emoji-string])} emoji
  "Returns the `emoji-string` passed in if emoji in logs are enabled, otherwise always returns an empty string."
  #?(:clj  (if (config/config-bool :mb-emoji-in-logs)
             identity
             (constantly ""))
     :cljs (constantly "")))

(defn round-to-decimals
  "Round (presumabily floating-point) `number` to `decimal-place`. Returns a `Double`.

  Rounds by decimal places, no matter how many significant figures the number has. See [[round-to-precision]].

    (round-to-decimals 2 35.5058998M) -> 35.51"
  ^Double [^Integer decimal-place, ^Number number]
  {:pre [(integer? decimal-place) (number? number)]}
  #?(:clj  (double (.setScale (bigdec number) decimal-place BigDecimal/ROUND_HALF_UP))
     :cljs (parse-double (.toFixed number decimal-place))))

(defn real-number?
  "Is `x` a real number (i.e. not a `NaN` or an `Infinity`)?"
  [x]
  (and (number? x)
       (not (NaN? x))
       (not (infinite? x))))

(defn remove-diacritical-marks
  "Return a version of `s` with diacritical marks removed."
  ^String [^String s]
  (when (seq s)
    #?(:clj  (str/replace
               ;; First, "decompose" the characters. e.g. replace 'LATIN CAPITAL LETTER A WITH ACUTE' with
               ;; 'LATIN CAPITAL LETTER A' + 'COMBINING ACUTE ACCENT'
               ;; See http://docs.oracle.com/javase/8/docs/api/java/text/Normalizer.html
              (Normalizer/normalize s Normalizer$Form/NFD)
               ;; next, remove the combining diacritical marks -- this SO answer explains what's going on here best:
               ;; http://stackoverflow.com/a/5697575/1198455 The closest thing to a relevant JavaDoc I could find was
               ;; http://docs.oracle.com/javase/7/docs/api/java/lang/Character.UnicodeBlock.html#COMBINING_DIACRITICAL_MARKS
              #"\p{Block=CombiningDiacriticalMarks}+"
              "")
       :cljs (-> s
                 (.normalize "NFKD")  ;; Renders accented characters as base + accent.
                 (.replace (js/RegExp. "[\u0300-\u036f]" "gu") ""))))) ;; Drops all the accents.

(def ^:private slugify-valid-chars
  "Valid *ASCII* characters for URL slugs generated by `slugify`."
  #{\a \b \c \d \e \f \g \h \i \j \k \l \m \n \o \p \q \r \s \t \u \v \w \x \y \z
    \0 \1 \2 \3 \4 \5 \6 \7 \8 \9
    \_})

;; unfortunately it seems that this doesn't fully-support Emoji :(, they get encoded as "??"
(defn- slugify-char [^Character c url-encode?]
  (if (< #?(:clj (int c) :cljs (.charCodeAt c 0))
         128)
    ;; ASCII characters must be in the valid list, or they get replaced with underscores.
    (if (contains? slugify-valid-chars c)
      c
      \_)
    ;; Non-ASCII characters are URL-encoded or preserved, based on the option.
    (if url-encode?
      #?(:clj  (codec/url-encode c)
         :cljs (js/encodeURIComponent c))
      c)))

(defn slugify
  "Return a version of String `s` appropriate for use as a URL slug.
  Downcase the name and remove diacritcal marks, and replace non-alphanumeric *ASCII* characters with underscores.

  If `unicode?` is falsy (the default), URL-encode non-ASCII characters. With `unicode?` truthy, non-ASCII characters
  are preserved.
  (Even when we want full ASCII output for eg. URL slugs, non-ASCII characters should be encoded rather than
  replaced with underscores in order to support languages that don't use the Latin alphabet; see metabase#3818).

  Optionally specify `:max-length` which will truncate the slug after that many characters."
  (^String [^String s]
   (slugify s {}))
  (^String [s {:keys [max-length unicode?]}]
   (when (seq s)
     (let [slug (str/join (for [c (remove-diacritical-marks (lower-case-en s))]
                            (slugify-char c (not unicode?))))]
       (if max-length
         (str/join (take max-length slug))
         slug)))))

(defn id
  "If passed an integer ID, returns it. If passed a map containing an `:id` key, returns the value if it is an integer.
  Otherwise returns `nil`.

  Provided as a convenience to allow model-layer functions to easily accept either an object or raw ID. Use this in
  cases where the ID/object is allowed to be `nil`. Use `the-id` below in cases where you would also like to guarantee
  it is non-`nil`."
  ^Integer [object-or-id]
  (cond
    (map? object-or-id)     (recur (:id object-or-id))
    (integer? object-or-id) object-or-id))

(defn the-id
  "If passed an integer ID, returns it. If passed a map containing an `:id` key, returns the value if it is an integer.
  Otherwise, throws an Exception.

  Provided as a convenience to allow model-layer functions to easily accept either an object or raw ID, and to assert
  that you have a valid ID."
  ;; TODO - lots of functions can be rewritten to use this, which would make them more flexible
  ^Integer [object-or-id]
  (or (id object-or-id)
      (throw (error (tru "Not something with an ID: {0}" (pr-str object-or-id))))))

(def ^java.util.regex.Pattern uuid-regex
  "A regular expression for matching canonical string representations of UUIDs."
  #"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")

(defn one-or-many
  "Wraps a single element in a sequence; returns sequences as-is. In lots of situations we'd like to accept either a
  single value or a collection of values as an argument to a function, and then loop over them; rather than repeat
  logic to check whether something is a collection and wrap if not everywhere, this utility function is provided for
  your convenience.

    (u/one-or-many 1)     ; -> [1]
    (u/one-or-many [1 2]) ; -> [1 2]"
  [arg]
  (if ((some-fn sequential? set? nil?) arg)
    arg
    [arg]))

(defn many-or-one
  "Returns coll if it has multiple elements, or else returns its only element"
  [coll]
  (if (next coll)
    coll
    (first coll)))

(defn select-nested-keys
  "Like `select-keys`, but can also handle nested keypaths:

     (select-nested-keys {:a 100, :b {:c 200, :d 300}} [:a [:b :d] :c])
     ;; -> {:a 100, :b {:d 300}}

   The values of `keyseq` can be either regular keys, which work the same way as `select-keys`,
   or vectors of the form `[k & nested-keys]`, which call `select-nested-keys` recursively
   on the value of `k`. "
  [m keyseq]
  ;; TODO - use (empty m) once supported by model instances
  (into {} (for [k     keyseq
                 :let  [[k & nested-keys] (one-or-many k)
                        v                 (get m k)]
                 :when (contains? m k)]
             {k (if-not (seq nested-keys)
                  v
                  (select-nested-keys v nested-keys))})))

(defn base64-string?
  "Is `s` a Base-64 encoded string?"
  ^Boolean [s]
  (boolean (when (string? s)
             (as-> s s
               (str/replace s #"\s" "")
               (re-matches #"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$" s)))))

(defn batches-of
  "Returns coll split into seqs of up to n items"
  [n coll]
  (partition n n nil coll))

(def ^{:arglists '([n])} safe-inc
  "Increment `n` if it is non-`nil`, otherwise return `1` (e.g. as if incrementing `0`)."
  (fnil inc 0))

(defn select-non-nil-keys
  "Like `select-keys`, but returns a map only containing keys in KS that are present *and non-nil* in M.

     (select-non-nil-keys {:a 100, :b nil} #{:a :b :c})
     ;; -> {:a 100}"
  [m ks]
  (into {} (for [k     ks
                 :when (some? (get m k))]
             {k (get m k)})))

(defn select-keys-when
  "Returns a map that only contains keys that are either `:present` or `:non-nil`. Combines behavior of `select-keys`
  and `select-non-nil-keys`. This is useful for API endpoints that update a model, which often have complex rules
  about what gets updated (some keys are updated if `nil`, others only if non-nil).

     (select-keys-when {:a 100, :b nil, :d 200, :e nil}
       :present #{:a :b :c}
       :non-nil #{:d :e :f})
     ;; -> {:a 100, :b nil, :d 200}"
  {:style/indent 1}
  [m & {:keys [present non-nil], :as options}]
  {:pre [(every? #{:present :non-nil} (keys options))]}
  (merge (select-keys m present)
         (select-non-nil-keys m non-nil)))

(defn order-of-magnitude
  "Return the order of magnitude as a power of 10 of a given number."
  [x]
  (if (zero? x)
    0
    #?(:clj  (long (math/floor (/ (Math/log (math/abs x))
                                  (Math/log 10))))
       :cljs (js/Math.floor (/ (js/Math.log (abs x))
                               (js/Math.log 10))))))

(defn index-of
  "Return index of the first element in `coll` for which `pred` reutrns true."
  [pred coll]
  (first (keep-indexed (fn [i x]
                         (when (pred x) i))
                       coll)))

(defn hexadecimal-string?
  "Returns truthy if `new-value` is a hexadecimal-string"
  [new-value]
  (and (string? new-value)
       (re-matches #"[0-9a-f]{64}" new-value)))

(defn topological-sort
  "Topologically sorts vertexs in graph g. Graph is a map of vertexs to edges. Optionally takes an
   additional argument `edges-fn`, a function used to extract edges. Returns data in the same shape
   (a graph), only sorted.

   Say you have a graph shaped like:

     a     b
     | \\  |
     c  |  |
     \\ | /
        d
        |
        e

   (u/topological-sort identity {:b []
                                 :c [:a]
                                 :e [:d]
                                 :d [:a :b :c]
                                 :a []})

   => (ordered-map :a [] :b [] :c [:a] :d [:a :b :c] :e [:d])

   If the graph has cycles, throws an exception.

   https://en.wikipedia.org/wiki/Topological_sorting"
  ([g] (topological-sort identity g))
  ([edges-fn g]
   (transduce (map (juxt key (comp edges-fn val)))
              (fn
                ([] (dep/graph))
                ([acc [vertex edges]]
                 (reduce (fn [acc edge]
                           (dep/depend acc vertex edge))
                         acc
                         edges))
                ([acc]
                 (let [sorted      (filter g (dep/topo-sort acc))
                       independent (set/difference (set (keys g)) (set sorted))]
                   (not-empty
                    (into (ordered-map)
                          (map (fn [vertex]
                                 [vertex (g vertex)]))
                          (concat independent sorted))))))
              g)))

(defn lower-case-map-keys
  "Changes the keys of a given map to lower case."
  [m]
  (update-keys m #(-> % name lower-case-en keyword)))

(defn pprint-to-str
  "Returns the output of pretty-printing `x` as a string.
  Optionally accepts `color-symb`, which colorizes the output (JVM only, it's ignored in CLJS).

     (pprint-to-str 'green some-obj)"
  (^String [x]
   (#?@
    (:clj
     (with-out-str
       #_{:clj-kondo/ignore [:discouraged-var]}
       (pp/pprint x {:max-width 120}))

     :cljs
     ;; we try to set this permanently above, but it doesn't seem to work in Cljs, so just bind it every time. The
     ;; default value wastes too much space, 120 is a little easier to read actually.
     (binding [pprint/*print-right-margin* 120]
       (with-out-str
         #_{:clj-kondo/ignore [:discouraged-var]}
         (pprint/pprint x))))))

  (^String [color-symb x]
   (u.format/colorize color-symb (pprint-to-str x))))

(def ^:dynamic *profile-level*
  "Impl for `profile` macro -- don't use this directly. Nesting-level for the `profile` macro e.g. 0 for a top-level
  `profile` form or 1 for a form inside that."
  0)

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn -profile-print-time
  "Impl for [[profile]] macro -- don't use this directly. Prints the `___ took ___` message at the conclusion of a
  [[profile]]d form."
  [message-thunk start-time]
  ;; indent the message according to [[*profile-level*]] and add a little down-left arrow so it (hopefully) points to
  ;; the parent form
  (log/info (u.format/format-color
             (case (int (mod *profile-level* 4))
               0 :green
               1 :cyan
               2 :magenta
               3 :yellow) "%s%s took %s"
             (if (pos? *profile-level*)
               (str (str/join (repeat (dec *profile-level*) "  ")) " ⮦ ")
               "")
             (message-thunk)
             (u.format/format-nanoseconds (- #?(:cljs (* 1000000 (js/performance.now))
                                                :clj  (System/nanoTime))
                                             start-time)))))

(defmacro profile
  "Like [[clojure.core/time]], but lets you specify a `message` that gets printed with the total time, formats the
  time nicely using `u/format-nanoseconds`, and indents nested calls to `profile`.

    (profile \"top-level\"
      (Thread/sleep 500)
      (profile \"nested\"
        (Thread/sleep 100)))
    ;; ->
     ↙ nested took 100.1 ms
    top-level took 602.8 ms"
  {:style/indent 1}
  ([form]
   `(profile ~(str form) ~form))
  ([message & body]
   ;; message is wrapped in a thunk so we don't incur the overhead of calculating it if the log level does not include
   ;; INFO
   `(let [message#    (fn [] ~message)
          start-time# ~(if (:ns &env)
                         `(* 1000000 (js/performance.now)) ;; CLJS
                         `(System/nanoTime))               ;; CLJ
          result#     (binding [*profile-level* (inc *profile-level*)]
                        ~@body)]
      (-profile-print-time message# start-time#)
      result#)))

(defn seconds->ms
  "Convert `seconds` to milliseconds. More readable than doing this math inline."
  [seconds]
  (* seconds 1000))

(defn minutes->seconds
  "Convert `minutes` to seconds. More readable than doing this math inline."
  [minutes]
  (* 60 minutes))

(defn minutes->ms
  "Convert `minutes` to milliseconds. More readable than doing this math inline."
  [minutes]
  (-> minutes minutes->seconds seconds->ms))

(defn hours->ms
  "Convert `hours` to milliseconds. More readable than doing this math inline."
  [hours]
  (-> (* 60 hours) minutes->seconds seconds->ms))

(defn parse-currency
  "Parse a currency String to a BigDecimal. Handles a variety of different formats, such as:

    $1,000.00
    -£127.54
    -127,54 €
    kr-127,54
    € 127,54-
    ¥200"
  ^java.math.BigDecimal [^String s]
  (when-not (str/blank? s)
    (#?(:clj bigdec :cljs js/parseFloat)
     (reduce
      (partial apply str/replace)
      s
      [;; strip out any current symbols
       [#"[^\d,.-]+"          ""]
       ;; now strip out any thousands separators
       [#"(?<=\d)[,.](\d{3})" "$1"]
       ;; now replace a comma decimal seperator with a period
       [#","                  "."]
       ;; move minus sign at end to front
       [#"(^[^-]+)-$"         "-$1"]]))))

(defn email->domain
  "Extract the domain portion of an `email-address`.

    (email->domain \"cam@toucan.farm\") ; -> \"toucan.farm\""
  ^String [email-address]
  (when (string? email-address)
    (last (re-find #"^.*@(.*$)" email-address))))

(defn email-in-domain?
  "Is `email-address` in `domain`?

    (email-in-domain? \"cam@toucan.farm\" \"toucan.farm\")  ; -> true
    (email-in-domain? \"cam@toucan.farm\" \"metabase.com\") ; -> false"
  [email-address domain]
  {:pre [(email? email-address)]}
  (= (email->domain email-address) domain))

(defn pick-first
  "Returns a pair [match others] where match is the first element of `coll` for which `pred` returns
  a truthy value and others is a sequence of the other elements of `coll` with the order preserved.
  Returns nil if no element satisfies `pred`."
  [pred coll]
  (loop [xs (seq coll), prefix []]
    (when-let [[x & xs] xs]
      (if (pred x)
        [x (concat prefix xs)]
        (recur xs (conj prefix x))))))

;;; Clj doesn't have `regexp?`, but Cljs does
#?(:clj (defn- regexp? [x]
          (instance? java.util.regex.Pattern x)))

(derive :dispatch-type/nil        :dispatch-type/*)
(derive :dispatch-type/boolean    :dispatch-type/*)
(derive :dispatch-type/string     :dispatch-type/*)
(derive :dispatch-type/keyword    :dispatch-type/*)
(derive :dispatch-type/number     :dispatch-type/*)
(derive :dispatch-type/integer    :dispatch-type/number)
(derive :dispatch-type/map        :dispatch-type/*)
(derive :dispatch-type/sequential :dispatch-type/*)
(derive :dispatch-type/set        :dispatch-type/*)
(derive :dispatch-type/symbol     :dispatch-type/*)
(derive :dispatch-type/fn         :dispatch-type/*)
(derive :dispatch-type/regex      :dispatch-type/*)

(defn dispatch-type-keyword
  "In Cljs `(type 1) is `js/Number`, but `(isa? 1 js/Number)` isn't truthy, so dispatching off of [[clojure.core/type]]
  doesn't really work the way we'd want. Also, type names are different between Clojure and ClojureScript.

  This function exists as a workaround: use it as a multimethod dispatch function for Cljc multimethods that would
  have dispatched on `type` if they were written in pure Clojure.

  Returns `:dispatch-type/*` if there is no mapping for the current type, but you can add more as needed if
  appropriate. All type keywords returned by this method also derive from `:dispatch-type/*`, meaning you can write an
  implementation for `:dispatch-type/*` and use it as a fallback method.

  Think of `:dispatch-type/*` as similar to how you would use `Object` if you were dispatching
  off of `type` in pure Clojure."
  [x]
  (cond
    (nil? x)        :dispatch-type/nil
    (boolean? x)    :dispatch-type/boolean
    (string? x)     :dispatch-type/string
    (keyword? x)    :dispatch-type/keyword
    (integer? x)    :dispatch-type/integer
    (number? x)     :dispatch-type/number
    (map? x)        :dispatch-type/map
    (sequential? x) :dispatch-type/sequential
    (set? x)        :dispatch-type/set
    (symbol? x)     :dispatch-type/symbol
    (fn? x)         :dispatch-type/fn
    (regexp? x)     :dispatch-type/regex
    ;; we should add more mappings here as needed
    :else           :dispatch-type/*))

(defn assoc-dissoc
  "Called like `(assoc m k v)`, this does [[assoc]] if `(some? v)`, and [[dissoc]] if not.

  Put another way: `k` will either be set to `v`, or removed.

  Note that if `v` is `false`, it will be handled with [[assoc]]; only `nil` causes a [[dissoc]]."
  [m k v]
  (if (some? v)
    (assoc m k v)
    (dissoc m k)))

(defn assoc-default
  "Called like `(assoc m k v)`, this does [[assoc]] iff `m` does not contain `k`
  and `v` is not nil. Can be called with multiple key value pairs. If a key occurs
  more than once, only the first occurrence with a non-nil value is used."
  ([m k v]
   (if (or (nil? v) (contains? m k))
     m
     (assoc m k v)))
  ([m k v & kvs]
   (let [ret (assoc-default m k v)]
     (if kvs
       (if (next kvs)
         (recur ret (first kvs) (second kvs) (nnext kvs))
         (throw (ex-info "assoc-default expects an even number of key-values"
                         {:kvs kvs})))
       ret))))

(defn classify-changes
  "Given 2 lists of seq maps of changes, where each map an has an `id` key,
  return a map of 3 keys: `:to-create`, `:to-update`, `:to-delete`.

  Where:
  :to-create is a list of maps that ids in `new-items`
  :to-update is a list of maps that has ids in both `current-items` and `new-items`
  :to delete is a list of maps that has ids only in `current-items`"
  [current-items new-items]
  (let [[delete-ids create-ids update-ids] (diff (set (map :id current-items))
                                                 (set (map :id new-items)))]
    {:to-create (when (seq create-ids) (filter #(create-ids (:id %)) new-items))
     :to-delete (when (seq delete-ids) (filter #(delete-ids (:id %)) current-items))
     :to-update (when (seq update-ids) (filter #(update-ids (:id %)) new-items))}))

(defn empty-or-distinct?
  "True if collection `xs` is either [[empty?]] or all values are [[distinct?]]."
  [xs]
  (or (empty? xs)
      (apply distinct? xs)))

(defn traverse
  "Traverses a graph of nodes using a user-defined function.

  `nodes`: A collection of initial nodes to start the traversal from.
  `traverse-fn`: A function that, given a node, returns its directly connected nodes.

  The function performs a breadth-first traversal starting from the initial nodes, applying
  `traverse-fn` to each node to find connected nodes, and continues until all reachable nodes
  have been visited. Returns a set of all traversed nodes."
  [nodes traverse-fn]
  (loop [to-traverse (set nodes)
         traversed   #{}]
    (let [item        (first to-traverse)
          found       (traverse-fn item)
          traversed   (conj traversed item)
          to-traverse (set/union (disj to-traverse item) (set/difference found traversed))]
      (if (empty? to-traverse)
        traversed
        (recur to-traverse traversed)))))

(defn reverse-compare
  "A reversed java.util.Comparator, useful for sorting elements in descending in order"
  [x y]
  (compare y x))

(defn conflicting-keys
  "Given two maps, return a seq of the keys on which they disagree. We only consider keys that are present in both."
  [m1 m2]
  (keep (fn [[k v]] (when (not= v (get m1 k v)) k)) m2))

(defn conflicting-keys?
  "Given two maps, are any keys on which they disagree? We only consider keys that are present in both."
  [m1 m2]
  (boolean (some identity (conflicting-keys m1 m2))))

(defn assoc-existing
  "Updates a value in a map to a given value, if and only if the key already exists in the map.
   See: [[clojure.core/assoc]] and [[medley.core/update-existing]]."
  [m k v]
  (if (contains? m k)
    (assoc m k v)
    m))
