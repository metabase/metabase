(ns metabase.driver.sql-jdbc.common
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(def ^:private valid-separator-styles #{:url :comma :semicolon})

(def ^:private ^:const default-name-value-separator "=")

(def ^:private separator-style->entry-separator {:comma ",", :semicolon ";", :url "&"})

(defn conn-str-with-additional-opts
  "Adds `additional-opts` (a string) to the given `connection-string` based on the given `separator-style`. See
  documentation for `handle-additional-options` for further details."
  {:added "0.41.0", :arglists '([connection-string separator-style additional-opts])}
  [connection-string separator-style additional-opts]
  {:pre [(string? connection-string)
         (or (nil? additional-opts) (string? additional-opts))
         (contains? valid-separator-styles separator-style)]}
  (str connection-string (when-not (str/blank? additional-opts)
                           (str (case separator-style
                                  :comma     ","
                                  :semicolon ";"
                                  :url       (if (str/includes? connection-string "?")
                                               "&"
                                               "?"))
                                additional-opts))))

(defn additional-opts->string
  "Turns a map of `additional-opts` into a single string, based on the `separator-style`."
  {:added "0.41.0"}
  [separator-style additional-opts & [name-value-separator]]
  {:pre [(or (nil? additional-opts) (map? additional-opts)) (contains? valid-separator-styles separator-style)]}
  (when (some? additional-opts)
    (reduce-kv (fn [m k v]
                 (str m
                      (when (seq m)
                        (separator-style->entry-separator separator-style))
                      (if (keyword? k)
                        (name k)
                        (str k))
                      (or name-value-separator default-name-value-separator)
                      v)) "" additional-opts)))

(defn handle-additional-options
  "If `details` contains an `:addtional-options` key, append those options to the connection string in `connection-spec`.
   (Some drivers like MySQL provide this details field to allow special behavior where needed).

   Optionally specify `seperator-style`, which defaults to `:url` (e.g. `?a=1&b=2`). You may instead set it to
  `:semicolon` or `:comma`, which will separate different options with semicolons or commas instead (e.g.
  `;a=1;b=2`). (While most drivers require the former style, some require semicolon or even comma.)"
  {:arglists '([connection-spec] [connection-spec details & {:keys [seperator-style]}])}
  ;; single arity provided for cases when `connection-spec` is built by applying simple transformations to `details`
  ([connection-spec]
   (handle-additional-options connection-spec connection-spec))
  ;; two-arity+options version provided for when `connection-spec` is being built up separately from `details` source
  ([{connection-string :subname, :as connection-spec} {additional-options :additional-options, :as _details} & {:keys [seperator-style]
                                                                                                                :or   {seperator-style :url}}]
   (-> (dissoc connection-spec :additional-options)
       (assoc :subname (conn-str-with-additional-opts connection-string seperator-style additional-options)))))

(defn additional-options->map
  "Attempts to parse the entires within the `additional-options` string into a map of keys to values. `separator-style`
  works as in the other functions in this namespace (since it influences the separator that appears between pairs).

  `opt-name-val-separator?` is an optional parameter that indicates the string that appears between keys and values. If
  provided, it must be a single-character string. If not, then a default separator of \"=\" is used.

  `lowercase-keys?` is an optional parameter that indicates the keys should be lowercased before being placed into the
  returned map (defaults to `true`)."
  [additional-options separator-style & [name-value-separator? lowercase-keys?]]
  {:pre [(or (nil? additional-options) (string? additional-options))
         (contains? valid-separator-styles separator-style)
         (or (nil? name-value-separator?) (and (string? name-value-separator?)
                                            (= 1 (count name-value-separator?))))
         (or (nil? lowercase-keys?) (boolean? lowercase-keys?))]}
  (if (str/blank? additional-options)
    {}
    (let [entry-sep (separator-style->entry-separator separator-style)
          nv-sep    (or name-value-separator? default-name-value-separator)
          pairs     (str/split additional-options (re-pattern entry-sep))
          k-fn      (if (or (nil? lowercase-keys?) (true? lowercase-keys?)) u/lower-case-en identity)
          kv-fn     (fn [part]
                      (let [[k v] (str/split part (re-pattern (str "\\" nv-sep)))]
                        [(k-fn k) v]))
          kvs       (map kv-fn pairs)]
      (into {} kvs))))
