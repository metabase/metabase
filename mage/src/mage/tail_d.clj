(ns mage.tail-d
  (:require
   [babashka.fs :as fs]
   [babashka.process :as process]
   [clojure.edn :as edn]
   [mage.be-dev :as be-dev]
   [mage.color :as c]
   [mage.util :as u]))

(defn- log-path-from-repl []
  (when (be-dev/nrepl-open?)
    (binding [be-dev/*quiet-nrepl-eval* true]
      (some-> (be-dev/nrepl-eval "dev.debug" "(log-path)")
              edn/read-string))))

(defn- log-path-static []
  (or (System/getenv "DEV_DEBUG_LOG")
      (str "/tmp/" (fs/file-name u/project-root-directory) "_debug.log")))

(defn tail-d! [_]
  (let [path (or (log-path-from-repl) (log-path-static))
        bat? (u/can-run? "bat")
        cmd  (if bat?
               (str "tail -f " path " | bat --paging=never -l edn")
               (str "tail -f " path))]
    (println (c/cyan (str "Watching " path " (Ctrl-C to stop)")))
    (process/shell "bash" "-c" cmd)))
