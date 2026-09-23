(ns mage.cljts.cli
  "`./bin/mage cljts`: start the viewer, print one file's translation, or report translation coverage."
  (:require
   [babashka.fs :as fs]
   [mage.cljts.core :as cljts]
   [mage.cljts.git :as git]
   [mage.cljts.server :as server]
   [mage.cljts.translate :as t])
  (:import
   (java.net URLEncoder)))

(set! *warn-on-reflection* true)

(defn- stats!
  "Translate every Clojure file under `dirs`, then print exceptions and the most common fallbacks."
  [dirs]
  (let [stats (atom {})
        files (for [d dirs, f (if (fs/directory? d) (fs/glob d "**.{clj,cljc}") [(fs/path d)])] (str f))
        failed (atom [])]
    (binding [t/*stats* stats]
      (doseq [f files]
        (try
          (when-not (cljts/translate-string (slurp f))
            (swap! failed conj [f "parse failed"]))
          (catch Throwable e
            (swap! failed conj [f (str (type e) " " (ex-message e))])))))
    (println (count files) "files," (count @failed) "failed completely")
    (doseq [[f msg] (take 20 @failed)] (println "  FAILED" f msg))
    (doseq [kind [:error :raw :generic]]
      (let [m (get @stats kind)]
        (println (str "\n" (name kind) ": " (reduce + (vals m)) " total"))
        (doseq [[k n] (take (if (= kind :generic) 40 20) (sort-by (comp - val) m))]
          (println (format "  %6d  %s" n k)))))))

(defn run
  "Entry point for the mage task."
  [{:keys [options arguments]}]
  (let [{:keys [pr branch port print stats no-open base]} options]
    (cond
      print (clojure.core/print (or (cljts/translate-string (slurp print)) "(could not parse)\n"))
      stats (server/with-big-stack
              #(stats! (if (seq arguments) arguments ["src" "enterprise/backend/src" "test" "enterprise/backend/test"])))
      :else (server/start! {:port       (or port 7788)
                            :no-open?   no-open
                            :start-path (cond
                                          pr               (str "/pr/" (or (git/parse-pr pr) pr))
                                          branch           (str "/branch?name=" (URLEncoder/encode ^String branch "UTF-8")
                                                                (when base (str "&base=" (URLEncoder/encode ^String base "UTF-8"))))
                                          (seq arguments)  (str "/file?path=" (URLEncoder/encode ^String (first arguments) "UTF-8"))
                                          base             (str "/local?base=" (URLEncoder/encode ^String base "UTF-8"))
                                          :else            "/local")}))))
