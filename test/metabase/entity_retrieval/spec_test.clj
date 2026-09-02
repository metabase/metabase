(ns metabase.entity-retrieval.spec-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest declaration-registry-test
  (testing "all four source models register a source and a :library-index projection"
    (let [projections (spec/projections :library-index)]
      (is (= #{:model/Table :model/Card :model/Measure :model/Segment}
             (set (keys projections))))
      (doseq [model spec/source-models]
        (is (some? (spec/source model)) (str model " has a source declaration")))))
  (testing "all four source models register an :osi-context projection with a :basis"
    (let [projections (spec/projections :osi-context)]
      (is (= #{:model/Table :model/Card :model/Measure :model/Segment}
             (set (keys projections))))
      (doseq [[model decl] projections]
        (is (seq (:basis decl)) (str model " declares a :basis")))))
  (testing ":library-index declares no :basis — the index diffs content, the field would be dead"
    (doseq [[model decl] (spec/projections :library-index)]
      (is (nil? (:basis decl)) (str model)))))

(defn- do-with-registry-snapshot
  "Run `thunk`, then restore the spec registry, so a registration a buggy validator lets through cannot
  leak fake declarations into other tests."
  [thunk]
  (let [decls      (var-get #'spec/declarations)
        snap-decls @decls]
    (try
      (thunk)
      (finally
        (reset! decls snap-decls)))))

(deftest define-source-validation-test
  (do-with-registry-snapshot
   (fn []
     ;; positive control first — if this base decl were itself invalid, every rejection below would pass
     ;; vacuously.
     (let [valid {:model       :model/SpecTestFake
                  :entity-type "fake"
                  :fields      [:id :name]}]
       (testing "a well-formed declaration registers"
         (is (= :model/SpecTestFake (spec/register-source! :model/SpecTestFake valid))))
       (testing "the schema is closed: an unknown key throws at registration"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid source declaration"
                               (spec/register-source! :model/SpecTestFake (assoc valid :sneaky 1)))))
       (testing "missing or empty :fields throws"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid source declaration"
                               (spec/register-source! :model/SpecTestFake (dissoc valid :fields))))
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid source declaration"
                               (spec/register-source! :model/SpecTestFake (assoc valid :fields [])))))
       (testing "bad :entity-type forms throw — a string or {:column kw} is all there is"
         (doseq [bad [:fake {:col :type} ["fake"]]]
           (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid source declaration"
                                 (spec/register-source! :model/SpecTestFake (assoc valid :entity-type bad)))
               (pr-str bad))))
       (testing "a non-var :label throws — the registry holds vars so reloads stay live"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid source declaration"
                               (spec/register-source! :model/SpecTestFake (assoc valid :label identity)))))))))

(deftest define-projection-validation-test
  (do-with-registry-snapshot
   (fn []
     (spec/register-source! :model/SpecTestFake
                            {:model       :model/SpecTestFake
                             :entity-type "fake"
                             :fields      [:id :name]})
     (let [valid {:membership {:where [:= :id 1]}
                  :project    #'spec/library-index-docs}]
       (testing "positive control: a well-formed declaration registers, with :basis drawing on the union of fields and hydrations"
         (is (= [:osi-context :model/SpecTestFake]
                (spec/register-projection! :osi-context :model/SpecTestFake
                                           (assoc valid
                                                  :hydrate {:extra #'spec/ai-context-by-entity}
                                                  :basis   [:name :extra])))))
       (testing "an unknown projection key throws — a typo is not an extension point"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unknown projection key"
                               (spec/register-projection! :library-idnex :model/SpecTestFake valid))))
       (testing "a non-var :project throws"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid :osi-context projection declaration"
                               (spec/register-projection! :osi-context :model/SpecTestFake
                                                          (assoc valid :project (fn [entity] entity))))))
       (testing "the schema is closed: an unknown key throws"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid :osi-context projection declaration"
                               (spec/register-projection! :osi-context :model/SpecTestFake
                                                          (assoc valid :sneaky 1)))))
       (testing "a :basis key outside the source fields and hydrations throws"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #":basis keys outside"
                               (spec/register-projection! :osi-context :model/SpecTestFake
                                                          (assoc valid :basis [:name :no-such-field])))))
       (testing "an empty :basis throws — declare none at all instead"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid :osi-context projection declaration"
                               (spec/register-projection! :osi-context :model/SpecTestFake
                                                          (assoc valid :basis [])))))
       (testing "define-projection before define-source throws"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No source declared"
                               (spec/register-projection! :osi-context :model/SpecTestNoSource valid))))
       (testing "a membership declaring neither :where nor :via-parent throws — it would select every row"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"selects every row"
                               (spec/register-projection! :osi-context :model/SpecTestFake
                                                          (assoc valid :membership {})))))))))

