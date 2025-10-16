(ns metabase.lib.util.unique-name-generator
  (:require
   #?@(:cljs
       (["crc-32" :as CRC32]))
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def ^:private truncate-alias-max-length-bytes
  "Length to truncate column and table identifiers to. See [[metabase.driver.impl/default-alias-max-length-bytes]] for
  reasoning."
  60)

(def ^:private truncated-alias-hash-suffix-length
  "Length of the hash suffixed to truncated strings by [[truncate-alias]]."
  ;; 8 bytes for the CRC32 plus one for the underscore
  9)

(mu/defn- crc32-checksum :- [:string {:min 8, :max 8}]
  "Return a 4-byte CRC-32 checksum of string `s`, encoded as an 8-character hex string."
  [s :- :string]
  (let [s #?(:clj (Long/toHexString (.getValue (doto (java.util.zip.CRC32.)
                                                 (.update (.getBytes ^String s "UTF-8")))))
             :cljs (-> (CRC32/str s 0)
                       (unsigned-bit-shift-right 0) ; see https://github.com/SheetJS/js-crc32#signed-integers
                       (.toString 16)))]
    ;; pad to 8 characters if needed. Might come out as less than 8 if the first byte is `00` or `0x` or something.
    (loop [s s]
      (if (< (count s) 8)
        (recur (str \0 s))
        s))))

