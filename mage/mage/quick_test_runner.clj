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

(defn- gather-test-files []
  (->> (fs/glob test-path "**.clj{,s,c}")
       (remove #(str/includes? % "mage"))
       distinct
       (mapv (fn [f] (str (fs/relativize u/project-root-directory f))))))

(defn- gather-files [style]
  (case style
    :file (gather-test-files)
    :dir  (gather-test-dirs)))

(defn- run-tests-through-nrepl-port [style to-test]
  (if (= style :dir)
    (do
      (println "Directories: ")
      (doseq [td to-test]
        (println "  - " (c/cyan td)))
      (println) (println) (println)
      (prn
       @(backend/nrepl-eval "metabase.core.bootstrap"
                            (pr-str
                             (list 'metabase.test-runner/find-and-run-tests-repl {:only to-test})))))
    (do
      (println "Files: ")
      (doseq [td to-test] (println "  - " (c/green td)))
      (println) (println) (println)
      (prn
       @(backend/nrepl-eval "metabase.core.bootstrap"
                            (pr-str
                             (list 'metabase.test-runner/find-and-run-tests-repl {:only to-test})))))))

(defn- setup-test-files [all-choices parsed]
  (or (not-empty (:arguments parsed))
      (-> all-choices
          (u/fzf-select
           (str/join " " ["--multi"
                          "--ansi"
                          "--preview"
                          (str "'" u/project-root-directory "/mage/mage/fzf_preview.clj {}'")]))
          str/split-lines)))

(defn- run-tests-cli [_style test-dirs]
  (let [tests (->> test-dirs
                   (map #(str "\"" % "\""))
                   (str/join " "))
        cmd (str "clj -X:dev:ee:ee-dev:test :only [" tests "]")]
    (u/sh cmd)))

(defn- normalize-style [options]
  (case (:style options)
    "f"    :file
    "file" :file
    "d"    :dir
    "dir"  :dir
    nil    :dir
    (throw (ex-info ""
                    {:mage/error    "Styles other than dir (d) or file (f) not supported."
                     :babashka/exit 1}))))

(defn go
  "Interactively select directories to run tests against."
  [{:keys [arguments options] :as _parsed}]
  (let [style (normalize-style options) ;; file or dir
        all-choices (gather-files style)
        to-test (setup-test-files all-choices {:arguments arguments})]
    (if (backend/nrepl-open?)
      (do
        (println "Running tests via " (c/underline (c/green (c/bold "the repl"))) ".")
        (run-tests-through-nrepl-port style to-test))
      (do
        (println "Running via " (c/underline (c/magenta (c/on-cyan "the command line"))) "."
                 " This is " (c/bold "SLOW") " and " (c/red (c/bold "NOT RECCOMENDED"))
                 ", please consider starting a repl for quicker test runs:\n\n"
                 "  clj -M:dev:ee:ee-dev:drivers:drivers-dev:dev-start --port 7888")
        (run-tests-cli style to-test)))))
