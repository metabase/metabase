(ns mage.be-dev
  (:require
   [bencode.core :as bencode]
   ^:clj-kondo/ignore
   [clojure.pprint :as pp]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [mage.color :as c]
   [mage.util :as u])
  (:import
   [java.io InputStream]))

(set! *warn-on-reflection* true)

(defn- safe-parse-int
  "Parse a string into an integer. Returns nil if parsing fails. Returns the input unchanged if not a string."
  [s-or-i]
  (if (string? s-or-i)
    (try
      (parse-long (str/trim s-or-i))
      (catch Exception _ nil))
    s-or-i))

(defn ^:private nrepl-port [port]
  (safe-parse-int
   (or port
       (try (slurp ".nrepl-port")
            (catch Exception _
              (throw (ex-info
                      (str "Unable to find .nrepl-port, is the server's repl running?"
                           " See: the :dev-start alias in deps.edn")
                      {})))))))

(defn ^:private socket!
  "Acquire a Java socket or die."
  [host port]
  (try
    (java.net.Socket. host port)
    (catch java.net.ConnectException _
      (println
       (str "Could not connect to the REPL server on port: " (c/red port) " (found port number in .nrepl-port).\n"
            "Is the Metabase backend running?\n\n"
            "To start it, run:\n"
            (c/green "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start\n\n")
            "If you prefer a different way to start the backend, please use that instead."))
      (System/exit 1))
    (catch Exception e
      (if (= "No matching ctor found for class java.net.Socket" (ex-message e))
        (do
          (println (format "There seems to be an error specifying port: '%s'."
                           (c/yellow (pr-str port))))
          (System/exit 1))
        (throw e)))))

(defn ^:private consume [v]
  (cond
    (bytes? v)                (String. ^bytes v)
    (instance? InputStream v) (slurp v)
    :else                     v))

(defn eval-in-ns
  "This insane code evals the code in the proper namespace.
  It's basically a repl inside a repl."
  [nns code]
  ^:clj-kondo/ignore ;; ignore `eval`
  `(let [ns# (symbol ~nns)]
     (require ns# :reload)
     (in-ns ns#)
     (eval (read-string ~(or code "::loaded")))))

(defn nrepl-eval
  "Evaluate Clojure code in a running nREPL server. With one arg, reads port from .nrepl-port file.
   With two args, uses the provided port number. Returns and formats the evaluation results."
  [nns code & [port]]
  (let [port        (nrepl-port port)
        s           (socket! "localhost" port)
        out         (.getOutputStream s)
        in          (java.io.PushbackInputStream. (.getInputStream s))
        code-str    (str (eval-in-ns nns code))
        _           (u/debug "Code:\n-----\n" code-str "\n-----")
        _           (bencode/write-bencode out {:op "eval" :code code-str})
        final-value (atom nil)]
    (loop []
      (let [response (->> (bencode/read-bencode in)
                          (walk/postwalk consume))]
        (doseq [[k v] response]
          (case k
            "out"   (print v)
            "err"   (binding [*out* *err*]
                      (print v))
            "value" (reset! final-value v)
            nil))                       ; Ignore other keys like session, id, status

        ;; Flush to ensure output appears immediately
        (flush)

        (if (some #{"done"} (get response "status"))
          (some->> @final-value
                   (println "\n=> "))
          (recur))))))

(comment

  (nrepl-eval "metabase.logger.core-test" "(do (println :!! hi) hi)" 59498)

  (nrepl-eval "metabase.logger.core-test" "*ns*")

  (nrepl-eval "dev.migrate" "(do (rollback! :count 1) ::rollback-done)")
  (nrepl-eval "dev.migrate" "(do (migrate! :up) ::migrate-up-done)")

  (nrepl-eval "dev" "")

  (println code-str))
