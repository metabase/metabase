(ns mage.be-dev
  (:require
   [bencode.core :as bencode]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn parse-int
  "Parse a string into an integer. Returns nil if parsing fails. Returns the input unchanged if not a string."
  [s-or-i]
  (if (string? s-or-i)
    (let [s (str/trim s-or-i)]
      (try
        (Integer/parseInt s)
        (catch Exception _ nil)))
    s-or-i))

(defn nrepl-port
  "Get the nREPL port from the .nrepl-port file. Throws an ex-info with friendly error message if file not found."
  []
  (try
    (parse-int (slurp ".nrepl-port"))
    (catch java.io.FileNotFoundException _
      (throw (ex-info (str "Metabase backend is not running. To start it, run:\n\n"
                           (c/green "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start\n\n")
                           "If you prefer a different way to start the backend, please use that instead.\n"
                           "The REPL server creates a .nrepl-port file when it starts.")
                      {:cause :backend-not-running})))))

(defn bootstrap-code
  "Capture output and return it as strings along with the value from the orignal code."
  [code-string]
  (str "
(let [o# (new java.io.StringWriter)
      e# (new java.io.StringWriter)]
  (binding [*out* o#
            *err* e#]
    {:value (do " code-string ")
     :stdout (str o#)
     :stderr (str e#)}))"))

(defn nrepl-eval
  "Evaluate Clojure code in a running nREPL server. With one arg, reads port from .nrepl-port file.
   With two args, uses the provided port number. Returns and formats the evaluation results."
  ([code]
   (try
     (let [port (nrepl-port)]
       (u/debug [port code])
       (nrepl-eval port code))
     (catch clojure.lang.ExceptionInfo e
       (if (= :backend-not-running (:cause (ex-data e)))
         (println (.getMessage e))
         (throw e)))))
  ([port code]
   (try
     (let [port (parse-int port)
           s (java.net.Socket. "localhost" port)
           out (.getOutputStream s)
           in (java.io.PushbackInputStream. (.getInputStream s))
           _ (bencode/write-bencode out {"op" "eval"
                                         "code" (bootstrap-code code)})
           return (update-vals (bencode/read-bencode in) slurp)]
       #_:clj-kondo/ignore
       ;; (prn ["Repl Response:" output])
       (doseq [[k v] return]
         (if (= k "value")
           ;; try to read v, which is a map but comes back as a string:
           (if-let [v (read-string v)]
             (do
               (println "value: " (pr-str (:value v)))
               (println "stdout: " (str/trim (:stdout v)))
               (println "stderr: " (str/trim (:stderr v))))
             (println "value: " v))
           (println (str k ":") v))))
     (catch java.net.ConnectException _
       (println (str "Could not connect to the REPL server on port: " (c/red port) " (found port number in .nrepl-port).\n"
                     "Is the Metabase backend running?\n\n"
                     "To start it, run:\n"
                     (c/green "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start\n\n")
                     "If you prefer a different way to start the backend, please use that instead."))))))
