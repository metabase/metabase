(ns mage.quick-test-runner
  (:require
   [babashka.fs :as fs]
   [bling.banner :refer [banner]]
   [bling.core :as bling]
   [bling.fonts.drippy]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.be-dev :as backend]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.sound :as sound]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

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
  (u/debug ["selecting" selecting])
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

(defn- feedback-bar
  "Returns a glancable feedback bar of test results as string, with one emoji per test."
  [out-data]
  (str (str/join (repeat (:pass out-data) "✅"))
       (str/join (repeat (:fail out-data) "❌"))
       (str/join (repeat (:error out-data) "⚠️"))))

(defn- only-edn [test-dirs]
  (str "'" (pr-str test-dirs)))

(defn- run-tests-over-nrepl [test-dirs options]
  (let [start (u/start-timer)
        the-ns "mb.hawk.core"
        only-arg (only-edn test-dirs)
        the-cmd (str "(do (require (quote metabase.test-runner)) "
                     "((requiring-resolve 'dev.reload/reload!)) "
                     "(metabase.test-runner/find-and-run-tests-repl "
                     "{:only " only-arg "}))")]
    (println "Running Code over nrepl:" (c/bold the-cmd))
    (bling/callout
     {:type :info
      :theme :sideline-bold
      :label-theme :marquee
      :label "Running tests in"}
     (str/join "\n" (map #(str " - " %) test-dirs)))
    (let [out (backend/nrepl-eval the-ns the-cmd)
          elapsed (u/since-ms start)]
      (println)
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
                      :label "Rerun This Directly With"}
                     (c/cyan "mage run-tests "
                             (when-let [p (:port options)] (format "--port %s " p))
                             (str/join " " test-dirs)))

      (let [out-data (try (edn/read-string out)
                          (catch Exception _
                            (println (c/red "Problem parsing output, raw output follows:"))
                            #_:clj-kondo/ignore
                            (prn out)))
            exit-code (if (zero? (+ (:fail out-data) (:error out-data))) 0 1)]
        (println (feedback-bar out-data))
        (if (zero? exit-code) @(sound/success) @(sound/error))
        (u/exit exit-code)))))

;; namespaces will be converted to their file paths, so this check will work.
(def ^:private namespace-prefixes
  ["metabase." "metabase-enterprise." "hooks."])

(defn- namespace-like? [s]
  (some #(str/starts-with? s %) namespace-prefixes))

(defn- check-arg [arg]
  (cond
    (symbol? arg) true
    (string? arg) (or (str/includes? arg ".clj")
                      (str/includes? arg "/")
                      (namespace-like? arg))
    :else false))

(defn- normalize-test-arg [arg]
  (cond
    (symbol? arg)
    arg

    (not (string? arg))
    arg

    :else
    (let [[ns-part test-name] (str/split arg #"/" 2)]
      (cond
        (and test-name (namespace-like? ns-part))
        (symbol (str ns-part "/" test-name))

        (namespace-like? arg)
        (symbol arg)

        :else
        arg))))

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
        test-dir-or-nss (mapv normalize-test-arg tests)]
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

(defn go
  "Interactively select directories to run tests against."
  [{:keys [arguments options] :as _parsed}]
  (let [tests (setup-test-files arguments options)
        port (:port options)
        nrepl-open? (backend/nrepl-open? port)
        nrepl-type (backend/nrepl-type port)]
    (u/debug (pr-str ["INFO" {:port port :nrepl-open? nrepl-open? :nrepl-type nrepl-type}]))
    (cond
      (not nrepl-open?)
      (do
        (println (c/red "Unable to find a backend nrepl."))
        (println "Running via " (c/bold (c/magenta "the command line")) "."
                 (c/red " This is " (c/bold "SLOW") " and " (c/bold "NOT RECOMMENDED!! "))
                 "Please consider starting a backend \nFor quicker test runs, use: " (c/magenta "  clj -M:test:dev:ee:ee-dev:drivers:drivers-dev:dev-start"))
        (println "\n" (banner {:text "Please open a REPL!"
                               :font bling.fonts.drippy/drippy
                               :gradient-direction :to-right
                               :gradient-colors [:magenta :red]}))
        (run-tests-cli tests))
      (and nrepl-open? (= :clj nrepl-type))
      (do
        (println "Running tests via ⏩🏎️✨" (c/green (c/bold "THE REPL")) "✨🏎️⏪.")
        (run-tests-over-nrepl tests options))
      (and nrepl-open? (not= :clj nrepl-type))
      (println (str "You have a non-clojure nrepl: " (c/yellow (name nrepl-type)) " at port " (c/yellow port) ".\n"
                    "Either use -p <backend port>, or run 'echo {server-nrepl-port} > .nrepl-port' to run tests via the backend repl.")))))
