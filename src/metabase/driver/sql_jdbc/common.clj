(ns metabase.driver.sql-jdbc.common
  (:refer-clojure :exclude [not-empty])
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.performance :refer [not-empty]]))

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
  "If `details` contains an `:additional-options` key, append those options to the connection string in `connection-spec`.
   (Some drivers like MySQL provide this details field to allow special behavior where needed).

   Optionally specify `seperator-style`, which defaults to `:url` (e.g. `?a=1&b=2`). You may instead set it to
  `:semicolon` or `:comma`, which will separate different options with semicolons or commas instead (e.g.
  `;a=1;b=2`). (While most drivers require the former style, some require semicolon or even comma.)"
  {:arglists '([connection-spec] [connection-spec details & {:keys [seperator-style]}])}
  ;; single arity provided for cases when `connection-spec` is built by applying simple transformations to `details`
  ([connection-spec]
   (handle-additional-options connection-spec connection-spec))
  ;; two-arity+options version provided for when `connection-spec` is being built up separately from `details` source
  ([{connection-string :subname, uri :connection-uri :as connection-spec}
    {additional-options :additional-options, :as _details} & {:keys [seperator-style] :or {seperator-style :url}}]
   (cond-> (dissoc connection-spec :additional-options)
     uri (assoc :connection-uri (conn-str-with-additional-opts uri seperator-style additional-options))
     :always (assoc :subname (conn-str-with-additional-opts connection-string seperator-style additional-options)))))

(defn additional-options->map
  "Attempts to parse the entries within the `additional-options` string into a map of keys to values. `separator-style`
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

(def ^:private authority-regex
  "The `//host:port` of a JDBC URL, or the `@host:port` Oracle writes instead. Matched wherever it appears rather than
  anchored at the front, since a driver may put something of its own first."
  #"(?://|@)([^/]*)")

(defn- authority-host
  "The host named by one `host:port` entry of a URL authority, or nil when the entry names none. Unlike
  [[metabase.util.http/->hostname]], which guesses at a string of unknown shape, this reads a value already known to
  be an authority: a colon is always the port separator and an IPv6 literal is always bracketed."
  [entry]
  (let [entry (-> entry str/trim (str/replace #"^.*@" ""))]        ; userinfo
    (not-empty
     (cond
       (str/starts-with? entry "[") (subs entry 1 (or (str/index-of entry "]") (count entry)))
       (str/index-of entry ":")     (subs entry 0 (str/index-of entry ":"))
       :else                        entry))))

(defn connection-string-hosts
  "The hosts named by the authority of a JDBC `connection-string` -- the `//host:port` (or Oracle's `@host:port`) that
  precedes the first parameter, and every entry of it when the driver accepts a comma-separated list.

  Reading the string the driver built, rather than the `:host` detail it was built from, is what catches a client that
  supplies a host of its own: every `:sql-jdbc` driver here substitutes `localhost` when the host detail is missing or
  blank, so the details alone name nowhere while the connection still opens somewhere.

  A connection string with no authority at all names no host, which is the honest answer for a file-backed database.
  An authority that is *present but holds no host* throws instead: `//:5439/db` is the same substitution seen from the
  other side, and pgjdbc handed one connects to localhost. [[metabase.driver/connection-hosts]] turns that into a
  refusal."
  [connection-string]
  (let [before-parameters (first (str/split (str connection-string) #"[?;]" 2))]
    (when-let [[_ authority] (re-find authority-regex before-parameters)]
      (let [entries (str/split authority #",")
            hosts   (into [] (keep authority-host) entries)]
        (when-not (= (count entries) (count hosts))
          (throw (ex-info "JDBC connection string has an authority that names no host"
                          {:connection-string connection-string})))
        hosts))))

(defn- connection-string-parameters
  "The `name=value` pairs in a JDBC `connection-string`, whichever separator style the driver that built it uses. Only
  what follows the first separator is read: the authority (`//host:port/db`) is [[connection-string-hosts]]' business,
  not ours."
  [connection-string]
  (when-let [params (second (str/split (str connection-string) #"[?;,]" 2))]
    (for [pair  (str/split params #"[&;,]")
          :let  [[k v] (str/split pair #"=" 2)]
          :when (and k v)]
      [(str/trim k) (str/trim v)])))

(defn- parameter-host [declared? backstop? [k v]]
  (when-let [host (u.http/->hostname v)]
    (when (or (declared? (name k))
              ;; A parameter of the connection string that was not declared is read only when its value is already an
              ;; IP address. That covers a declaration that has fallen behind the client it describes without ever
              ;; resolving a value that may not be a host at all -- which would both hand the value to the resolver
              ;; and, for a name that happens to resolve inside the cluster, refuse a database over its username.
              (and backstop? (u.http/ip-literal? host)))
      host)))

(defn connection-parameter-hosts
  "Hosts named by the parameters of `connection-string` and by `extra-parameters` (a map of the connection properties
  passed alongside it, if any), where `host-parameter-names`
  is [[metabase.driver/host-carrying-parameters]] for the driver that built them.

  A JDBC client resolves a host named in its parameters in preference to the one in the URL it was handed -- pgjdbc
  reads `host=`/`PGHOST=`, mssql-jdbc reads `serverName=` and `failoverPartner=` -- so these are hosts a connection
  may really open, whatever the details say.

  The address backstop applies only to `connection-string`, the string the client parses and where a user's
  `:additional-options` end up. `extra-parameters` is Metabase's own spec map, which carries detail keys the client
  never reads -- an inert one holding an internal URL is not a connection."
  [connection-string extra-parameters host-parameter-names]
  (let [declared-names (into #{} (map u/lower-case-en) host-parameter-names)
        declared?      (comp declared-names u/lower-case-en)]
    (into []
          cat
          [(keep #(parameter-host declared? true %) (connection-string-parameters connection-string))
           (keep #(parameter-host declared? false %) (filter (comp string? val) extra-parameters))])))
