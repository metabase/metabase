(ns metabase.driver.sql-jdbc.common
  (:require [clojure.string :as str]))

(def ^:private valid-separator-styles #{:url :comma :semicolon})

(defn conn-str-with-additional-opts
  "Adds `additional-opts` (a string) to the given `connection-string` based on the given `separator-style`. See
  documentation for `handle-additional-options` for further details."
  {:added "0.39.0", :arglists '([connection-string separator-style additional-opts])}
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
  {:added "0.39.0", :arglists '([separator-style additional-opts])}
  [separator-style additional-opts]
  {:pre [(or (nil? additional-opts) (map? additional-opts)) (contains? valid-separator-styles separator-style)]}
  (if (some? additional-opts)
    (reduce-kv (fn [m k v]
                 (str m
                      (if (seq m)
                        (case separator-style :comma "," :semicolon ";" :url "&"))
                      (if (keyword? k) (name k) (str k))
                      "="
                      v)) "" additional-opts)))

(defn handle-additional-options
  "If DETAILS contains an `:addtional-options` key, append those options to the connection string in CONNECTION-SPEC.
   (Some drivers like MySQL provide this details field to allow special behavior where needed).

   Optionally specify SEPERATOR-STYLE, which defaults to `:url` (e.g. `?a=1&b=2`). You may instead set it to
   `:semicolon` or `:comma`, which will separate different options with semicolons or commas instead (e.g. `;a=1;b=2`). (While most drivers
   require the former style, some require semicolon or even comma.)"
  {:arglists '([connection-spec] [connection-spec details & {:keys [seperator-style]}])}
  ;; single arity provided for cases when `connection-spec` is built by applying simple transformations to `details`
  ([connection-spec]
   (handle-additional-options connection-spec connection-spec))
  ;; two-arity+options version provided for when `connection-spec` is being built up separately from `details` source
  ([{connection-string :subname, :as connection-spec} {additional-options :additional-options, :as details} & {:keys [seperator-style]
                                                                                                               :or   {seperator-style :url}}]
   (-> (dissoc connection-spec :additional-options)
       (assoc :subname (conn-str-with-additional-opts connection-string seperator-style additional-options)))))
