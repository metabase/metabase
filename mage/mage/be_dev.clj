(ns mage.be-dev
  (:require
   [bencode.core :as bencode]
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn safe-parse-int [s]
  (try
    (Integer/parseInt s)
    (catch NumberFormatException e
      (println "Error parsing long:" s)
      nil)))

(defn parse-int [s-or-i]
  (if (instance? Integer s-or-i)
    s-or-i
    (safe-parse-int s-or-i)))

(defn nrepl-port []
  (or
   (safe-parse-int (slurp ".nrepl-port"))
   (safe-parse-int (System/getenv "MB_DEV_PORT"))
   (throw (ex-info "No port found in .nrepl-port or MB_DEV_PORT" {}))))

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
  ([code]
   (u/debug [(nrepl-port) code])
   (nrepl-eval (nrepl-port) code))
  ([port code]
   (try (let [s (java.net.Socket. "localhost" (parse-int port))
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
              (println (str k ":") v)))))))
