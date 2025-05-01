(ns mage.be-dev
  (:require
   [bencode.core :as bencode]
   ^:clj-kondo/ignore
   [clojure.pprint :as pp]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- safe-parse-int
  "Parse a string into an integer. Returns nil if parsing fails. Returns the input unchanged if not a string."
  [s-or-i]
  (if (string? s-or-i)
    (let [s (str/trim s-or-i)]
      (try
        (Integer/parseInt s)
        (catch Exception _ nil)))
    s-or-i))

(defn- print-capture-code
  "Capture output and return it as strings along with the value from the orignal code."
  [code-string]
  (str "
(let [o# (new java.io.StringWriter)
      e# (new java.io.StringWriter)]
  (binding [*out* o#
            *err* e#]
    {:value (do" code-string ")
     :stdout (str o#)
     :stderr (str e#)}))"))

(defn eval-in-ns
  "This insane code evals the code in the proper namespace.
  It's basically a repl inside a repl."
  [nns code]
  (str "
              (let [ns-sym (symbol \"" nns "\")]
                (require ns-sym :reload)
                (in-ns ns-sym)
                (eval (read-string " (pr-str (or code "::loaded")) ")))"))

(defn nrepl-eval
  "Evaluate Clojure code in a running nREPL server. With one arg, reads port from .nrepl-port file.
   With two args, uses the provided port number. Returns and formats the evaluation results."
  ([nns code]
   (nrepl-eval (or nns "user") code (slurp ".nrepl-port")))
  ([nns code port]
   (try (let [port (safe-parse-int port)
              s (java.net.Socket. "localhost" port)
              out (.getOutputStream s)
              in (java.io.PushbackInputStream. (.getInputStream s))
              code-str (->> code
                            (eval-in-ns nns)
                            print-capture-code)
              _ (u/debug "Code: ----- \n" code-str "\n -----")
              _ (bencode/write-bencode out {"op" "eval" "code" code-str})
              return (update-vals (bencode/read-bencode in) slurp)]
          (doseq [[k v] return]
            (if (= k "value")
              (if-let [v (try (read-string v)
                              ;; try to read v, which is a map but comes back as a string:
                              (catch Exception _ nil))]
                (do
                  (println "value: " (pr-str (:value v)))
                  (when-not (str/blank? (:stdout v))
                    (println "stdout: ")
                    (doseq [out (str/split-lines (:stdout v))]
                      (println "  " out)))
                  (when-not (str/blank? (:stderr v))
                    (println "stderr: ")
                    (doseq [err (str/split-lines (:stderr v))]
                      (println "  " err))))
                (println "value: " v))
              (println (str k ":") v))))
        (catch java.net.ConnectException _
          (println (str "Could not connect to the REPL server on port: " (c/red port) " (found port number in .nrepl-port).\n"
                        "Is the Metabase backend running?\n\n"
                        "To start it, run:\n"
                        (c/green "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start\n\n")
                        "If you prefer a different way to start the backend, please use that instead.")))
        (catch Exception e
          (if (= "No matching ctor found for class java.net.Socket" (ex-message e))
            (println (str "Unable to connect to nREPL server. Is it running on port " (c/yellow port) "?"))
            (do
              (println "message: " (ex-message e))
              (println "data:    " (pr-str (ex-data e)))
              {:exception true
               :message (ex-message e)
               :data (ex-data e)}))))))

(comment

  (nrepl-eval "metabase.logger-test" "(do (println :!! hi) hi)" 59498)

  (nrepl-eval "metabase.logger-test" "*ns*" 59498)

  (println code-str))
