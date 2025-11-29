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

;; TODOs and IDEAs:
;; IDEA: play sounds for success or failure
;; TODO: Watch the *src* files for the chosen tests
;; TODO: What if we do the watch based on namespaces instead of files?
;; IDEA: select Just ^:parallel (or other tag) tests?

(set! *warn-on-reflection* true)

(defonce ^:private file-contents
  ;; file-path -> file checksum
  ;; Used to determine if a file really changed on fswatcher events, which are unreliable!
  (atom {}))

(def ^:private test-path (str u/project-root-directory "/test"))
(def ^:private enterprise-path (str u/project-root-directory "/enterprise/backend/test/"))

(defn- gather-file-tests []
  (->> (concat
        (fs/glob test-path "**.clj{,c}")
        (fs/glob enterprise-path "**.clj{,c}"))
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

(defn- print-feedback-bar
  "Prints a glancable feedback bar of test results."
  [out-data]
  (print (apply str (repeat (:pass out-data) "✅")))
  (print (apply str (repeat (:fail out-data) "❌")))
  (print (apply str (repeat (:error out-data) "⚠️")))
  (println))

(defn- return-test-namespaces [test-dirs]
  (->> (map (fn [td]
              (if (fs/regular-file? td)
                (-> td
                    (str/replace (re-pattern (str "^" u/project-root-directory "/?")) "")
                    ;; Strip source root directories:
                    (str/replace #"^test/" "")
                    (str/replace #"^enterprise/backend/test/" "")
                    ;; Convert path to namespace:
                    (str/replace  #"\.clj$" "")
                    (str/replace  #"\.cljc$" "")
                    (str/replace "/" ".")
                    (str/replace "_" "-"))
                ;; else it's a directory
                (let [files-in-dir (fs/glob td "**.clj{,c}")]
                  (mapcat
                   (fn [f] (return-test-namespaces [(str f)]))
                   files-in-dir))))
            test-dirs)
       flatten
       distinct))

(defn- run-tests-over-nrepl [test-dirs options]
  (let [the-ns "mb.hawk.core"
        the-cmd (str
                 "(do"
                 ;; redefine each test namespace, this will undef any previous definitions,
                 ;; so removed tests won't run:
                 (->> (for [test-ns (return-test-namespaces test-dirs)]
                        (str
                         "  (when (find-ns (quote " test-ns "))\n"
                         "        (remove-ns (quote " test-ns ")))"
                         "\n"
                         "  ((requiring-resolve (quote clojure.core/require)) '" test-ns " :reload)"))
                      (str/join "\n"))
                 "\n"
                 ;; reload updated namespaces:
                 "  ((requiring-resolve (quote dev.reload/reload!)))"
                 "  (require (quote metabase.test-runner))\n"
                 "  (metabase.test-runner/find-and-run-tests-repl {:only " (pr-str test-dirs) "}))")]
    (println "\nRunning Code over nrepl:")
    (println the-cmd)
    (bling/callout
     {:type :info
      :theme :sideline-bold
      :label-theme :marquee
      :label "Running tests in"}
     (str/join "\n" (map #(str " - " %) test-dirs)))
    (let [out (backend/nrepl-eval the-ns the-cmd (:port options))]
      (when (u/env "MAGE_DEBUG" (constantly nil))
        (bling/callout {:type :positive
                        :theme :minimal
                        :label-theme :marquee
                        :label "To Rerun w/ mage -repl"} (c/cyan "mage -repl '" the-cmd "'")))
      (bling/callout {:type :positive
                      :theme :minimal
                      :label-theme :marquee
                      :label "Rerun This Directly With"}
                     (c/cyan "mage run-tests "
                             (when (:port options) "--watch ")
                             (when-let [p (:port options)] (format "--port %s " p))
                             (str/join " " test-dirs)))
      (try (let [out-data (edn/read-string out)] (print-feedback-bar out-data))
           (catch Exception _ #_:clj-kondo/ignore
                  (prn [(c/red "Problem parsing output, raw output follows:") out])))
      (u/debug "file-contents atom: " (pr-str @file-contents))
      (when (:watch options)
        (println "the" (c/bold "WATCH") "option (👁️👄👁️) is enabled; tests will rerun on changes to your test files.")))))

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

(comment
  (backend/nrepl-open? "7888"))

(defn- run-the-tests [tests {:keys [port] :as options}]
  (if (backend/nrepl-open? port)
    (do
      (when (= :bb (backend/nrepl-type port))
        (throw (ex-info ""  {:babashka/exit 1
                             :mage/error "Ooops! you have a babashka nrepl at .nrepl-port (" port "). Please pass -p <backend-server-port> and try again."})))
      (println "Running tests via ⏩🏎️✨" (c/green (c/bold "THE REPL")) "✨🏎️⏪.")
      (run-tests-over-nrepl tests options))
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

(defn- hash-file-or-dir [path]
  (if (fs/regular-file? path)
    (u/file-checksum path)
    (let [files-in-dir (map str (fs/glob path "**.clj{,c}"))]
      ;; This will pickup non test file changes too, but that seems ok for now:
      (hash (mapv u/file-checksum files-in-dir)))))

(defn- file-really-changed?
  "Compare the current checksum of the file or dir at [path] to the previous checksum stored in [[file-contents]].
   If different, update [[file-contents]] and return true, else return false.

  Why? Because fswatcher events are unreliable and may be emitted even when files don't change :(."
  [path]
  (let [current-checksum (hash-file-or-dir path)
        previous-checksum (get @file-contents path)]
    (u/debug "file-really-changed?"
             (pr-str [path current-checksum previous-checksum]))
    (if (not= current-checksum previous-checksum)
      (do
        (swap! file-contents assoc path current-checksum)
        true)
      false)))

(defn- add-file-or-dir-changesum [path]
  (swap! file-contents assoc path (hash-file-or-dir path)))

(defn- rerun-fn [{:keys [path type]} options]
  ;; Unfortunately, the fswatcher library doesn't give us enough info to know if the file
  ;; actually changed or not, based on the 'type' of event. So we maintain [[file-contents]],
  ;; an atom from file-path -> hashedcontents, and check that to see if the file really changed.
  (u/debug (c/cyan "mage.quick-test-runner/rerun-fn") " got:" (pr-str [path type]))
  (when (file-really-changed? path)
    (println (c/green "Change detected. Rerunning tests for: " (c/bold path)))
    (run-the-tests [path] options)))

(defn- watch-and-run-tests
  "Run all tests passed in itnitally, then watch them for changes and rerun the set, but only on change."
  [tests options]
  ;; Start the watchers + record checksums for each test path:
  (doseq [test tests]
    (println "- Processing " (c/green test))
    (println "  - Adding watcher")
    (fw/watch test #(rerun-fn % options) {:recursive true :delay-ms 50})
    (println "    - Done")
    (println "  - Initializing checksum")
    (add-file-or-dir-changesum test)
    (println "    - Done")
    (println "- Done"))
  ;; Run everything initially
  (run-the-tests tests options)
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
        (watch-and-run-tests tests options))
      (run-the-tests tests options))))