(mu/defn truncate-alias :- [:string {:min 1, :max 60}]
  "Truncate string `s` if it is longer than [[truncate-alias-max-length-bytes]] and append a hex-encoded CRC-32
  checksum of the original string. Truncated string is truncated to [[truncate-alias-max-length-bytes]]
  minus [[truncated-alias-hash-suffix-length]] characters so the resulting string is
  exactly [[truncate-alias-max-length-bytes]]. The goal here is that two really long strings that only differ at the
  end will still have different resulting values.

    (truncate-alias \"some_really_long_string\" 15) ;   -> \"some_r_8e0f9bc2\"
    (truncate-alias \"some_really_long_string_2\" 15) ; -> \"some_r_2a3c73eb\""
  ([s]
   (truncate-alias s truncate-alias-max-length-bytes))

  ([s         :- ::lib.schema.common/non-blank-string
    max-bytes :- [:int {:min 0}]]
   (if (<= (u/string-byte-count s) max-bytes)
     s
     (let [checksum  (crc32-checksum s)
           truncated (u/truncate-string-to-byte-count s (- max-bytes truncated-alias-hash-suffix-length))]
       (str truncated \_ checksum)))))

(mr/def ::unique-name-generator
  "Stateful function with the signature

    (f)        => 'fresh' unique name generator
    (f str)    => unique-str
    (f id str) => unique-str

  i.e. repeated calls with the same string should return different unique strings."
  [:function
   ;; (f) => generates a new instance of the unique name generator for recursive generation without 'poisoning the
   ;; well'.
   [:=>
    [:cat]
    [:ref ::unique-name-generator]]
   ;; (f str) => unique-str
   [:=>
    [:cat :string]
    ::lib.schema.common/non-blank-string]
   ;; (f id str) => unique-str
   [:=>
    [:cat :any :string]
    ::lib.schema.common/non-blank-string]])

(mu/defn- untruncated-unique-alias :- :string
  [original :- :string
   suffix   :- :string]
  (str original \_ suffix))

(mu/defn- truncated-unique-alias :- :string
  [original :- :string
   suffix   :- :string]
  (-> (untruncated-unique-alias original suffix)
      truncate-alias))

(mr/def ::unique-name-generator.options
  [:map
   {:closed true}
   [:truncate-fn     {:optional true, :default identity}                 [:=> [:cat :string] :string]]
   [:name-key-fn     {:optional true, :default identity}                 [:=> [:cat :string] :string]]
   [:unique-alias-fn {:optional true, :default untruncated-unique-alias} [:=> [:cat :string :string] :string]]])

(defn- -unique-name-generator
  [& {:keys [name-key-fn unique-alias-fn]
      :or   {name-key-fn     identity
             unique-alias-fn untruncated-unique-alias}}]
  (let [id+original->unique (atom {})   ; map of [id original-alias] -> unique-alias
        original->count     (atom {})]  ; map of original-alias -> count
    (fn generate-name
      ([an-alias]
       (generate-name (gensym) an-alias))

      ([id original]
       (let [name-key (name-key-fn original)]
         (or
          ;; if we already have generated an alias for this key (e.g. `[id original]`), return it as-is.
          (@id+original->unique [id name-key])
          ;; otherwise generate a new unique alias.
          ;; see if we're the first to try to use this candidate alias. Update the usage count in `original->count`
          (let [total-count (get (swap! original->count update name-key (fnil inc 0)) name-key)]
            (if (= total-count 1)
              ;; if we are the first to do it, record it in `id+original->unique` and return it.
              (do
                (swap! id+original->unique assoc [id name-key] original)
                original)
              ;; otherwise prefix the alias by the current total count (e.g. `id` becomes `id_2`) and recur. If `id_2`
              ;; is unused, it will get returned. Otherwise we'll recursively try `id_2_2`, and so forth.
              (let [candidate (unique-alias-fn original (str total-count))]
                ;; double-check that `unique-alias-fn` isn't doing something silly like truncating the generated alias
                ;; to aggressively or forgetting to include the `suffix` -- otherwise we could end up with an infinite
                ;; loop
                (assert (not= candidate original)
                        (str "unique-alias-fn must return a different string than its input. Input: "
                             (pr-str candidate)))
                (swap! id+original->unique assoc [id name-key] candidate)
                (recur id candidate))))))))))

(mu/defn unique-name-generator-with-options :- ::unique-name-generator
  "Return a function that can be used to uniquify string names. Function maintains an internal counter that will suffix
  any names passed to it as needed so all results will be unique.

    (let [unique-name (unique-name-generator)]
      [(unique-name \"A\")
       (unique-name \"B\")
       (unique-name \"A\")])
    ;; -> [\"A\" \"B\" \"A_2\"]

  By default, unique aliases are generated for each unique `[id original-name]` key pair. By default, a unique `id` is
  generated for every call, meaning repeated calls to [[unique-name-generator]] with the same `original-name` will
  return different unique aliases. If idempotence is desired, the function returned by the generator also has a 2
  airity version with the signature

    (unique-name-fn id original-name)

  for example:

    (let [unique-name (unique-name-generator)]
      [(unique-name :x \"A\")
       (unique-name :x \"B\")
       (unique-name :x \"A\")
       (unique-name :y \"A\")])
    ;; -> [\"A\" \"B\" \"A\" \"A_2\"]

  Finally, [[unique-name-generator]] accepts the following options to further customize behavior:

  ### `:name-key-fn`

  Generated aliases are unique by the value of `[id (name-key-fn original-name)]`; the default is `identity`, so by
  default aliases are unique by `[id name-key-fn]`. Specify something custom here if you want to make the unique
  aliases unique by some other value, for example to make them unique without regards to case:

    (let [f (unique-name-generator :name-key-fn str/lower-case)]
      [(f \"x\")
       (f \"X\")
       (f \"X\")])
    ;; -> [\"x\" \"X_2\" \"X_3\"]

  This is useful for databases that treat column aliases as case-insensitive (see #19618 for some examples of this).

  ### `:unique-alias-fn`

  The function used to generate a potentially-unique alias given an original alias and unique suffix with the signature

    (unique-alias-fn original suffix)

  By default, combines them like `original_suffix`, but you can supply a custom function if you need to change this
  behavior:

    (let [f (unique-name-generator :unique-alias-fn (fn [x y] (format \"%s~~%s\" y x)))]
      [(f \"x\")
       (f \"x\")])
  ;; -> [\"x\" \"2~~x\"]

  This is useful if you need to constrain the generated suffix in some way, for example by limiting its length or
  escaping characters disallowed in a column alias.

  Values generated by this function are recursively checked for uniqueness, and will keep trying values a unique value
  is generated; for this reason the function *must* return a unique value for every unique input. Use caution when
  limiting the length of the identifier generated (consider appending a hash in cases like these).

  ### `:truncate-fn`

  Names are truncated with this function before passed to `unique-alias-fn`."
  [& {:keys [truncate-fn], :or {truncate-fn identity}, :as options} :- [:maybe ::unique-name-generator.options]]
  ;; ok to use here because this is the one designated wrapper for it.
  (let [f (-unique-name-generator options)]
    ;; I know we could just use `comp` here but it gets really hard to figure out where it's coming from when you're
    ;; debugging things; a named function like this makes it clear where this function came from
    (fn unique-name-generator-fn
      ([]
       (unique-name-generator-with-options options))
      ([s]
       (->> s truncate-fn f))
      ([id s]
       (->> s truncate-fn (f id))))))

(mu/defn- unique-name-generator-factory :- [:function
                                            [:=>
                                             [:cat]
                                             ::unique-name-generator]
                                            [:=>
                                             [:cat [:schema [:sequential :string]]]
                                             ::unique-name-generator]]
  [options :- ::unique-name-generator.options]
  (mu/fn :- ::unique-name-generator
    ([]
     (unique-name-generator-with-options options))
    ([existing-names :- [:sequential :string]]
     (let [f (unique-name-generator-with-options options)]
       (doseq [existing existing-names]
         (f existing))
       f))))

(def ^{:arglists '([] [existing-names])} unique-name-generator
  "Create a new function with the signature

    (f str) => str

  or

   (f id str) => str

  That takes any sort of string identifier (e.g. a column alias or table/join alias) and returns a guaranteed-unique
  name truncated to 60 characters (actually 51 characters plus a hash).

  Optionally takes a list of names which are already defined, \"priming\" the generator with eg. all the column names
  that currently exist on a stage of the query.

  The two-arity version of the returned function can be used for idempotence. See docstring
  for [[metabase.legacy-mbql.util/unique-name-generator]] for more information.

  New!

  You can call

    (f)

  to get a new, fresh unique name generator for recursive usage without 'poisoning the well'."
  ;; unique by lower-case name, e.g. `NAME` and `name` => `NAME` and `name_2`
   ;;
   ;; some databases treat aliases as case-insensitive so make sure the generated aliases are unique regardless of
   ;; case
  (unique-name-generator-factory
   {:truncate-fn     truncate-alias
    :name-key-fn     u/lower-case-en
    :unique-alias-fn truncated-unique-alias}))

(def ^{:arglists '([] [existing-names])} non-truncating-unique-name-generator
  "This is the same as [[unique-name-generator]] but doesn't truncate names, matching the 'classic' behavior in QP
  results metadata."
  (unique-name-generator-factory {}))
