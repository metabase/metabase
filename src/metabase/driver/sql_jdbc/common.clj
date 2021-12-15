(ns metabase.driver.sql-jdbc.common
  (:require [clojure.string :as str]))

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

(defn parse-additional-options-value
  "Attempts to parse the value for `opt-name` from an `additional-options` string, with `separator-style`, having
  `opt-name-val-separator?` in between option names and values (optional; defaults to '='). Searches the additional
  options string in a case insensitive manner."
  [additional-options opt-name separator-style & [name-value-separator?]]
  {:pre [(or (nil? additional-options) (string? additional-options))
         (string? opt-name)
         (contains? valid-separator-styles separator-style)
         (or (nil? name-value-separator?) (and (string? name-value-separator?)
                                               (= 1 (count name-value-separator?))))]}
  (let [entry-sep (or (separator-style->entry-separator separator-style))
        nv-sep    (or name-value-separator? default-name-value-separator)
        re-pat    (str "(?i).*(?:^|" entry-sep ")(?:" opt-name nv-sep ")([^" nv-sep entry-sep "]+).*$")
        [_ match] (re-matches (re-pattern re-pat) additional-options)]
    match))
