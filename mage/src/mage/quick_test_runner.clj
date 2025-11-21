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
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private test-path (str u/project-root-directory "/test"))
(def ^:private enterprise-path (str u/project-root-directory "/enterprise/backend/test/"))

(defn- gather-test-dirs []
  (->> (concat
        (fs/glob test-path "**.clj{,s,c}")
        (fs/glob enterprise-path "**.clj{,s,c}"))
       (mapv (comp str fs/parent))
       (remove #(str/includes? % "mage"))
       distinct
       (mapv (fn [f] (str (fs/relativize u/project-root-directory f))))))

(defn- quotify [xs]
  (str/join " " (map #(str "\"" % "\"") xs)))

(defn- run-tests-over-nrepl [test-dirs] ;; todo add dirs
  (let [start (u/start-timer)
        the-ns "mb.hawk.core"
        the-cmd (str "(do (require (quote metabase.test-runner)) "
                     "((requiring-resolve 'dev.reload/reload!)) "
                     "(metabase.test-runner/find-and-run-tests-repl "
                     "{:only [" (quotify test-dirs) "]}))")]
    (println "Running Code over nrepl:" (c/bold the-cmd))
    (bling/callout
     {:type :info
      :theme :sideline-bold
      :label-theme :marquee
      :label "Running tests in"}
     (str/join "\n"
               (map #(str " - " %) test-dirs)))
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
                     (c/cyan "mage quick-test " (str/join " " test-dirs))))))

;; namespaces will be converted to their file paths, so this check will work.
(defn- check-arg [arg]
  (or (str/includes? arg ".clj") (str/includes? arg "/")))

(defn add-cljy-suffix-or-throw [partial-file-path maybe-ns]
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

(defn maybe-convert-ns-to-filename [maybe-ns]
  (if (or (str/starts-with? maybe-ns "metabase.")
          (str/starts-with? maybe-ns "metabase-enterprise."))
    (-> maybe-ns
        str
        (str/replace "." "/")
        (str/replace "-" "_")
        ;; Cannot tell from the namespace alone if it's a clj, or cljc file. :melty-face:
        ;; Try to find the file by appending each suffix until we find one that exists:
        (add-cljy-suffix-or-throw maybe-ns))
    maybe-ns))

(defn- setup-test-files [arguments]
  (if (seq arguments)
    (let [file-paths-or-dirs (mapv maybe-convert-ns-to-filename arguments)]
      (when-not (every? check-arg file-paths-or-dirs)
        (throw (ex-info "" {:mage/error (str
                                         "When providing arguments, they must be file paths or directories, got: "
                                         (c/yellow (str/join " " file-paths-or-dirs)))
                            :babashka/exit 1})))
      file-paths-or-dirs)
    (-> (gather-test-dirs)
        (u/fzf-select
         (str/join " " ["--multi" "--ansi" "--preview"
                        (str "'" u/project-root-directory "/mage/cmd/fzf_preview.clj {}'")]))
        str/split-lines)))

(defn- run-tests-cli [test-dirs]
  (let [cmd (str "clj -X:dev:ee:ee-dev:test :only '[" (quotify test-dirs) "]'")]
    (bling/callout {:label "Running Command Line"} (c/bold cmd))
    (shell/sh* "clojure" "-X:dev:dev-ee:ee:test" ":only" (str "[" (quotify test-dirs) "]"))))

(defn go
  "Interactively select directories to run tests against."
  [{:keys [arguments options] :as _parsed}]
  (when-not (= "dir" (:selecting options))
    (throw (ex-info "" {:mage/error    "Selections other than dir not yet supported."
                        :babashka/exit 1})))
  (let [test-dirs (setup-test-files arguments)]
    (if (backend/nrepl-open?)
      (do
        (println "Running tests via ⏩🏎️✨" (c/green (c/bold "THE REPL")) "✨🏎️⏪.")
        (run-tests-over-nrepl test-dirs))
      (do
        (println "Running via " (c/bold (c/magenta "the command line")) "."
                 (c/red " This is " (c/bold "SLOW") " and " (c/bold "NOT RECCOMENDED!! "))
                 "Please consider starting a backend \nFor quicker test runs, use: " (c/magenta "  clj -M:test:dev:ee:ee-dev:drivers:drivers-dev:dev-start"))
        (println "\n" (banner
                       {:font               bling.fonts.drippy/drippy
                        :text               "Please open a REPL!"
                        :gradient-direction :to-top
                        :gradient-colors    [:magenta :red]}))
        (run-tests-cli test-dirs)))))



