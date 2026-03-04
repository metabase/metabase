(ns user
  (:require
   [cider.nrepl :as cider-nrepl]
   [clojure.java.io :as io]
   [clojure.tools.cli :as cli]
   [environ.core :as env]
   [hashp.preload]
   [metabase.classloader.core :as classloader]
   [metabase.core.bootstrap]
   [metabase.util :as u]
   [nrepl.server :as nrepl-server]
   [refactor-nrepl.middleware]))

(set! *warn-on-reflection* true)

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
               [nil "--h2-tcp-port PORT" "Start an H2 TCP listener on the specified port"
                :parse-fn #(Integer/parseInt %)]
               ["-p" "--port PORT" "Port to run the nREPL server on"
                :default 50605
                :parse-fn #(Integer/parseInt %)]])

(defn -main
  "This is called by the `:dev-start` cli alias.

  Try it out: `clj -M:dev:dev-start:drivers:drivers-dev:ee:ee-dev`

  Command Line Args:

  `--hot` - Checks for modified files and reloads them during a request.
  `--h2-tcp-port` - Starts an H2 TCP listener on the specified port."
  [& args]
  (let [{:keys [help hot h2-tcp-port port]} (:options (cli/parse-opts args cli-spec))]
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
    (when h2-tcp-port
      ((requiring-resolve 'dev.h2/tcp-listen) h2-tcp-port))
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
