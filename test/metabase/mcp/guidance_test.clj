(ns metabase.mcp.guidance-test
  "The guidance layer may only teach tools the server actually registers.

   Instructions, skills, and prompts are served live: a client is handed them on connect and follows
   them. Guidance that names a tool the manifest does not carry is worse than no guidance — the agent
   spends a turn on a call that comes back `Unknown tool`, and the user watches it flounder. These
   tests hold every tool named anywhere under `resources/mcp/` to the live manifest."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.tools :as mcp.tools]))

(set! *warn-on-reflection* true)

(def ^:private tool-verbs
  "The verbs a Metabase tool name is built from. A backticked identifier that leads with one of these,
   or that ends in `_write`, is the model being told to *call* something — as opposed to a parameter, a
   JSON key, or an MBQL operator, which the guidance also backticks."
  #{"search" "query" "browse" "get" "list" "read" "execute" "construct" "create" "update" "delete"
    "archive" "render" "visualize" "run" "add" "remove" "move" "duplicate" "bookmark" "revert"})

(def ^:private non-tool-identifiers
  "Identifiers that are tool-shaped but name something else, so they are exempt.

   Keep this list short and boring. It is for enum values and parameter names that happen to lead with a
   verb — never for a tool that doesn't exist yet. An entry here silences a real drift, which is the one
   thing this namespace exists to catch."
  #{"get_fields" "list_databases" "list_schemas" "list_tables" ; `browse_data` action values
    "query_handle"})                                           ; the handle parameter

(def ^:private min-tools-referenced
  "The guidance walks the agent through the whole workflow, so it names most of the catalog. A floor,
   so an extractor that silently stops matching fails instead of passing with nothing to check."
  15)

(defn- guidance-files
  "Every markdown file the guidance layer ships, read off the classpath — the same place the server reads
   them from. Every classpath entry named `mcp` is walked, not just the first: `io/resource` would return
   whichever one wins, and an empty one shadowing the real one would leave nothing to check."
  []
  (->> (.getResources (.getContextClassLoader (Thread/currentThread)) "mcp")
       enumeration-seq
       (filter #(= "file" (.getProtocol ^java.net.URL %)))
       (mapcat (comp file-seq io/file))
       (filter #(.isFile ^java.io.File %))
       (filter #(str/ends-with? (.getName ^java.io.File %) ".md"))
       distinct))

(defn- tool-mentions
  "Every identifier `markdown` names as a tool: a backticked bare identifier (`` `execute_query` ``) or
   one in call form (`` `browse_data(action: ...)` ``)."
  [markdown]
  (into #{}
        (comp (mapcat #(re-seq % markdown))
              (map second))
        [#"`([a-z][a-z0-9_]*)`" #"`([a-z][a-z0-9_]*)\("]))

(defn- tool-shaped?
  "True when `identifier` reads as a call rather than as a parameter or an operator."
  [identifier]
  (let [segments (str/split identifier #"_")]
    (and (< 1 (count segments))
         (or (tool-verbs (first segments))
             (= "write" (last segments))))))

(defn- live-tool-names
  "Every tool name the server registers, across every scope and both sources (the agent-api manifest and
   the UI tools)."
  []
  (into #{} (map :name) (mcp.tools/list-tools nil)))

(defn- undefined-tools
  "The tools `markdown` names that the manifest does not carry."
  [markdown live]
  (-> (into #{} (filter #(or (live %) (tool-shaped? %))) (tool-mentions markdown))
      (set/difference live non-tool-identifiers)))

(deftest guidance-names-only-live-tools-test
  (let [live  (live-tool-names)
        files (guidance-files)]
    (is (seq live) "the manifest is empty, so every assertion below would pass vacuously")
    (is (<= 5 (count files)) "the guidance files were not found on the classpath")
    (doseq [^java.io.File file files]
      (testing (.getName file)
        (let [markdown (slurp file)
              missing  (undefined-tools markdown live)]
          (is (empty? missing)
              (str (.getPath file) " teaches tools that do not exist: " (str/join ", " (sort missing))
                   ". Every tool the guidance names has to be in the manifest — rewrite the workflow "
                   "around a tool that exists, or drop it.")))))))

(deftest guidance-covers-the-catalog-test
  (testing "the guidance names most of the catalog, so the check above has something to check"
    (let [live       (live-tool-names)
          referenced (into #{}
                           (comp (mapcat (comp tool-mentions slurp))
                                 (filter live))
                           (guidance-files))]
      (is (<= min-tools-referenced (count referenced))
          (str "only " (count referenced) " live tools are named across the guidance: "
               (str/join ", " (sort referenced))))))
  (testing "every skill, prompt, and the instructions route the agent to at least one real tool — a
            reference file is a catalog and is exempt, since it explains a grammar rather than a call"
    (let [live    (live-tool-names)
          routing (remove #(str/includes? (.getPath ^java.io.File %) "/references/") (guidance-files))]
      (is (<= 5 (count routing)))
      (doseq [^java.io.File file routing]
        (testing (.getName file)
          (is (seq (filter live (tool-mentions (slurp file))))))))))

(deftest guidance-extractor-catches-a-dead-tool-test
  (testing "the extractor recognizes the shapes a tool is named in — without this, an extractor that
            matched nothing would make every test above pass"
    (let [live #{"execute_query" "search"}]
      (testing "a tool that no longer exists is caught in prose"
        (is (= #{"dashboard_write"}
               (undefined-tools "Assemble it with one `dashboard_write` call." live))))
      (testing "and in call form"
        (is (= #{"run_saved_question"}
               (undefined-tools "Re-run it: `run_saved_question(id: 7)`." live))))
      (testing "every write tool the guidance used to teach is tool-shaped, so none can slip back in"
        (is (= #{"question_write" "document_write" "bookmark_content" "add_timeline_event"
                 "duplicate_content" "revert_content" "measure_write"}
               (undefined-tools (str "`question_write` `document_write` `bookmark_content` "
                                     "`add_timeline_event` `duplicate_content` `revert_content` "
                                     "`measure_write`")
                                live)))))
    (testing "a live tool, a parameter, and an MBQL operator are all left alone"
      (is (empty? (undefined-tools "`execute_query` takes `query_handle`, `filters`, and `["
                                   #{"execute_query"}))))))
