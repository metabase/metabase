(ns mage.print-json-schema
  "Print the JSON Schema of a registered Malli schema."
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.be-dev :as be-dev]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- write-via-nrepl!
  "Write the schema to `file` through the dev REPL on `port`, and return whether the file was written."
  [schema file port]
  (binding [be-dev/*quiet-nrepl-eval* true]
    (be-dev/nrepl-eval "dev.print-json-schema" (format "(write-schema! %s %s)" schema (pr-str file)) port))
  (pos? (fs/size file)))

(defn- write-via-jvm!
  "Write the schema to `file` in a new JVM, print what the JVM said to stderr on failure, and return whether it worked."
  [schema file]
  (let [{:keys [exit out err]} (shell/sh* {:quiet? true}
                                          "clojure" "-X:dev:ee:ee-dev" "dev.print-json-schema/write-schema-cli!"
                                          ":schema" schema ":file" (pr-str file))]
    (when-not (zero? exit)
      (binding [*out* *err*]
        (run! println (concat out err))))
    (zero? exit)))

(defn print!
  "Print to stdout the JSON Schema of the Malli schema registered as the keyword given as the first argument."
  [{:keys [arguments options]}]
  (let [schema (str ":" (str/replace (first arguments) #"^:" ""))
        port   (some-> (:port options) str str/trim parse-long)
        file   (str (fs/create-temp-file {:prefix "json-schema" :suffix ".json"}))
        ok?    (if (be-dev/nrepl-reachable? port)
                 (write-via-nrepl! schema file port)
                 (write-via-jvm! schema file))]
    (if ok?
      (println (slurp file))
      (binding [*out* *err*]
        (println (str "Could not write the JSON Schema of " schema))))
    (fs/delete-if-exists file)
    (u/exit (if ok? 0 1))))
