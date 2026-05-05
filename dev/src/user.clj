(ns user
  (:require
   [cider.nrepl :as cider-nrepl]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.cli :as cli]
   [environ.core :as env]
   [hashp.preload]
   [metabase.classloader.core :as classloader]
   [metabase.core.bootstrap]
   [metabase.util :as u]
   [nrepl.server :as nrepl-server]
   [refactor-nrepl.middleware]))

(set! *warn-on-reflection* true)

(defn- parse-toml-value
  "Parse a TOML scalar value (RHS of `key = value`). Returns the unquoted string
  for basic strings (with `\\\"` and `\\\\` escapes), the inner text for literal
  strings, or the raw token for bare values (integers, booleans). Returns nil for
  values we don't handle (multi-line strings, arrays, inline tables).

  Mirrors mage.bot.env/parse-toml-value — duplicated here so REPL boot doesn't
  depend on the mage namespace classpath. Keep the two in sync."
  [v]
  (let [v (str/trim v)]
    (cond
      ;; Basic string: "..." with \" and \\ escapes. Reject multi-line ("""...) here.
      (and (str/starts-with? v "\"")
           (not (str/starts-with? v "\"\"\""))
           (re-matches #"\"(?:[^\"\\]|\\.)*\"" v))
      (-> v
          (subs 1 (dec (count v)))
          (str/replace #"\\(.)" "$1"))

      ;; Literal string: '...' (no escapes). Reject multi-line ('''...).
      (and (str/starts-with? v "'")
           (not (str/starts-with? v "'''"))
           (re-matches #"'[^']*'" v))
      (subs v 1 (dec (count v)))

      ;; Bare scalar (int, float, bool) — just hand back the token.
      (re-matches #"[A-Za-z0-9_+\-.]+" v)
      v

      :else nil)))

(defn- load-mise-local!
  "Parse mise.local.toml and merge its [env] values into environ's map.
  This must run before metabase.config.core loads, which it does since that namespace
  is loaded lazily via dev/start!.

  Mirrors mage.bot.env/read-mise-local-toml's tolerance: keys may contain word
  chars, hyphens, or dots, and values may be basic strings (with escapes),
  literal strings, or bare scalars. Lines we can't parse are silently skipped
  rather than crashing the REPL boot."
  []
  (let [f (io/file "mise.local.toml")]
    (when (.exists f)
      (with-open [rdr (io/reader f)]
        (let [env-vars (->> (line-seq rdr)
                            (drop-while #(not= (str/trim %) "[env]"))
                            (drop 1)
                            (take-while #(not (re-matches #"\s*\[.*\]\s*" %)))
                            (keep (fn [line]
                                    (when-let [[_ k raw-v]
                                               (re-matches #"\s*([\w.\-]+)\s*=\s*(.*?)\s*" line)]
                                      (when-let [v (parse-toml-value raw-v)]
                                        (let [kw (-> k
                                                     str/lower-case
                                                     (str/replace "_" "-")
                                                     keyword)]
                                          [kw v])))))
                            (into {}))]
          (alter-var-root #'environ.core/env merge env-vars))))))

(load-mise-local!)

(comment
  metabase.core.bootstrap/keep-me
  hashp.preload/keep-me
  refactor-nrepl.middleware/keep-me)

;; Load all user.clj files (including the system-wide one).
(when *file* ; Ensure we don't load ourselves recursively, just in case.
  (->> (.getResources (.getContextClassLoader (Thread/currentThread)) "user.clj")
       enumeration-seq
       rest ; First file in the enumeration will be this file, so skip it.
       (run! #(do
                #_:clj-kondo/ignore
                (println "Loading" (str %))
                (clojure.lang.Compiler/load (io/reader %))))))

;; Wrap these with ignore-exceptions to reduce the "required" deps of this namespace
;; We sometimes need to run cmd stuffs like `clojure -M:migrate rollback n 3` and these
;; libraries might not be available in the classpath
(u/ignore-exceptions
 ;; make sure stuff like `=?` and what not are loaded
  (classloader/require 'mb.hawk.assert-exprs))

(u/ignore-exceptions
  (classloader/require 'metabase.test-runner.assert-exprs))

(u/ignore-exceptions
  (classloader/require 'humane-are.core)
  ((resolve 'humane-are.core/install!)))

(u/ignore-exceptions
  (classloader/require 'pjstadig.humane-test-output)
 ;; Initialize Humane Test Output if it's not already initialized. Don't enable humane-test-output when running tests
 ;; from the CLI, it breaks diffs. This uses [[env/env]] rather than [[metabase.config.core]] so we don't load that
 ;; namespace before we load [[metabase.core.bootstrap]]
  (when-not (= (env/env :mb-run-mode) "test")
    ((resolve 'pjstadig.humane-test-output/activate!))))

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'dev)
  (in-ns 'dev)
  :loaded)

(def ^{:dynamic true
       :doc "When true, the backend code will be reloaded on every request.
             This value is set by the `--hot` command line argument to the `:dev-start` alias."}
  *enable-hot-reload* false)

(def cli-spec [["-h" "--help" "Show this help text"]
               ["-H" "--hot" "Enable hot reloading"] ;
               ["-p" "--port PORT" "Port to run the nREPL server on"
                :default (if-let [p (env/env :nrepl-port)]
                           (Integer/parseInt p)
                           50605)
                :parse-fn #(Integer/parseInt %)]])

(defn -main
  "This is called by the `:dev-start` cli alias.

  Try it out: `clj -M:dev:dev-start:drivers:drivers-dev:ee:ee-dev`

  Command Line Args:

  `--hot` - Checks for modified files and reloads them during a request."
  [& args]
  (let [{:keys [help hot port]} (:options (cli/parse-opts args cli-spec))]
    (when help
      #_:clj-kondo/ignore
      (do
        (println "Usage: clj -M:dev:dev-start:drivers:drivers-dev:ee:ee-dev [options]")
        (println "Options:")
        (println (:summary (cli/parse-opts [] cli-spec))))
      (System/exit 0))
    (when hot
      #_:clj-kondo/ignore
      (println "Enabling hot reloading of code. Backend code will reload on every request.")
      (alter-var-root #'*enable-hot-reload* (constantly true)))
    (future
      #_:clj-kondo/ignore
      (println "Starting Metabase cider repl on port" port)
      (spit ".nrepl-port" port)
      (nrepl-server/start-server
       :port port
       :bind "0.0.0.0"
       ;; this handler has cider middlewares installed:
       :handler (apply nrepl-server/default-handler
                       (conj cider-nrepl/cider-middleware 'refactor-nrepl.middleware/wrap-refactor)))))
  ((requiring-resolve 'dev/start!))
  (deref (promise)))
