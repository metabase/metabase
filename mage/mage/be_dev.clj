(ns mage.be-dev
  (:require
   [bencode.core :as bencode]
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

(defn nrepl-eval
  ([code]
   (u/debug [(nrepl-port) code])
   (nrepl-eval (nrepl-port) code))
  ([port code]
   (try (let [s (java.net.Socket. "localhost" (parse-int port))
              out (.getOutputStream s)
              in (java.io.PushbackInputStream. (.getInputStream s))
              _ (bencode/write-bencode out {"op" "eval" "code" (str "(do " code ")")})
              output (update-vals (bencode/read-bencode in) slurp)]
          #_:clj-kondo/ignore
          (prn ["Repl Response:" output])
          (when-let [v (get output "value")]
            (prn (try (read-string v)
                      (catch Exception _ v))))))))
