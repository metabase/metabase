(ns metabase.settings.env-file
  "The `metabase.env` layer: an in-memory map of environment variables read from a `.env`-style file at startup, which
  Settings consult right after the real environment. It exists for the people who administer the host Metabase runs
  on and cannot -- or would rather not -- set real environment variables: a file next to the JAR, or the one
  `MB_ENV_FILE_PATH` names, is theirs in the same way, and like an environment variable it applies to this machine
  only. A real environment variable always wins over the file.

  The config file's `settings:` section adds the values of sysadmin-only Settings to this same layer (see
  [[metabase.settings.models.setting/merge-env-file-value!]]), losing to the file. Note what that means for reach: an
  ordinary config.yml setting is written to the application DB and so reaches every node, but a sysadmin-only one is
  held here, on the node that loaded the file, and nowhere else -- like an env var. A deployment that gives every node
  the same config.yml sees no difference; one that relied on a single node's file propagating through the DB does.
  `metabase.env` is where host-level configuration should move over time; config.yml keeps working for it meanwhile.

  Only Settings read this layer. `MB_DB_*`, `MB_ENCRYPTION_SECRET_KEY`, the Jetty and logging variables, and anything
  else read straight from `environ.core/env` ignore it, and startup warns about such keys in the file."
  (:require
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.util :as u]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defonce ^:private values
  (atom {}))

(defn env-file-values
  "The current contents of the layer: a map of environ-style keywords (`:mb-foo-bar`) to string values."
  []
  @values)

(defn reset-env-file-values!
  "Replace the contents of the layer with `m`. Startup does this once from the file; tests do it to fake one."
  [m]
  (reset! values m))

(defn- keywordize
  "`MB_FOO_BAR` -> `:mb-foo-bar`, the way environ keys the real environment."
  [^String k]
  (keyword (-> k u/lower-case-en (str/replace "_" "-"))))

(defn- unquote-value
  "Strip one pair of matching outer quotes. No escape processing: values are URLs and secrets, and a `#` or `\\` inside
  them is literal."
  ^String [^String v]
  (if (and (>= (count v) 2)
           (let [q (first v)] (and (#{\" \'} q) (= q (last v)))))
    (subs v 1 (dec (count v)))
    v))

(defn- parse-line
  "Parse one non-blank, non-comment line into `[keyword value]`, or throw naming `line-number`."
  [^String line line-number]
  (let [line    (str/replace-first line #"^export\s+" "")
        [k v]   (str/split line #"=" 2)
        k       (some-> k str/trim)]
    (when (nil? v)
      (throw (ex-info (tru "metabase.env line {0} is not a KEY=value pair: {1}" line-number (pr-str line))
                      {:line line-number})))
    (when-not (re-matches #"[A-Za-z_][A-Za-z0-9_]*" k)
      (throw (ex-info (tru "metabase.env line {0}: {1} is not a valid environment variable name" line-number (pr-str k))
                      {:line line-number})))
    [(keywordize k) (unquote-value (str/trim v))]))

(defn parse-env-file
  "Parse the `contents` of a `.env`-style file into a map of environ-style keywords to string values. One `KEY=value`
  per line; blank lines and lines starting with `#` are skipped; a leading `export ` is allowed; one pair of matching
  outer quotes is stripped from the value. `KEY=` sets the empty string, which means \"explicitly unset\" exactly as an
  empty real env var does. The last of duplicate keys wins. A line that is not a `KEY=value` pair is an error: a typo
  in the host's configuration must not be skipped silently. A leading UTF-8 byte order mark (some Windows editors
  write one) is dropped, as it would otherwise become an invisible part of the first key."
  [^String contents]
  (transduce
   (comp (map-indexed (fn [i line] [(inc i) (str/trim line)]))
         (remove (fn [[_ line]] (or (str/blank? line) (str/starts-with? line "#"))))
         (map (fn [[line-number line]] (parse-line line line-number))))
   (completing (fn [m [k v]]
                 (when (contains? m k)
                   (log/warnf "metabase.env sets %s more than once; using the last value." (name k)))
                 (assoc m k v)))
   {}
   (str/split-lines (u/strip-bom contents))))

(defn- env-file-path
  "The file to load: the one `MB_ENV_FILE_PATH` names (which must exist), else `./metabase.env` when there is one."
  []
  (let [configured (not-empty (env/env :mb-env-file-path))
        default    (u.files/get-path (System/getProperty "user.dir") "metabase.env")]
    (cond
      configured
      (let [path (u.files/get-path configured)]
        (if (u.files/exists? path)
          path
          (throw (ex-info (tru "metabase.env file not found at MB_ENV_FILE_PATH {0}" (pr-str configured))
                          {:path configured}))))

      (u.files/exists? default)
      default)))

(defn load-env-file!
  "Load the `metabase.env` file, if there is one, into the layer, replacing whatever was there. Values are never logged."
  []
  (if-let [path (env-file-path)]
    (let [m (parse-env-file (slurp (str path)))]
      (reset! values m)
      (log/infof "Loaded %d environment variable(s) from %s" (count m) (str path)))
    (reset! values {})))

(defn merge-value!
  "Add `value` for `env-kw` to the layer unless the file already set that key -- `metabase.env` wins over the config
  file. Returns whether the value was added."
  [env-kw ^String value]
  (if (contains? @values env-kw)
    false
    (do (swap! values assoc env-kw value)
        true)))
