(ns mage.quick-test-runner
  (:require
   [babashka.fs :as fs]
   [bling.core :as bling]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.be-dev :as backend]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(def ^:private test-path (str u/project-root-directory "/test"))

(defn- gather-test-dirs []
  (->> (fs/glob test-path "**.clj{,s,c}")
       (mapv (comp str fs/parent))
       (remove #(str/includes? % "mage"))
       distinct
       (mapv (fn [f] (str (fs/relativize u/project-root-directory f))))))

(defn- quotify [xs]
  (str/join " " (map #(str "\"" % "\"") xs)))

(defn- run-tests-over-nrepl [test-dirs] ;; todo add dirs
  (let [cmd (str "(do (require (quote metabase.test-runner)) "
                 "(metabase.test-runner/find-and-run-tests-repl "
                 "{:only [" (quotify test-dirs) "]}))")]
    (println "Running Code over nrepl:" (c/bold cmd))
    (bling/callout
     {:type :info
      :theme :sideline-bold
      :label-theme :marquee
      :label "Running tests in"}
     (str/join "\n"
               (map #(str " - " %) test-dirs)))
    (let [start (System/currentTimeMillis)
          out (backend/nrepl-eval "user" cmd)
          elapsed (- (System/currentTimeMillis) start)]
      (u/pp (try (edn/read-string out) (catch Exception _ out)))
      (println (c/green (str "Tests completed in " elapsed " ms.\n")))
      (when (u/env "MAGE_DEBUG" (constantly nil))
        (bling/callout {:type :positive
                        :theme :minimal
                        :label-theme :marquee
                        :label "To Rerun w/ mage -repl"} (c/cyan "mage -repl '" cmd "'")))
      (bling/callout {:type :positive
                      :theme :minimal
                      :label-theme :marquee
                      :label "To Rerun Directly"}
                     (c/cyan "mage quick-test -d " (str/join "," test-dirs))))))

(defn- setup-test-files [{:keys [dirs] :as _options}]
  (if (seq dirs)
    (str/split dirs #",")
    (-> (gather-test-dirs)
        (u/fzf-select
         (str/join " " ["--multi" "--ansi" "--preview"
                        (str "'" u/project-root-directory "/mage/mage/fzf_preview.clj {}'")]))
        str/split-lines)))

(defn- run-tests-cli [test-dirs]
  (let [cmd (str "clj -X:dev:ee:ee-dev:test :only '[" (quotify test-dirs) "]'")]
    (bling/callout {:label "Running Command Line"}
                   (c/bold cmd))
    (shell/sh* "clojure" "-X:dev:dev-ee:ee:test" ":only" (str "[" (quotify test-dirs) "]"))))

(defn go
  "Interactively select directories to run tests against."
  [{:keys [options] :as _parsed}]
  (when-not (= "dir" (:style options))
    (throw (ex-info "" {:mage/error "Styles other than dir not supported."
                        :babashka/exit 1})))
  (let [test-dirs (setup-test-files options)]
    (if (backend/nrepl-open?)
      (do
        (println "Running tests via ⏩🏎️✨" (c/green (c/bold "THE REPL")) "✨🏎️⏪.")
        (run-tests-over-nrepl test-dirs))
      (do
        (println "Running via " (c/underline (c/magenta (c/on-cyan "the command line"))) "."
                 (c/red " This is " (c/bold "SLOW") " and " (c/bold "NOT RECCOMENDED!! "))
                 "Please consider starting a backend \nFor quicker test runs, use: " (c/magenta "  clj -M:test:dev:ee:ee-dev:drivers:drivers-dev:dev-start"))
        (run-tests-cli test-dirs)))))

