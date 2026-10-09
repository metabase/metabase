(ns metabase.metabot.tools.recoverable.pipeline-test
  "Guards the one gap `with-pipeline-errors` cannot close by itself.

  The converter maps a pipeline `:error` code onto a declaration by name. A code with no declaration
  is not converted, so it becomes unrecoverable and ends the turn — silently, and only in production.
  This test reads the pipeline's own sources and fails while the gap is still cheap to close."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.recovery-hints :as v2-hints]
   [metabase.metabot.tools.error :as tools.error]
   ;; loaded for its declarations; the codes are read out of the catalog, not off the vars
   [metabase.metabot.tools.recoverable.pipeline]
   [metabase.metabot.tools.recovery-hints :as v1-hints]))

(set! *warn-on-reflection* true)

(def ^:private pipeline-sources
  "The namespaces that raise representations-pipeline errors, as classpath resource paths.

  Listed rather than globbed: a glob would quietly stop covering a file that moved, which is the
  exact failure this test exists to catch."
  ["metabase/agent_lib/representations.clj"
   "metabase/agent_lib/representations/repair.clj"
   "metabase/agent_lib/representations/resolve.clj"
   "metabase/metabot/tools/construct.clj"
   "metabase/models/serialization/resolve/mp.clj"])

(def ^:private error-code-pattern
  "Matches `:error :some-code` in ex-data, which is how the pipeline tags an error for its caller."
  #":error\s+:([a-z0-9][a-z0-9-]*)")

(defn- codes-in-source
  [path]
  (let [resource (io/resource path)]
    (is (some? resource) (str "pipeline source " path " is not on the classpath — has it moved?"))
    (when resource
      (into #{} (map (comp keyword second)) (re-seq error-code-pattern (slurp resource))))))

(defn- pipeline-codes
  []
  (into #{} (mapcat codes-in-source) pipeline-sources))

(def ^:private declaration-ns
  "Where the declarations live. A literal, and self-guarding: if the namespace is renamed without
  this following, [[declared-codes]] comes back empty and the first test below fails naming every
  code as missing."
  "metabase.metabot.tools.recoverable.pipeline")

(defn- declared-codes
  []
  (into #{}
        (comp (filter #(= declaration-ns (namespace %)))
              (map (comp keyword name)))
        (keys (tools.error/recoverables))))

(deftest every-pipeline-error-code-has-a-declaration-test
  (let [missing (set/difference (pipeline-codes) (declared-codes))]
    (is (empty? missing)
        (str "These representations-pipeline :error codes have no declaration in "
             "metabase.metabot.tools.recoverable.pipeline, so `tools.core/with-pipeline-errors` "
             "will not convert them and they will end the turn instead of teaching the agent: "
             (pr-str (sort missing))
             ". Add a `defpipeline-error` for each, or decide it really is unrecoverable and say so "
             "in a comment there."))))

(deftest no-stale-declarations-test
  (testing "a declaration for a code the pipeline no longer raises is dead text that nobody will
           notice has drifted"
    (let [stale (set/difference (declared-codes) (pipeline-codes))]
      (is (empty? stale)
          (str "These declarations in metabase.metabot.tools.recoverable.pipeline match no `:error` "
               "code in the pipeline sources: " (pr-str (sort stale))
               ". Remove them, or add the source file that raises them to `pipeline-sources`.")))))

(deftest the-scan-finds-something-test
  (testing "a regex that stopped matching would make both tests above pass vacuously"
    (is (< 20 (count (pipeline-codes))))
    (is (contains? (pipeline-codes) :unknown-table))))

;;; ===== Can one declaration serve both surfaces? =====

;; The pipeline is shared by Metabot (portable FKs, `read_resource`) and MCP v2 (numeric ids,
;; `browse_data`), and each surface keeps its own hint table today — `tools/recovery_hints.clj` and
;; `mcp/v2/recovery_hints.clj`, the same error codes written twice. These tests establish what one
;; shared declaration could and could not replace, before anything is moved.

(tools.error/defrecoverable two-surface-error!
  "A stand-in for a pipeline error declared with both surfaces' recovery steps."
  {:payload [:map {:closed true} [:message :string]]}
  [{:keys [message]}]
  {:message  message
   :recovery [{:uses #{"read_resource"}
               :text (str "Call `read_resource` with `metabase://database/<numeric id>/tables`, then "
                          "retry with an exact portable FK.")}
              {:uses #{"browse_data"}
               :text (str "Call `browse_data` with action `list_tables`, then use a numeric table id "
                          "as `source-table`.")}
              {:uses #{}
               :text "`source-table:` takes a portable FK `[<db-name>, <schema>, <table>]`."}]})

(defn- text-for!
  "The text a caller holding `tool-names` reads for this error. Named with `!` because it goes
  through the throwing constructor, which is the point — it reads the real declaration."
  [tool-names]
  (-> (try (two-surface-error! {:message "No table found."}) (catch Throwable e e))
      tools.error/classify
      (tools.error/recoverable-text tool-names)))

(deftest ^:parallel one-declaration-can-carry-both-surfaces-vocabularies-test
  (testing "`:uses` selects the right surface's step, so a single declaration can replace the two
           per-surface hint tables for every step that names a tool"
    (let [metabot (text-for! #{"read_resource" "search"})
          mcp     (text-for! #{"browse_data" "search"})]
      (testing "the pipeline's own sentence reaches both"
        (is (str/includes? metabot "No table found."))
        (is (str/includes? mcp "No table found.")))
      (testing "each surface gets its own vocabulary and not the other's"
        (is (str/includes? metabot "portable FK"))
        (is (not (str/includes? metabot "browse_data")))
        (is (str/includes? mcp "numeric table id"))
        (is (not (str/includes? mcp "read_resource")))))))

(deftest ^:parallel a-step-naming-no-tool-cannot-be-told-apart-by-surface-test
  (testing "RECORDED, NOT SOLVED. `:uses` discriminates on which tools a caller has, which is not
           the same question as which dialect it writes. A step that names no tool survives into
           every surface — correct for advice about data the agent already holds, wrong for advice
           about argument format.

           Two of the declarations in this namespace have exactly that shape: `database-name-step`
           and `first-stage-source-step` both say `portable FK`, both name no tool, and would
           therefore reach an MCP v2 caller that writes numeric ids. Moving v2 onto these
           declarations needs those two steps keyed on something else — a `:dialect` on the step,
           or the dialect var the pipeline already binds."
    (is (str/includes? (text-for! #{"browse_data"}) "portable FK")
        "the dialect-specific, tool-free step reaches the numeric-id surface")))

(deftest ^:parallel the-two-hint-tables-cover-the-same-codes-test
  (testing "the per-surface hint tables answer the same set of codes, which is why one declaration
           per code is the right shape for them. A code one table answers and the other does not
           would mean the surfaces disagree about what is recoverable."
    (let [codes [:uri-in-source-table :unknown-table :unknown-table-id :ambiguous-table
                 :unknown-field :unknown-field-id :ambiguous-fk :no-fk-path
                 :unknown-card :unknown-card-id :unknown-measure :unknown-measure-id
                 :unknown-segment :unknown-segment-id :unknown-database
                 :missing-source-in-first-stage]]
      (doseq [code codes]
        (testing code
          (is (some? (v1-hints/recovery-hint {:error code :entity-type "table" :entity-id 1})))
          (is (some? (v2-hints/recovery-hint {:error code :entity-type "table" :entity-id 1})))))
      (testing "and every one of them is declared here"
        (is (= #{} (set/difference (set codes) (declared-codes))))))))
