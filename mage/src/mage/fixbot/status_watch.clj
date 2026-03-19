(ns mage.fixbot.status-watch)

(set! *warn-on-reflection* true)

(defn- clear-and-print [^java.io.File f]
  (print "\033[2J\033[H")
  (flush)
  (when (.exists f)
    (print (slurp f)))
  (flush))

(defn run!
  "Watch .fixbot/status.txt and reprint on change."
  [{:keys [arguments]}]
  (let [file-path (or (first arguments) ".fixbot/status.txt")
        f         (java.io.File. ^String file-path)]
    (clear-and-print f)
    (loop [last-modified (.lastModified f)]
      (Thread/sleep 1000)
      (let [current-modified (.lastModified f)]
        (when (not= current-modified last-modified)
          (clear-and-print f))
        (recur current-modified)))))
