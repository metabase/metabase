(ns metabase.flargs.init
  "Startup wiring that converts `RF_*` environment variables into loaded flarg-side `init`
  namespaces. Triggers the flarg-side `defflarg` forms to register their impls against the
  registry so the dispatcher in `metabase.flargs.core` can route to them.

  Call shape: `(activate!)` at JVM startup reads the env, translates each truthy `RF_*` var to a
  `:flarg/<name>` keyword, and requires the corresponding `metabase.flarg.<name>.init` namespace.
  Any require failure throws immediately (Approach A per FLARG-PROGRESS.md §Decisions) — a
  misconfiguration where a flarg is requested via env var but its code isn't on the classpath
  must fail loud.

  Env-var convention matches Ryan's already-shipped Liquibase context gating
  ([[metabase.app-db.liquibase/enabled-rf-contexts]]): `RF_FOO_BAR=true` activates the flarg named
  `:flarg/foo-bar`. Truthy means literally `\"true\"` (case-insensitive, trimmed) — nothing else."
  (:require
   [clojure.string :as str]
   [metabase.classloader.core :as classloader]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private rf-prefix "RF_")

(defn- truthy?
  "Matches the convention used by [[metabase.app-db.liquibase/enabled-rf-contexts]]: a value is
  truthy iff it equals `\"true\"` after trimming and lowercasing. Anything else — including
  `\"false\"`, `\"0\"`, `\"\"`, or `nil` — is falsy."
  [v]
  (and (some? v)
       (= "true" (u/lower-case-en (str/trim v)))))

(defn- env-key->flarg-keyword
  "Translates `RF_FOO_BAR` → `:flarg/foo-bar`. Caller must have already verified the key starts
  with `RF_`."
  [env-key]
  (-> env-key
      (subs (count rf-prefix))
      u/lower-case-en
      (str/replace "_" "-")
      (->> (keyword "flarg"))))

(defn enabled-flargs
  "Returns the set of `:flarg/<name>` keywords for every truthy `RF_*` entry in `env`. An empty
  set means no flargs are enabled. Non-`RF_` entries are ignored.

  With no arg, reads from the real process environment via `System/getenv`. Tests should pass an
  explicit env map to avoid mutating process env."
  ([]
   (enabled-flargs (System/getenv)))
  ([env]
   (into #{}
         (keep (fn [[k v]]
                 (when (and (str/starts-with? k rf-prefix)
                            (truthy? v))
                   (env-key->flarg-keyword k))))
         env)))

(defn- flarg-keyword->init-ns
  "Translates `:flarg/foo-bar` → the symbol `metabase.flarg.foo-bar.init`."
  [flarg-kw]
  (symbol (str "metabase.flarg." (name flarg-kw) ".init")))

(defn require-flarg-inits!
  "For each flarg keyword in `flargs`, requires its `metabase.flarg.<name>.init` namespace via
  [[metabase.classloader.core/require]]. Iteration order is whatever the input set yields (no
  stability guarantee — order between flargs must not matter).

  On the first require failure, throws `ex-info` with a remediation hint pointing at the
  `-A:flarg/<name>` alias. Remaining flargs are NOT attempted."
  [flargs]
  (doseq [flarg-kw flargs]
    (let [init-ns (flarg-keyword->init-ns flarg-kw)]
      (try
        (classloader/require init-ns)
        (catch Throwable e
          (throw (ex-info (str "Failed to load flarg init namespace " init-ns
                               " for " flarg-kw ". "
                               "Did you include `-A:" (namespace flarg-kw) "/" (name flarg-kw)
                               "` in the JVM launch?")
                          {:flarg   flarg-kw
                           :init-ns init-ns}
                          e)))))))

(defn activate!
  "Reads the process env for `RF_*` flags and requires the corresponding flarg init namespaces so
  their `defflarg` impls register. Returns the set of activated flarg keywords (possibly empty)
  for logging and debuggability.

  This is the single entry point called from `metabase.core.init`."
  []
  (let [flargs (enabled-flargs)]
    (require-flarg-inits! flargs)
    flargs))
