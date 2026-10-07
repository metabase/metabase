(ns metabase.metabot.tools.protocols-spike-test
  "SPIKE — tools as records implementing protocols. Delete before merging.

  Two cases, chosen because they stress different halves of the idea:

  - `search`, where four tools in the codebase today are the same tool under different
    configuration. Four `mu/defn`s with four duplicated metadata blocks become one record type and
    four instances, and the thing they share stops being a coincidence you have to notice.
  - `read_resource`, where the tool does one thing per item. It implements `BatchedTool` as well,
    and its `handle` says so in one line.

  Internals are stubbed; the control flow and every error decision mirror the real tools."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; search — one record, four instances
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(def ^:private search-args
  [:map {:closed true}
   [:keyword_queries [:sequential :string]]
   [:limit {:optional true} [:maybe :int]]])

(def ^:private sql-search-args
  [:map {:closed true}
   [:keyword_queries [:sequential :string]]
   [:database_id :int]
   [:limit {:optional true} [:maybe :int]]])

(defn- search-display
  "The title shown while the tool runs. Shared by every search variant — which the record makes a
  fact rather than four copies of the same metadata key."
  [{:keys [keyword_queries]}]
  (str/join ", " keyword_queries))

(defn- do-search
  "Stands in for the real `do-search`: the one body all four variants already share."
  [label allowed-types opts args]
  {:output            (format "<search label=\"%s\" types=\"%s\" opts=\"%s\">%s</search>"
                              label
                              (str/join "," (sort allowed-types))
                              (pr-str opts)
                              (str/join ", " (:keyword_queries args)))
   :structured-output {:result-type :search :label label}})

(defrecord SearchTool [tool-name description args allowed-types opts]
  tools/Tool
  (declaration [this]
    {:name         (:tool-name this)
     :description  (:description this)
     :args         (:args this)
     :scope        scope/agent-search
     :metabot/title-fn search-display})
  (handle [this args _ctx]
    (do-search (:tool-name this) (:allowed-types this) (:opts this) args)))

;;; The four tools. What varies is visible; what is shared is in the record.

(def search-tool
  (->SearchTool "search"
                (str "Find tables, models, metrics, dashboards, documents, and saved questions by "
                     "topic across the instance.")
                search-args
                #{"dashboard" "document" "metric" "model" "question" "table"}
                {}))

(def sql-search-tool
  (->SearchTool "search"
                "Find SQL-queryable data sources (tables and models) within a specific database."
                sql-search-args
                #{"model" "table"}
                {:scoped-to-database? true}))

(def nlq-search-tool
  (->SearchTool "search"
                "Find NLQ-queryable data sources by topic, or dashboards and documents to save into."
                search-args
                #{"dashboard" "document" "metric" "model" "question" "table"}
                {:profile-id "nlq"}))

(def transform-search-tool
  (->SearchTool "search"
                "Find transforms, plus the tables and models around them, by topic."
                search-args
                #{"model" "table" "transform"}
                {:search-native-query true}))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; read_resource — a single-item tool that can also take several
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(tools.error/defrecoverable unreadable-uri!
  "The string is not a Metabase resource URI."
  {:payload [:map {:closed true} [:uri :string]]}
  [{:keys [uri]}]
  {:message  (str (pr-str uri) " is not a Metabase resource URI.")
   :recovery [{:uses #{"search"}
               :text "Call `search` and feed a URI from its results back here."}]})

(def ^:private fake-tables
  {1 {:name "orders" :fields ["id" "total"]}
   2 {:name "people" :fields ["id" "email"]}})

(def ^:private uri-schema
  "Shared between the single and the batched declaration, so the two cannot drift."
  [:string {:description "A metabase:// resource URI."}])

(def ^:private max-uris 5)

(defn- prefetch-tables!
  "Stands in for the batching `read_resource` does not do yet (`mapv`, with a pmap TODO) and for the
  cache `list_available_fields` already uses. A failure here fails the whole call, on purpose: a dead
  connection is one fault, not N misses."
  [uris]
  (when (some #(str/includes? % "/dbdown") uris)
    (throw (ex-info "H2 connection reset: user=mb_admin" {:sql "SELECT 1"})))
  ::warm)

(defrecord ReadResourceTool []
  tools/Tool
  ;; The single form. Take `BatchedTool` away and this is a complete, working tool that reads one
  ;; URI — which is why `handle` needs no second per-item function beside it.
  (declaration [_]
    {:name        "read_resource"
     :description "Read detailed information about one Metabase resource via its URI."
     :scope       scope/agent-resource-read
     :args        [:map {:closed true} [:uri uri-schema]]})
  (handle [_ {:keys [uri]} _ctx]
    (if-not (str/starts-with? uri "metabase://")
      (unreadable-uri! {:uri uri})
      (let [[kind id] (str/split (subs uri (count "metabase://")) #"/")]
        (if-let [table (and (= "table" kind) (get fake-tables (parse-long (str id))))]
          {:output            (format "<table name=\"%s\">%s</table>"
                                      (:name table) (str/join ", " (:fields table)))
           :structured-output table}
          (tools/with-entity {:kind :table :id id}
            (throw (ex-info "Not found." {:status-code 404})))))))

  tools/BatchedTool
  (batched-declaration [_ declared]
    ;; Complete, and composed by the tool. Nothing derives it, which is why the wire format can stay
    ;; a list of strings rather than becoming a list of {"uri": …} maps.
    (-> declared
        (assoc :description
               (str "Read detailed information about Metabase resources via URI patterns. "
                    "Up to " max-uris " URIs may be requested in one call."))
        (assoc :args [:map {:closed true}
                      [:uris [:sequential {:min 1 :max max-uris} uri-schema]]])))
  (batched-args [_ {:keys [uris]}]
    (mapv (fn [uri] {:uri uri}) uris))
  (around-batch [_ item-args _ctx run]
    (prefetch-tables! (map :uri item-args))
    (run))
  (compose [_ entries _ctx]
    ;; Each item in its own element, so a failure sits inside the element for the URI it belongs to
    ;; — what the tool does today via `format-resources`' `**Error:**` branch. The one thing
    ;; `concatenated` cannot give is `:data-parts`: the tool emits a *single* title part built from
    ;; the items that loaded, so that key is not per-item.
    (cond-> {:output (str "<resources>\n"
                          (str/join "\n"
                                    (for [{:keys [item output]} entries]
                                      (format "<resource uri=\"%s\">\n%s\n</resource>"
                                              (:uri item) output)))
                          "\n</resources>")}
      (seq (remove :failed? entries))
      (assoc :data-parts [{:type      :data
                           :data-type "tool-title"
                           :data      (->> entries
                                           (remove :failed?)
                                           (keep (comp :name :structured-output))
                                           distinct
                                           (str/join ", "))}]))))

(def read-resource-tool (->ReadResourceTool))

;;; A batched tool that wants nothing special. Each `batched-…` is one line, and the delegation in
;;; `around-batch` and `compose` is the whole answer to Clojure's missing protocol defaults.

(def ^:private skill-id-schema [:string {:description "A skill id."}])

(defrecord LoadSkillTool []
  tools/Tool
  (declaration [_]
    {:name        "load_skill"
     :description "Load the full instructions for one skill."
     :args        [:map {:closed true} [:id skill-id-schema]]})
  (handle [_ {:keys [id]} _ctx]
    (if (= "unknown" id)
      (unreadable-uri! {:uri id})
      {:output (format "<skill id=\"%s\">…body…</skill>" id)}))

  tools/BatchedTool
  (batched-declaration [_ declared]
    (-> declared
        (assoc :description "Load the full instructions for one or more skills.")
        (assoc :args [:map {:closed true} [:ids [:sequential {:min 1} skill-id-schema]]])))
  (batched-args [_ {:keys [ids]}] (mapv (fn [id] {:id id}) ids))
  (around-batch [_ _item-args _ctx run] (run))
  (compose [_ entries _ctx] (tools/concatenated entries)))

(def load-skill-tool (->LoadSkillTool))

;;; A batched tool whose items are heterogeneous. Here the single schema goes in whole, which is the
;;; payoff of `batched-declaration` receiving it: three parallel id lists become one addressable list.

(defrecord LoadEntityTool []
  tools/Tool
  (declaration [_]
    {:name        "load_entity"
     :description "Get metadata for one table, model or metric."
     :args        [:map {:closed true}
                   [:kind [:enum "table" "model" "metric"]]
                   [:id :int]]})
  (handle [_ {:keys [kind id]} _ctx]
    (if (and (= "table" kind) (get fake-tables id))
      {:output            (format "<table name=\"%s\"/>" (:name (get fake-tables id)))
       :structured-output {:kind kind :id id :name (:name (get fake-tables id))}}
      (tools/with-entity {:kind (keyword kind) :id id}
        (throw (ex-info "Not found." {:status-code 404})))))

  tools/BatchedTool
  (batched-declaration [_ declared]
    (-> declared
        (assoc :description "Get metadata for several tables, models or metrics.")
        (assoc :args [:map {:closed true}
                      ;; The single schema, embedded verbatim.
                      [:items [:sequential {:min 1 :max 20} (:args declared)]]])))
  (batched-args [_ {:keys [items]}] (vec items))
  (around-batch [_ _item-args _ctx run] (run))
  (compose [_ entries _ctx]
    ;; One document grouped by kind: no per-item positions, so failures go in a block.
    (let [{loaded false failed true} (group-by :failed? entries)]
      {:output (str (str/join "\n" (map :output loaded))
                    (when (seq failed)
                      (str "\n\nThese could not be loaded:\n"
                           (str/join "\n" (for [{:keys [item output]} failed]
                                            (let [[head & tail] (str/split-lines output)]
                                              (str/join "\n"
                                                        (cons (str "- " (:kind item) " " (:id item)
                                                                   ": " head)
                                                              (map #(str "  " %) tail)))))))))})))

(def load-entity-tool (->LoadEntityTool))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; Tests
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(def ^:private entries
  (tools/entries [search-tool read-resource-tool load-skill-tool load-entity-tool]))

(defn- invoke
  ([tool args] (invoke #{"search" "read_resource" "load_skill" "load_entity"} tool args))
  ([tool-names tool args]
   (binding [scope/*current-user-scope* #{"*"}]
     (tools.runtime/invoke entries
                           {:profile-id :nlq :metabot-id nil :tool-names tool-names}
                           tool args))))

;;; ── the single form is a real tool ────────────────────────────────────────────────────────────

(deftest ^:parallel the-single-form-works-on-its-own-test
  (testing "take BatchedTool away and the record is still a working tool"
    (is (= {:output            "<table name=\"orders\">id, total</table>"
            :structured-output {:name "orders" :fields ["id" "total"]}}
           (tools/handle read-resource-tool {:uri "metabase://table/1"} {}))))
  (testing "its declaration is a complete, publishable single-item declaration"
    (is (= {:name        "read_resource"
            :description "Read detailed information about one Metabase resource via its URI."
            :scope       scope/agent-resource-read
            :args        [:map {:closed true} [:uri uri-schema]]}
           (tools/declaration read-resource-tool))))
  (testing "and a record that implements only Tool is invoked directly, with no branch taken"
    (let [single (reify tools/Tool
                   (declaration [_] {:name "one_only" :description "d"
                                     :args [:map {:closed true} [:uri uri-schema]]})
                   (handle [_ {:keys [uri]} _] {:output (str "read " uri)}))]
      (is (not (tools/batched? single)))
      (is (= {:output "read x"}
             (binding [scope/*current-user-scope* #{"*"}]
               (tools.runtime/invoke (tools/entries [single])
                                     {:profile-id :nlq :metabot-id nil :tool-names #{"one_only"}}
                                     "one_only" {:uri "x"})))))))

;;; ── what the consumer publishes ───────────────────────────────────────────────────────────────

(deftest ^:parallel the-batched-declaration-is-what-gets-published-test
  (let [{:keys [declaration]} (get entries "read_resource")]
    (testing "the batched args, composed by the tool — so the wire format stays a list of strings"
      (is (= [:map {:closed true}
              [:uris [:sequential {:min 1 :max 5} uri-schema]]]
             (:args declaration))))
    (testing "the description gained its per-call limit sentence"
      (is (str/ends-with? (:description declaration)
                          "Up to 5 URIs may be requested in one call.")))
    (testing "and the name, scope and extras passed through"
      (is (= "read_resource" (:name declaration)))
      (is (= scope/agent-resource-read (:scope declaration))))))

(deftest ^:parallel a-heterogeneous-tool-embeds-its-single-schema-whole-test
  (testing "the payoff of batched-declaration receiving the single declaration"
    (is (= [:map {:closed true}
            [:items [:sequential {:min 1 :max 20}
                     [:map {:closed true}
                      [:kind [:enum "table" "model" "metric"]]
                      [:id :int]]]]]
           (:args (:declaration (get entries "load_entity")))))))

(deftest ^:parallel both-declarations-are-validated-test
  (testing "a batched declaration the tool composed wrongly fails at load time, not on the first call"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid tool declaration"
         (tools/validate-tool!
          (reify
            tools/Tool
            (declaration [_] {:name "b" :description "d" :args [:map {:closed true}]})
            (handle [_ _ _] {:output ""})
            tools/BatchedTool
            (batched-declaration [_ d] (dissoc d :description))
            (batched-args [_ _] [])
            (around-batch [_ _ _ run] (run))
            (compose [_ es _] (tools/concatenated es))))))))

;;; ── the batched call ──────────────────────────────────────────────────────────────────────────

(deftest ^:parallel a-failed-item-sits-in-its-own-element-test
  (let [outcome (invoke "read_resource" {:uris ["metabase://table/1" "nope" "metabase://table/9"]})]
    (is (nil? (:error outcome)) "a partial failure is not a failed call")
    (is (= ["<resources>"
            "<resource uri=\"metabase://table/1\">"
            "<table name=\"orders\">id, total</table>"
            "</resource>"
            "<resource uri=\"nope\">"
            "\"nope\" is not a Metabase resource URI."
            "Call `search` and feed a URI from its results back here."
            "</resource>"
            "<resource uri=\"metabase://table/9\">"
            "Table 9 was not found. It may not exist, or you may not have access to it."
            "Call `search` to find the entity you want and use an id from the results."
            "</resource>"
            "</resources>"]
           (str/split-lines (:output outcome))))
    (is (mr/validate ::tools.runtime/outcome outcome))))

(deftest ^:parallel compose-exists-for-the-single-title-part-test
  (is (= [{:type :data :data-type "tool-title" :data "orders, people"}]
         (:data-parts (invoke "read_resource" {:uris ["metabase://table/1" "metabase://table/2"
                                                      "nope"]}))))
  (testing "and none when nothing loaded"
    (is (nil? (:data-parts (invoke "read_resource" {:uris ["nope"]}))))))

(deftest ^:parallel delegating-is-the-whole-default-test
  (testing "load_skill wants nothing special; around-batch and compose are one line each"
    (is (= ["<skill id=\"a\">…body…</skill>"
            "<skill id=\"b\">…body…</skill>"]
           (str/split-lines (:output (invoke "load_skill" {:ids ["a" "b"]})))))
    (testing "and a failed item still lands in position"
      (is (= ["<skill id=\"a\">…body…</skill>"
              "\"unknown\" is not a Metabase resource URI."
              "Call `search` and feed a URI from its results back here."]
             (str/split-lines (:output (invoke "load_skill" {:ids ["a" "unknown"]}))))))))

(deftest ^:parallel heterogeneous-items-stay-addressable-test
  (let [outcome (invoke "load_entity" {:items [{:kind "table" :id 1}
                                               {:kind "table" :id 77}
                                               {:kind "metric" :id 88}]})]
    (is (nil? (:error outcome)))
    (is (= ["<table name=\"orders\"/>"
            ""
            "These could not be loaded:"
            "- table 77: Table 77 was not found. It may not exist, or you may not have access to it."
            "  Call `search` to find the entity you want and use an id from the results."
            "- metric 88: Metric 88 was not found. It may not exist, or you may not have access to it."
            "  Call `search` to find the entity you want and use an id from the results."]
           (str/split-lines (:output outcome))))))

(deftest ^:parallel recovery-steps-are-filtered-once-for-everyone-test
  (testing "an item's failure gets the filtering a whole failed call gets"
    (let [outcome (invoke #{"read_resource"} "read_resource" {:uris ["nope"]})]
      (is (not (str/includes? (:output outcome) "`search`")))
      (is (str/includes? (:output outcome) "\"nope\" is not a Metabase resource URI.")))))

(deftest ^:parallel around-batch-failure-fails-the-whole-call-test
  (testing "it wraps the run, so a dead connection is one fault and not a per-item failure"
    (let [outcome (invoke "read_resource" {:uris ["metabase://table/1" "metabase://table/dbdown"]})]
      (is (= {:class :unrecoverable :code :internal} (:error outcome)))
      (doseq [leak ["H2" "mb_admin" "SELECT"]]
        (is (not (str/includes? (:output outcome) leak)) (str "leaked " leak))))))

(deftest ^:parallel an-undeclared-exception-in-an-item-ends-the-turn-test
  (testing "the items that did load are discarded on purpose: a bug is not a partial result"
    (let [crashing (reify
                     tools/Tool
                     (declaration [_] {:name "crash" :description "d"
                                       :args [:map {:closed true} [:n :int]]})
                     (handle [_ {:keys [n]} _] (if (= 2 n)
                                                 (throw (ex-info "a real bug: hunter2"
                                                                 {:pw "hunter2"}))
                                                 {:output "fine"}))
                     tools/BatchedTool
                     (batched-declaration [_ d]
                       (assoc d :args [:map {:closed true} [:ns [:sequential :int]]]))
                     (batched-args [_ {:keys [ns]}] (mapv (fn [n] {:n n}) ns))
                     (around-batch [_ _ _ run] (run))
                     (compose [_ es _] (tools/concatenated es)))
          outcome  (binding [scope/*current-user-scope* #{"*"}]
                     (tools.runtime/invoke (tools/entries [crashing])
                                           {:profile-id :nlq :metabot-id nil :tool-names #{"crash"}}
                                           "crash" {:ns [1 2]}))]
      (is (= {:class :unrecoverable :code :internal} (:error outcome)))
      (doseq [secret ["hunter2" "a real bug" "fine"]]
        (is (not (str/includes? (:output outcome) secret)) (str "leaked " secret))))))

;;; ── the variant case ──────────────────────────────────────────────────────────────────────────

(deftest ^:parallel variants-are-instances-not-copies-test
  (testing "all four share a type, a scope, a title function and a body"
    (let [variants [search-tool sql-search-tool nlq-search-tool transform-search-tool]]
      (is (every? #(instance? SearchTool %) variants))
      (is (= [scope/agent-search] (distinct (map (comp :scope tools/declaration) variants))))
      (is (= [search-display] (distinct (map (comp :metabot/title-fn tools/declaration) variants))))
      (is (= ["search"] (distinct (map (comp :name tools/declaration) variants))))))
  (testing "and differ only in the fields they were constructed with"
    (is (= #{"model" "table"} (:allowed-types sql-search-tool)))
    (is (= {:profile-id "nlq"} (:opts nlq-search-tool)))
    (is (not= (:args search-tool) (:args sql-search-tool)))))

(deftest ^:parallel each-variant-declares-validly-test
  (doseq [tool [search-tool sql-search-tool nlq-search-tool transform-search-tool]]
    (is (mr/validate ::tools/declaration (tools/validate-tool! tool)))))

(deftest ^:parallel a-variants-config-reaches-its-body-test
  (is (= (str "<search label=\"search\" types=\"dashboard,document,metric,model,question,table\" "
              "opts=\"{}\">orders</search>")
         (:output (invoke "search" {:keyword_queries ["orders"]}))))
  (testing "a different instance, same code path"
    (is (= "<search label=\"search\" types=\"model,table,transform\" opts=\"{:search-native-query true}\">orders</search>"
           (:output (tools/handle transform-search-tool {:keyword_queries ["orders"]} {}))))))

(deftest ^:parallel reify-is-enough-for-a-test-double-test
  (testing "no macro, no var metadata, no registry — a tool is just a value"
    (is (= {:output "stub"}
           (tools/handle (reify tools/Tool
                           (declaration [_] {:name "x" :description "d" :args :any})
                           (handle [_ _ _] {:output "stub"}))
                         {} {})))))

;;; ── recorded, not decided ─────────────────────────────────────────────────────────────────────

(deftest ^:parallel item-cap-is-now-just-a-schema-test
  (testing "the cap lives in the batched args the tool composed. The generated message is still
           worse than read_resource's hand-written one:

             Too many URIs provided (6). Please limit to 5 URIs maximum. Be more selective and
             focus on the most relevant items for the current task or fetch them in batches."
    (is (= "Invalid tool arguments: `uris` should have at most 5 elements; received an array."
           (:output (invoke "read_resource" {:uris ["a" "b" "c" "d" "e" "f"]}))))))

(deftest ^:parallel everything-failed-is-still-a-success-test
  (testing "OPEN QUESTION — every item failed, so nothing was delivered, yet the call succeeds and
           its whole output is failure text. Arguably it should fail, but as which error? There is
           no code for \"your five items were five different kinds of missing\", and collapsing them
           loses the attribution the agent needs to retry."
    (let [outcome (invoke "read_resource" {:uris ["nope" "also-nope"]})]
      (is (nil? (:error outcome)))
      (is (= 2 (count (re-seq #"is not a Metabase resource URI" (:output outcome))))))))
