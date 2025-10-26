(ns mage.quick-test-runner
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.be-dev :as backend]
   [mage.color :as c]
   [mage.util :as u]))

(def ^:private test-path (str u/project-root-directory "/test"))

(defn- gather-test-dirs []
  (->> (fs/glob test-path "**.clj{,s,c}")
       (mapv (comp str fs/parent))
       (remove #(str/includes? % "mage"))
       distinct
       (mapv (fn [f] (str (fs/relativize u/project-root-directory f))))))

(defn- run-tests-through-nrepl-port [test-dirs] ;; todo add dirs
  (println "Directories: ")
  (doseq [td test-dirs]
    (println "  - " (c/cyan td)))
  (println) (println) (println)
  (prn
   @(backend/nrepl-eval "metabase.core.bootstrap"
                        (pr-str
                         (list 'metabase.test-runner/find-and-run-tests-repl {:only test-dirs})))))

(defn- setup-test-files [parsed]
  (or (:arguments parsed)
      (-> (gather-test-dirs)
          (u/fzf-select
           (str/join " " ["--multi"
                          "--ansi"
                          "--preview"
                          (str "'" u/project-root-directory "/mage/mage/fzf_preview.clj {}'")]))
          str/split-lines)))

(defn- run-tests-cli [test-dirs]
  (let [cmd (str "clj -X:dev:ee:ee-dev:test :only " (str/join " " test-dirs))]
    (u/sh cmd)))

(defn go
  "Interactively select directories to run tests against."
  [{:keys [arguments options] :as _parsed}]
  (when-not (= "dir" (:style options))
    (throw (ex-info ""
                    {:mage/error "Styles other than dir not supported."
                     :babashka/exit 1})))
  (let [test-dirs (setup-test-files arguments)]
    (if (backend/nrepl-open?)
      (do
        (println "Running tests via " (c/underline (c/green (c/bold "the repl"))) ".")
        (run-tests-through-nrepl-port test-dirs))
      (do
        (println "Running via " (c/underline (c/magenta (c/on-cyan "the command line"))) "."
                 " This is " (c/yellow (c/on-cyan "SLOW")) " and " (c/red (c/on-cyan "NOT RECCOMENDED"))
                 ", please consider starting a repl for quicker test runs:\n\n"
                 "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start --port 7888")
        (run-tests-cli test-dirs)))))
