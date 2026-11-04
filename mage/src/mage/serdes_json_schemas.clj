(ns mage.serdes-json-schemas
  "Write the JSON Schemas of serialized entities."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.be-dev :as be-dev]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn write!
  "Write `<Model>.json` for every serialized model into the directory given as the first argument."
  [{:keys [arguments options]}]
  (let [dir  (.getAbsolutePath (io/file (or (first arguments) "serdes-json-schemas")))
        port (some-> (:port options) str str/trim parse-long)
        exit (be-dev/eval-or-spawn
              {:port       port
               :nrepl-ns   "dev.serdes-json-schemas"
               :nrepl-code (format "(write-schemas! %s)" (pr-str dir))
               :jvm-args   ["-X:dev:ee:ee-dev" "dev.serdes-json-schemas/write-schemas-cli!" ":dir" (pr-str dir)]
               :nrepl-msg  (c/green "Writing serdes JSON Schemas via the running dev REPL...")
               :jvm-msg    (c/yellow "No dev REPL found — starting a JVM...")})]
    (println (str "\nWrote the schemas to " (c/cyan dir)))
    (u/exit (or exit 0))))
