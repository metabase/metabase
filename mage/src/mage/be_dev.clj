(ns mage.be-dev
  (:require
   [bencode.core :as bencode]
   [clojure.edn :as edn]
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
  It's basically a repl inside a repl. The code here will be
  executed in the context of the connected repl."
  [nns code]
  ^:clj-kondo/ignore ;; ignore `eval`
  `(let [ns# (symbol ~nns)]
     (require ns# :reload)
     (in-ns ns#)
     (eval (read-string
            {:read-cond :allow}
            ~(if (str/blank? code) "::loaded" code)))))

(def ^{:dynamic true
       :doc "Set this to true to suppress stdout output from nrepl-eval."}
  *quiet-nrepl-eval* false)

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
        final-value (atom nil)
        safe-print (fn [& msg] (when-not *quiet-nrepl-eval* (run! print msg) (flush)))]
    (loop []
      (let [response (->> (bencode/read-bencode in) (walk/postwalk consume))]
        (u/debug "Response:\n-----\n" (with-out-str (pp/pprint response)) "-----")
        (safe-print "\n")
        (doseq [[k v] response]
          (case k
            "out"   (safe-print v)
            "err"   (binding [*out* *err*] (safe-print v))
            "value" (reset! final-value v)
            nil))                       ; Ignore other keys like session, id, status

        ;; Flush to ensure output appears immediately
        (flush)

        (if (some #{"done"} (get response "status"))
          (some->> @final-value
                   (safe-print "\n=>\n"))
          (recur))))
    @final-value))

(defn nrepl-open?
  "Checks if an nREPL server is running on the given port (or the port in .nrepl-port if none given)."
  ([] (nrepl-open? nil))
  ([port]
   (try
     (let [port (nrepl-port port)
           o (binding [*quiet-nrepl-eval* true]
               (nrepl-eval "user" "(+ 1 1)" port))]
       (= "2" o))
     (catch Exception _ false))))

(defn nrepl-type
  "Returns :bb :cljs or :clj to indicate what type of nrepl server is running on the given port (or the port in .nrepl-port if none given)."
  ([] (nrepl-type nil))
  ([port]
   (try
     (let [port (nrepl-port port)
           [repl-clj-ver cond-read] (edn/read-string
                                     (binding [*quiet-nrepl-eval* true]
                                       (nrepl-eval "user" "[*clojure-version* #?(:clj :clj :cljs :cljs)]" port)))]
       (if (= "SCI" (:qualifier repl-clj-ver))
         :bb
         cond-read))
     (catch Exception _ nil))))

(comment

  (nrepl-type)

  (nrepl-eval "metabase.logger.core-test" "(do (println :!! 'hi) 'hi)" 7888)

  (nrepl-eval "user" "*ns*" 7888)

  ;; run migrations from the cli:
  (nrepl-eval "dev.migrate" "(do (rollback! :count 1) ::rollback-done)" 7888)
  (nrepl-eval "dev.migrate" "(do (migrate! :up) ::migrate-up-done)" 7888)

  (nrepl-eval "dev" "*ns*" 7888))
