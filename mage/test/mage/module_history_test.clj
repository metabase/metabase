(ns mage.module-history-test
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.module-history :as module-history]
   [mage.shell :as shell]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(set! *warn-on-reflection* true)

(deftest refreshed-sql-test
  (testing "the stamp goes in a comment after the query"
    (is (= "select 1\n-- refreshed by mage module-history at 2026-10-10T00:00:00Z"
           (module-history/refreshed-sql "select 1\n\n\n" "2026-10-10T00:00:00Z"))))
  (testing "a second refresh replaces the first one's comment, and other comments stay"
    (is (= "select 1\n-- by seq\norder by seq\n-- refreshed by mage module-history at 2026-10-11T00:00:00Z"
           (-> "select 1\n-- by seq\norder by seq"
               (module-history/refreshed-sql "2026-10-10T00:00:00Z")
               (module-history/refreshed-sql "2026-10-11T00:00:00Z"))))))

(deftest fill-template-test
  (is (= (str "<p>2 commits</p><script>"
              "const DATA = [{\"subject\":\"Close <\\/script> early\"},{\"subject\":\"$1 \\\\ kept\"}];"
              "const TODAY = [{\"cluster\":\"tardis\"}];"
              "const ANCHORS = [\"tardis\"];"
              "</script>")
         (module-history/fill-template
          (str "<p>/*COUNT*/ commits</p><script>"
               "const DATA = /*DATA*/;const TODAY = /*TODAY*/;const ANCHORS = /*ANCHORS*/;</script>")
          {"commits"  [{"subject" "Close </script> early"} {"subject" "$1 \\ kept"}]
           "today"    [{"cluster" "tardis"}]
           "clusters" ["tardis"]}))))

(deftest config-problems-test
  (testing "a full config and an empty one are both usable"
    (is (= []
           (#'module-history/config-problems
            {:pages    [{:template "t.html", :file "page.html"}]
             :metabase {:profile "stats", :uploads {"history.csv" 1}, :cards [2 3]}
             :shares   {"page.html" "slug-a1"}})))
    (is (= []
           (#'module-history/config-problems {:pages []}))))
  (testing "each mistake is named"
    (is (= ["unknown keys: :share"
            ":pages must be a vector of {:template \"path\", :file \"name\"}"
            ":metabase needs :profile, the mb profile to use"
            ":metabase :uploads must map a file name to an upload table id"
            ":metabase :cards must be a vector of card ids"]
           (#'module-history/config-problems
            {:share    {}
             :pages    [{:template "t.html"}]
             :metabase {:uploads {"history.csv" "1"}, :cards [:a]}})))))

(defn- fake-sh
  "A [[mage.shell/sh*]] stand-in that records each command in `calls` and answers `mb card get` with a native card."
  [calls]
  (fn [& args]
    (let [args (vec (if (map? (first args)) (rest args) args))]
      (swap! calls conj (cond-> args
                          ;; The update's body is in a temporary file: record what it holds instead of its path.
                          (= ["mb" "card" "update"] (take 3 args))
                          (update 5 slurp)))
      {:exit 0
       :err  []
       :out  (if (= ["mb" "card" "get"] (take 3 args))
               ["{\"id\": 21, \"dataset_query\": {\"database\": 1, \"stages\": [{\"native\": \"select 1\"}]}}"]
               [])})))

(defn- publish!
  "Publish a directory holding `files` with `config`, and return the commands that ran with the directory's path
  replaced by `DIR` and the time by `STAMP`, the page it wrote, its exit code, and what it printed."
  [config files options]
  (let [dir (fs/create-temp-dir {:prefix "module-history-test"})]
    (doseq [[file-name content] (merge {"publish.edn" (pr-str config), "template.html" "/*COUNT*/ of /*ANCHORS*/"}
                                       files)]
      (spit (str (fs/path dir file-name)) content))
    (let [calls   (atom [])
          exit    (atom 0)
          printed (with-out-str
                    (with-redefs [shell/sh* (fake-sh calls)]
                      (try
                        (module-history/cli-update
                         {:options (merge {:dir        (str dir)
                                           :publish    (str (fs/path dir "publish.edn"))
                                           :no-measure true}
                                          options)})
                        (catch clojure.lang.ExceptionInfo e
                          (reset! exit (:babashka/exit (ex-data e)))))))]
      (try
        {:exit    @exit
         :calls   (mapv (fn [call]
                          (mapv #(-> (str %)
                                     (str/replace (str dir) "DIR")
                                     (str/replace #"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ" "STAMP"))
                                call))
                        @calls)
         :page    (when (fs/exists? (fs/path dir "page.html")) (slurp (str (fs/path dir "page.html"))))
         :printed printed}
        (finally
          (fs/delete-tree dir))))))

(def ^:private config
  {:pages    [{:template "template.html", :file "page.html"}]
   :metabase {:profile "stats", :uploads {"history.csv" 11, "cycles.csv" 12}, :cards [21]}
   :shares   {"page.html" "slug-a1"}})

(def ^:private files
  {"history.csv"  "sha\n"
   "cycles.csv"   "sha\n"
   "history.json" "{\"commits\": [{}, {}], \"today\": [], \"clusters\": [\"tardis\"]}"})

(deftest publish-test
  (testing "pages are written, then uploads replaced, cards refreshed and shares updated"
    (is (= {:exit  0
            :page  "2 of [\"tardis\"]"
            :calls [["mb" "upload" "replace" "12" "--file" "DIR/cycles.csv" "--profile" "stats" "--json"
                     "--max-bytes" "0"]
                    ["mb" "upload" "replace" "11" "--file" "DIR/history.csv" "--profile" "stats" "--json"
                     "--max-bytes" "0"]
                    ["mb" "card" "get" "21" "--full" "--profile" "stats" "--json" "--max-bytes" "0"]
                    ;; Only the query is sent, with the rest of it unchanged.
                    ["mb" "card" "update" "21" "--file"
                     (str "{\"dataset_query\":{\"database\":1,\"stages\":"
                          "[{\"native\":\"select 1\\n-- refreshed by mage module-history at STAMP\"}]}}")
                     "--profile" "stats" "--json" "--max-bytes" "0"]
                    ["share" "-e" "DIR/page.html" "slug-a1"]]}
           (dissoc (publish! config files {}) :printed)))))

(deftest publish-dry-run-test
  (testing "a dry run writes the page, runs nothing, and prints what it would run"
    (let [{:keys [printed], :as result} (publish! config files {:dry-run true})]
      (is (= {:exit 0, :page "2 of [\"tardis\"]", :calls []}
             (dissoc result :printed)))
      (is (= ["mb upload replace 12" "mb upload replace 11" "Would refresh card" "share -e"]
             (re-seq #"mb upload replace \d+|Would refresh card|share -e" printed))))))

(deftest publish-missing-file-test
  (testing "nothing is written or published when a file the config names is not there"
    (is (= {:exit 1, :page nil, :calls []}
           (dissoc (publish! config (dissoc files "cycles.csv") {}) :printed)))))

(deftest publish-bad-config-test
  (testing "a config with a mistake stops the run before anything else happens"
    (is (= {:exit 1, :page nil, :calls []}
           (dissoc (publish! (assoc config :share {}) files {}) :printed)))))