(deftest doc-id-test
  (testing "equal (entity_type, entity_local_id, doc_type, doc_text) tuples hash equal"
    (is (= (spec/doc-id "metric" 9 "name" "Revenue")
           (spec/doc-id "metric" 9 "name" "Revenue"))))
  (testing "each component changes the doc_id (instructions is deliberately not an input)"
    (let [d (spec/doc-id "metric" 9 "name" "Revenue")]
      (doseq [variant [(spec/doc-id "table"  9 "name"    "Revenue")
                       (spec/doc-id "metric" 8 "name"    "Revenue")
                       (spec/doc-id "metric" 9 "synonym" "Revenue")
                       (spec/doc-id "metric" 9 "name"    "Sales")]]
        (is (not= d variant) (pr-str variant))))))

(deftest library-index-docs-test
  (let [entity {:entity_type     "table"
                :entity_local_id 1
                :name            "orders"
                :display_name    "Orders"
                :description     "d"
                :ai-context      {:instructions "Never indexed."
                                  :synonyms     (mapv #(str "synonym-" %) (range 200))
                                  :examples     [(apply str (repeat 9000 \x)) "" "orders last month"]}}
        docs   (spec/library-index-docs entity)]
    (testing "a name doc always, from the source label; a description doc when non-blank"
      (is (= ["Orders"] (map :doc_text (filter #(= "name" (:doc_type %)) docs))))
      (is (= ["d"] (map :doc_text (filter #(= "description" (:doc_type %)) docs))))
      (is (empty? (filter #(= "description" (:doc_type %))
                          (spec/library-index-docs (assoc entity :description "  "))))))
    (testing "instructions are never indexed"
      (is (not-any? #(= "Never indexed." (:doc_text %)) docs)))
    (testing "an unbounded synonym list is capped (bounds bloat from API-bypassing writes)"
      (is (= 50 (count (filter #(= "synonym" (:doc_type %)) docs)))))
    (testing "blank values are dropped; every doc's text is truncated to the char cap"
      (is (= 2 (count (filter #(= "example" (:doc_type %)) docs))))
      (is (every? #(<= (count (:doc_text %)) 8000) docs))
      (is (= 8000 (count (:doc_text (first (filter #(= "example" (:doc_type %)) docs)))))))))

(deftest entity-summary-label-test
  (testing "Table label is (or display_name name); other models use :name"
    (is (= "Orders"
           (:name (spec/entity-summary {:entity_type "table" :entity_local_id 1
                                        :name "orders" :display_name "Orders"}))))
    (is (= "orders"
           (:name (spec/entity-summary {:entity_type "table" :entity_local_id 1
                                        :name "orders" :display_name nil}))))
    (is (= "Revenue"
           (:name (spec/entity-summary {:entity_type "measure" :entity_local_id 2 :name "Revenue"}))))))

(deftest project-asserts-hydration-keys-test
  (testing "projecting an entity that skipped spec/hydrate throws instead of deriving wrong docs"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"missing declared hydration keys"
                          (spec/project :library-index {:entity_type "table" :entity_local_id 1 :name "x"})))
    (is (seq (spec/project :library-index {:entity_type "table" :entity_local_id 1
                                           :name "x" :ai-context nil})))))

(deftest project-wraps-model-throw-test
  (testing "a throwing model :project var re-raises as an ex-info naming the entity, so a batch caller can
            count and skip one malformed entity instead of dying"
    ;; a Card with a nil :type is malformed — card->llm-input's (name (:type card)) throws on it.
    (let [malformed {:entity_type     "metric"
                     :entity_local_id 2
                     :type            nil
                     :name            "M"
                     :description     nil
                     :card-type       "metric"}
          e         (is (thrown-with-msg? clojure.lang.ExceptionInfo #":project threw for metric 2"
                                          (spec/project :osi-context malformed)))]
      (is (=? {:projection      :osi-context
               :entity-type     "metric"
               :entity-local-id 2}
              (ex-data e)))
      (is (some? (ex-cause e)) "the model var's original throw rides along as the cause"))))

(deftest project-realizes-lazy-results-inside-entity-context-test
  (testing "a failure in a lazy projection is raised while project can still attach the entity identity"
    (mt/with-dynamic-fn-redefs [spec/library-index-docs
                                (fn [_entity]
                                  (map (fn [_] (throw (ex-info "lazy boom" {}))) [1]))]
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #":project threw for table 7"
                                    (spec/project :library-index
                                                  {:entity_type "table" :entity_local_id 7
                                                   :name "Orders" :ai-context nil})))]
        (is (= 7 (:entity-local-id (ex-data e))))))))

(deftest ai-context-hydration-is-point-scoped-and-validates-stored-shape-test
  (mt/with-temp [:model/OsiAiContext _ {:entity_type "table" :entity_local_id 1001
                                        :ai_context {:synonyms ["orders"]}}
                 :model/OsiAiContext _ {:entity_type "table" :entity_local_id 1002
                                        :ai_context {:synonyms ["unrelated"]}}
                 :model/OsiAiContext _ {:entity_type "card" :entity_local_id 1003
                                        :ai_context {:synonyms ["revenue"]}}]
    ;; Bypass the model transform to simulate a legacy/corrupt row. A point hydration of 1001 must not read it.
    (t2/query-one {:update :osi_ai_context
                   :set    {:ai_context "{not-json"}
                   :where  [:= :entity_local_id 1002]})
    (is (= {["table" 1001] {:synonyms ["orders"]}}
           (spec/ai-context-by-entity [{:entity_type "table" :entity_local_id 1001}]))
        "an unrelated corrupt row is not read")
    (t2/query-one {:update :osi_ai_context
                   :set    {:ai_context "null"}
                   :where  [:= :entity_local_id 1001]})
    (is (instance? Throwable
                   (get (spec/ai-context-by-entity [{:entity_type "table" :entity_local_id 1001}])
                        ["table" 1001]))
        "syntactically valid JSON with an invalid ai_context shape is isolated as an entity error")
    (is (= {["card" 1003] {:synonyms ["revenue"]}}
           (spec/ai-context-by-entity [{:entity_type "metric" :entity_local_id 1003}]))
        "a live card flavor queries the row under its canonical stored type")))

(deftest recoverable-legacy-ai-context-still-projects-test
  (testing "an over-cap :instructions value and an unknown key are recoverable — only structurally
           unusable :synonyms/:examples mark a row corrupt, so a legacy row cannot stale the entity's
           whole index slice"
    (mt/with-temp [:model/OsiAiContext _ {:entity_type "table" :entity_local_id 1004
                                          :ai_context {:synonyms ["orders"]}}]
      ;; Raw update: the write path enforces the caps, but legacy/serdes rows predate them.
      (t2/query-one {:update :osi_ai_context
                     :set    {:ai_context (json/encode
                                           {:instructions (apply str (repeat (inc entity-retrieval/max-instructions-len) "x"))
                                            :future-key   "ignored"
                                            :synonyms     ["orders" "sales"]
                                            :examples     ["orders last month" nil]})}
                     :where  [:= :entity_local_id 1004]})
      (let [hydrated (get (spec/ai-context-by-entity [{:entity_type "table" :entity_local_id 1004}])
                          ["table" 1004])]
        (is (= ["orders" "sales"] (:synonyms hydrated)))
        (testing "the entity still projects its name/description/synonym docs (nil items blank-filter away)"
          (is (= {"name" 1, "description" 1, "synonym" 2, "example" 1}
                 (frequencies (map :doc_type
                                   (spec/project :library-index
                                                 {:entity_type     "table"
                                                  :entity_local_id 1004
                                                  :name            "orders"
                                                  :display_name    "Orders"
                                                  :description     "All orders"
                                                  :ai-context      hydrated}))))))
        (testing "structurally unusable :synonyms still isolate as an entity-scoped error"
          (t2/query-one {:update :osi_ai_context
                         :set    {:ai_context (json/encode {:synonyms "not-a-list"})}
                         :where  [:= :entity_local_id 1004]})
          (is (instance? Throwable
                         (get (spec/ai-context-by-entity [{:entity_type "table" :entity_local_id 1004}])
                              ["table" 1004]))))))))

(deftest entity-basis-test
  (let [table {:entity_type     "table"
               :entity_local_id 1
               :name            "orders"
               :display_name    "Orders"
               :description     "d"
               :collection_id   99
               :is_published    true
               :active          true
               :field-names     ["id" "total"]}
        basis (spec/entity-basis :osi-context table)]
    (testing "returns exactly the declared :basis keys — nothing outside them leaks into the stamp"
      (is (= {:name         "orders"
              :display_name "Orders"
              :description  "d"
              :field-names  ["id" "total"]}
             basis)))
    (testing "deterministic across calls"
      (is (= basis (spec/entity-basis :osi-context table))))
    (testing "survives a JSON encode/decode round-trip unchanged (what basis-diff's nil case rests on)"
      (is (= basis (json/decode+kw (json/encode basis)))))
    (testing "throws when a declared hydration key is missing — an unhydrated stamp would poison the diff"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"missing declared hydration keys"
                            (spec/entity-basis :osi-context (dissoc table :field-names)))))
    (testing "throws for a projection that declares no :basis"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"declares no :basis"
                            (spec/entity-basis :library-index (assoc table :ai-context nil)))))))

(deftest osi-description-cap-test
  (let [description (apply str (repeat (+ spec/max-osi-description-len 10) "x"))
        table       {:entity_type     "table"
                     :entity_local_id 1
                     :name            "orders"
                     :display_name    "Orders"
                     :description     description
                     :field-names     ["id"]}
        prompt      (spec/project :osi-context table)
        basis       (spec/entity-basis :osi-context table)]
    (testing "the prompt and persisted basis use the same deterministic source-description cap"
      (is (= spec/max-osi-description-len (count (:description prompt))))
      (is (= (:description prompt) (:description basis))))
    (testing "the independent library-index projection is unchanged"
      (is (= description
             (:doc_text (first (filter #(= "description" (:doc_type %))
                                       (spec/project :library-index (assoc table :ai-context nil))))))))))

(deftest entity-basis-canonical-test
  (let [card {:entity_type "metric" :entity_local_id 2 :type :metric
              :name "M" :description nil :card-type "metric"}]
    (testing "the card basis carries the canonical card-type string — a metric<->model relabel is a basis change"
      (is (= {:name "M", :description nil, :card-type "metric"}
             (spec/entity-basis :osi-context card))))
    (testing "a non-JSON-native basis value throws instead of silently poisoning the diff forever"
      (doseq [bad [:metric #{"a"} (java.util.Date.) 1/3]]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not JSON-native"
                              (spec/entity-basis :osi-context (assoc card :card-type bad)))
            (pr-str bad))))
    (testing "nested collections are canonicalized: maps sort, vectors recurse, so the stamp round-trips ="
      (let [basis (spec/entity-basis :osi-context (assoc card :card-type {:b [1 "x"] :a true}))]
        (is (= {:card-type {:a true, :b [1 "x"]}}
               (select-keys basis [:card-type])))
        (is (= basis (json/decode+kw (json/encode basis))))))))

(deftest unknown-projection-key-fails-loud-test
  (testing "member fns throw on an unknown key — [] fed to a destructive reconcile would wipe the store"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unknown projection key"
                          (spec/member-entities :library-idnex)))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unknown projection key"
                          (spec/member-entity :library-idnex "table" 1)))))

(deftest basis-diff-test
  (testing "nil on equal bases (including across a JSON round-trip of the stored side)"
    (let [basis {:name "orders", :description "d", :field-names ["a" "b"]}]
      (is (nil? (spec/basis-diff basis basis)))
      (is (nil? (spec/basis-diff (json/decode+kw (json/encode basis)) basis)))))
  (testing "a changed value names the key with before/after"
    (is (= {:changed #{:name}
            :from    {:name "orders"}
            :to      {:name "sales"}}
           (spec/basis-diff {:name "orders", :description "d"}
                            {:name "sales", :description "d"}))))
  (testing "a key removed from the basis set is ignored (declaration shrink must not regenerate the library)"
    (is (nil? (spec/basis-diff {:name "orders", :legacy-key "x"} {:name "orders"}))))
  (testing "a key new in the fresh basis counts as changed, with no :from entry"
    (is (= {:changed #{:field-names}
            :from    {}
            :to      {:field-names ["a"]}}
           (spec/basis-diff {:name "orders"} {:name "orders", :field-names ["a"]})))))

(deftest project-osi-context-shape-test
  (testing "each model's llm-input is a map carrying its declared key set, hydrations included"
    (let [table-input (spec/project :osi-context {:entity_type "table" :entity_local_id 1
                                                  :name "orders" :display_name "Orders"
                                                  :description "d" :field-names ["id"]})]
      (is (= {:entity-type  "table"
              :name         "orders"
              :display-name "Orders"
              :description  "d"
              :field-names  ["id"]}
             table-input)))
    (is (= {:entity-type "metric", :name "M", :description nil}
           (spec/project :osi-context {:entity_type "metric" :entity_local_id 2 :type :metric :name "M"
                                       :description nil :card-type "metric"})))
    (is (= {:entity-type "measure", :name "Rev", :description "r"}
           (spec/project :osi-context {:entity_type "measure" :entity_local_id 3 :name "Rev"
                                       :description "r"})))
    (is (= {:entity-type "segment", :name "Big", :description nil}
           (spec/project :osi-context {:entity_type "segment" :entity_local_id 4 :name "Big"
                                       :description nil}))))
  (testing "projecting an unhydrated table throws (the :field-names hydration is declared)"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"missing declared hydration keys"
                          (spec/project :osi-context {:entity_type "table" :entity_local_id 1
                                                      :name "orders"})))))

(deftest library-root-collection-included-in-membership-test
  (testing "the Library root id is in the membership scope, so an entity directly in the root is a member"
    ;; Defensive: the appdb normally prevents leaf content directly in the Library root (it lives in the
    ;; Data/Metrics sub-collections), so this can't be exercised end-to-end — but membership covers the
    ;; root id, not just its descendants.
    (mt/with-premium-features #{:library}
      (collections.tu/with-library [{library :library}]
        (is (contains? (set (#'spec/library-collection-ids)) (:id library)))))))

(deftest table-field-names-hydration-test
  (testing "the table :field-names hydration sorts by name and drops inactive/sensitive/retired fields —
           it feeds the prompt and the stored basis, so it has to be deterministic and safe to hand out"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Field    _ {:table_id table-id :name "zeta"      :active true}
                   :model/Field    _ {:table_id table-id :name "alpha"     :active true}
                   :model/Field    _ {:table_id table-id :name "secret"    :active true :visibility_type :sensitive}
                   :model/Field    _ {:table_id table-id :name "old"       :active true :visibility_type :retired}
                   :model/Field    _ {:table_id table-id :name "dropped"   :active false}
                   ;; a nested field, named the way sql-jdbc names one. Covers the nfc_path read
                   ;; transform end to end: a path that came back as raw JSON rather than a vector would
                   ;; silently produce a garbage field path here.
                   :model/Field    _ {:table_id table-id :name "payload → user → id" :active true
                                      :nfc_path ["payload" "user" "id"]}]
      (let [entity {:entity_type "table" :entity_local_id table-id :id table-id}]
        (is (= ["alpha" "payload.user.id" "zeta"]
               (:field-names (first (spec/hydrate :osi-context [entity])))))))))

(deftest via-parent-without-parent-projection-test
  (testing "a via-parent model whose parent declares no projection has no members: member-entity agrees
           with member-entities instead of degenerating to 'a parent row with this id exists'"
    (mt/with-premium-features #{:library}
      (collections.tu/with-library [_]
        (let [venues (mt/id :venues)]
          (mt/with-temp [:model/Segment {segment-id :id} {:table_id   venues
                                                          :name       "spec-test segment"
                                                          :definition {:source-table venues
                                                                       :filter [:> [:field (mt/id :venues :price) nil] 1]}}]
            (testing "baseline: venues is not a library table, so its segment is not a member"
              (is (nil? (spec/member-entity :library-index "segment" segment-id))))
            (do-with-registry-snapshot
             (fn []
               (swap! (var-get #'spec/declarations) update-in [:projections :library-index] dissoc :model/Table)
               (is (nil? (spec/member-entity :library-index "segment" segment-id)))))))))))
