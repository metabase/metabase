(ns mage.quick-test-runner
  (:require
   [babashka.fs :as fs]
   [bling.banner :refer [banner]]
   [bling.core :as bling]
   [bling.fonts.big]
   [bling.fonts.drippy]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.be-dev :as backend]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]
   [pod.babashka.fswatcher :as fw]))

(set! *warn-on-reflection* true)

(def ^:private test-path (str u/project-root-directory "/test"))
(def ^:private enterprise-path (str u/project-root-directory "/enterprise/backend/test/"))

(defn- gather-file-tests []
  (->> (concat
        (fs/glob test-path "**.clj{,c}")
        (fs/glob enterprise-path "**.clj?c"))
       (mapv (fn [f] (str (fs/relativize u/project-root-directory f))))
       (remove #(str/includes? % "mage"))
       vec))

(defn- gather-dir-tests
  ([]
   (gather-dir-tests (gather-file-tests)))
  ([test-files]
   (->> test-files
        (mapv (comp str fs/parent fs/file))
        distinct)))

(defn- gather-tests-all []
  (let [files (gather-file-tests)
        dirs (gather-dir-tests files)]
    (concat files dirs)))

(defn- gather-tests [selecting]
  (u/debug "selecting:" selecting)
  (case selecting
    "file" (gather-file-tests)
    "dir"  (gather-dir-tests)
    "all"  (gather-tests-all)
    (throw
     (ex-info ""
              {:mage/error (str "Unknown test gathering 'selection': " (c/yellow selecting) ". "
                                "Valid options are: "
                                (c/green "file") ", " (c/green "dir") ", or " (c/green "all") ".")
               :babashka/exit 1}))))

(defn- run-tests-over-nrepl [test-dirs]
  (let [start (u/start-timer)
        the-ns "mb.hawk.core"
        the-cmd (str "(do (require (quote metabase.test-runner))"
                     " ((requiring-resolve 'dev.reload/reload!))"
                     " (metabase.test-runner/find-and-run-tests-repl"
                     " {:only " (pr-str test-dirs) "}))")]
    (println "Running Code over nrepl:" (c/bold the-cmd))
    (bling/callout
     {:type :info
      :theme :sideline-bold
      :label-theme :marquee
      :label "Running tests in"}
     (str/join "\n" (map #(str " - " %) test-dirs)))
    (let [out (backend/nrepl-eval the-ns the-cmd)
          elapsed (u/since-ms start)]
      (try (u/pp (edn/read-string out)) (catch Exception _ #_:clj-kondo/ignore (prn out)))
      (println (c/green (str "Tests completed in " elapsed " ms.\n")))
      (when (u/env "MAGE_DEBUG" (constantly nil))
        (bling/callout {:type :positive
                        :theme :minimal
                        :label-theme :marquee
                        :label "To Rerun w/ mage -repl"} (c/cyan "mage -repl '" the-cmd "'")))
      (bling/callout {:type :positive
                      :theme :minimal
                      :label-theme :marquee
                      :label "To Rerun Directly"}
                     (c/cyan "mage run-tests " (str/join " " test-dirs))))))

;; namespaces will be converted to their file paths, so this check will work.
(defn- check-arg [arg]
  (or (str/includes? arg ".clj") (str/includes? arg "/")))

(defn- add-cljy-suffix-or-throw [partial-file-path maybe-ns]
  (or (first
       (keep (fn [suffix]
               (let [file-path (str partial-file-path suffix)]

                 (cond (str/starts-with? maybe-ns "metabase.")
                       ;; src/metabase/...
                       (let [path (str "src/" file-path)]
                         (and (fs/exists? (str u/project-root-directory "/" path)) path))

                       (str/starts-with? maybe-ns "metabase-enterprise.")
                       ;; enterprise/backend/src/metabase_enterprise/...
                       (let [path (str "enterprise/backend/" file-path)]
                         (and (fs/exists? (str u/project-root-directory "/" path)) path)))))
             [".clj" ".cljc" ".bb"]))
      (throw
       (ex-info "" {:mage/error (str "Could not find a file for namespace: "
                                     (c/yellow partial-file-path)
                                     ". Tried appending .clj, .cljs, .cljc, and .bb -- is that a real namespace?")
                    :babashka/exit 1}))))

(defn- normalize [maybe-ns]
  (let [normalized (if (or (str/starts-with? maybe-ns "metabase.")
                           (str/starts-with? maybe-ns "metabase-enterprise."))
                     (-> maybe-ns
                         str
                         (str/replace "." "/")
                         (str/replace "-" "_")
                         ;; Cannot tell from the namespace alone if it's a clj, or cljc file. :melty-face:
                         ;; Try to find the file by appending each suffix until we find one that exists:
                         (add-cljy-suffix-or-throw maybe-ns))
                     maybe-ns)]
    (str/replace normalized ",$" "")))

(defn- setup-test-files [arguments {:keys [selecting] :as _options}]
  (let [tests (if (seq arguments)
                arguments
                (-> (gather-tests selecting)
                    (u/fzf-select!
                     (str/join " " ["--multi"
                                    "--ansi"
                                    "--marker" "'✓ '"
                                    "--bind" "tab:toggle+up,shift-tab:toggle+down,ctrl-a:toggle-all"
                                    "--header" "'TAB: toggle+up, Shift-TAB: toggle+down, C-a: toggle all, ENTER: accept'"
                                    "--header-first"
                                    "--header-border" "rounded"
                                    "--preview" (str "'" u/project-root-directory "/mage/cmd/fzf_preview.clj {}'")]))
                    str/split-lines))
        test-dir-or-nss (mapv normalize tests)]
    (when-not (every? check-arg test-dir-or-nss)
      (throw (ex-info "" {:mage/error (str
                                       "When providing arguments, they must be file paths or directories, got: "
                                       (pr-str {:tests tests
                                                :test-dir-or-ns test-dir-or-nss}))
                          :babashka/exit 1})))
    test-dir-or-nss))

(defn- run-tests-cli [test-dirs]
  (let [cmd (str "clj -X:dev:ee:ee-dev:test :only '" (pr-str test-dirs) "'")]
    (bling/callout {:label "Running Command Line"} (c/bold cmd))
    (shell/sh* "clojure" "-X:dev:dev-ee:ee:test" ":only" (pr-str test-dirs))))

(defn- run-the-tests [tests]
  (if (and (backend/nrepl-open?)
           ;; No testing against the mage nrepl! (probably noone will hit this)
           (not= :bb (backend/nrepl-type)))
    (do
      (println "Running tests via ⏩🏎️✨" (c/green (c/bold "THE REPL")) "✨🏎️⏪.")
      (run-tests-over-nrepl tests))
    (do
      (println "Running via " (c/bold (c/magenta "the command line")) "."
               (c/red " This is " (c/bold "SLOW") " and " (c/bold "NOT RECOMMENDED!! "))
               "Please consider starting a backend \nFor quicker test runs, use: " (c/magenta "  clj -M:test:dev:ee:ee-dev:drivers:drivers-dev:dev-start"))
      (println "\n" (banner
                     {:font               bling.fonts.drippy/drippy
                      :text               "Open a REPL!"
                      :gradient-direction :to-top
                      :gradient-colors    [:magenta :red]})
               "\n")
      (run-tests-cli tests))))

(defn- rerun-fn [{:keys [path type]}]
  (u/debug (c/cyan "mage.quick-test-runner/rerun-fn") " got:" (pr-str [path type]))
  (when (#{:write :write|chmod} type)
    (println "\n"
             (banner {:font bling.fonts.big/big
                      :text (if (= type ::initial) "Running" "Re-running")})
             "\n")
    (println (c/green "Change detected. Rerunning tests for: " (c/bold path)))
    (run-the-tests [path])))

(defn- watch-and-run-tests
  "Run all tests passed in itnitally, then watch them for changes and rerun the set, but only on change."
  [tests]
  ;; Start the watchers, one for each test path:
  (doseq [test tests]
    (println "- Adding watcher for " (c/green test))
    (fw/watch test rerun-fn {:recursive true :delay-ms 50})
    (println "  - Done"))
  ;; Run them all initially
  (run-the-tests tests)
  (deref (promise)))

(defn go
  "Interactively select directories to run tests against."
  [{:keys [arguments options] :as _parsed}]
  (let [tests
        ;; if no arguments, prompt to select files or directories:
        (setup-test-files arguments options)]
    (u/debug "Tests to run:" tests)
    (if (:watch options)
      (do
        (println "Watching tests for changes in:" (c/green (str/join ", " tests)))
        (watch-and-run-tests tests))
      (run-the-tests tests))))
