(ns metabase.metabot.tools.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; A tool is a value, so a fixture is a record instance or a `reify` — no macro, no var metadata,
;;; no registry to register with.

(defrecord WidgetTool [tool-name description]
  tools/Tool
  (declaration [this]
    {:name        (:tool-name this)
     :description (:description this)
     :args        [:map {:closed true} [:id :int]]})
  (handle [_ {:keys [id]} _ctx]
    {:output (str "widget " id)}))

(def ^:private widget-tool (->WidgetTool "widget" "Reports a widget."))

(def ^:private scoped-tool
  (reify tools/Tool
    (declaration [_]
      {:name         "scoped"
       :description  "Needs a scope and a capability."
       :args         [:map {:closed true}]
       :scope        "agent:sql:create"
       :capabilities #{:permission-write-sql-queries}})
    (handle [_ _args _ctx] {:output "ok"})))

;;; ------------------------------------------------ Tool ----------------------------------------------------------

(deftest ^:parallel a-tool-is-a-value-test
  (testing "nothing is registered and nothing is looked up — you call it"
    (is (= {:output "widget 4"} (tools/handle widget-tool {:id 4} {}))))
  (testing "and a test double needs no machinery"
    (is (= {:output "stub"}
           (tools/handle (reify tools/Tool
                           (declaration [_] {:name "x" :description "d" :args :any})
                           (handle [_ _ _] {:output "stub"}))
                         {} {})))))

(deftest ^:parallel declaration-is-the-whole-contract-test
  (is (= {:name "widget" :description "Reports a widget."
          :args [:map {:closed true} [:id :int]]}
         (tools/declaration widget-tool)))
  (is (=? {:scope "agent:sql:create" :capabilities #{:permission-write-sql-queries}}
          (tools/declaration scoped-tool))))

(deftest ^:parallel configuration-lives-in-the-fields-test
  (testing "the reason for a record: two tools can be the same type under different configuration"
    (let [other (->WidgetTool "gadget" "Reports a gadget.")]
      (is (= "gadget" (:name (tools/declaration other))))
      (is (= {:output "gadget 1"} (update (tools/handle other {:id 1} {}) :output
                                          str/replace "widget" "gadget"))))))

;;; ------------------------------------------- Declaration checks -------------------------------------------------

(defn- declaring
  "A tool whose declaration is `declared` and which never runs."
  [declared]
  (reify tools/Tool
    (declaration [_] declared)
    (handle [_ _ _] {:output ""})))

(deftest ^:parallel validate-tool!-rejects-a-bad-declaration-test
  (testing "unknown keys fail at load time rather than silently dropping a gate"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"Invalid tool declaration"
         (tools/validate-tool! (declaring {:name "x" :description "d" :args :any
                                           :capability #{:typo}})))))
  (testing "a missing :name, :description or :args fails"
    (doseq [declared [{:description "d" :args :any}
                      {:name "x" :args :any}
                      {:name "x" :description "d"}]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid tool declaration"
                            (tools/validate-tool! (declaring declared))))))
  (testing "a name a provider might reject fails here, where it is cheap to find"
    (doseq [bad ["Widget" "read-resource" "2fast" "read resource"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not snake_case"
                            (tools/validate-tool! (declaring {:name bad :description "d"
                                                              :args :any}))))))
  (testing "an :args schema that does not resolve fails at load time, not on the first call"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #":args schema that does not compile"
                          (tools/validate-tool! (declaring {:name "x" :description "d"
                                                            :args ::nothing-registers-this}))))))

(deftest ^:parallel entries-test
  (is (= {"widget" {:declaration (tools/declaration widget-tool) :tool widget-tool}}
         (tools/entries [widget-tool])))
  (testing "two tools claiming one name is refused: one of them would be unreachable"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Two tools claim the tool name"
                          (tools/entries [widget-tool (->WidgetTool "widget" "Another.")]))))
  (testing "across profiles a name legitimately belongs to several tools, so there is no registry"
    (is (= 1 (count (tools/entries [widget-tool]))))
    (is (= 1 (count (tools/entries [(->WidgetTool "widget" "Another.")]))))))

;;; -------------------------------------------- BatchedTool -------------------------------------------------------

(tools.error/defrecoverable odd-id! "Odd ids are not loadable."
  {:payload [:map {:closed true} [:id :int]]}
  [{:keys [id]}]
  {:message  (str "Item " id " could not be loaded.")
   :recovery [{:uses #{"search"} :text "Call `search` for a loadable id."}]})

(defn- batched!
  "A `BatchedTool` over `item-ids`, loading even ids and failing odd ones. `compose` is `nil` to take
  the ordinary composition."
  [item-ids & {:keys [compose-fn]}]
  (reify
    tools/Tool
    (declaration [_] {:name "batched" :description "d" :args [:map {:closed true}]})
    (handle [this args ctx] (tools/handle-each this args ctx))
    tools/BatchedTool
    (items [_ _args _ctx] item-ids)
    (load-item [_ id _ctx]
      (if (even? id) {:output (str "item " id)} (odd-id! {:id id})))
    (compose [_ entries _ctx]
      (if compose-fn (compose-fn entries) (tools/concatenated entries)))))

(def ^:private ctx {:profile-id :nlq :metabot-id nil :tool-names #{"search"}})

(deftest ^:parallel handle-each-composes-one-result-test
  (testing "a batched tool returns the same shape a plain one does"
    (let [result (tools/handle (batched! [2 4]) {} ctx)]
      (is (= {:output "item 2\nitem 4"} result))
      (is (mr/validate ::tools/result result)))))

(deftest ^:parallel a-failed-item-is-rendered-in-position-test
  (is (= ["item 2"
          "Item 3 could not be loaded."
          "Call `search` for a loadable id."
          "item 4"]
         (str/split-lines (:output (tools/handle (batched! [2 3 4]) {} ctx)))))
  (testing "with the step filtering a whole failed call would get"
    (is (= ["item 2" "Item 3 could not be loaded."]
           (str/split-lines
            (:output (tools/handle (batched! [2 3]) {} (assoc ctx :tool-names #{}))))))))

(deftest ^:parallel only-declared-recoverables-are-captured-test
  (testing "an undeclared exception ends the turn and discards the items that loaded"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"a real bug"
         (tools/handle (reify
                         tools/Tool
                         (declaration [_] {:name "b" :description "d" :args :any})
                         (handle [this args ctx] (tools/handle-each this args ctx))
                         tools/BatchedTool
                         (items [_ _ _] [1 2])
                         (load-item [_ i _] (if (= 2 i)
                                              (throw (ex-info "a real bug" {}))
                                              {:output "fine"}))
                         (compose [_ es _] (tools/concatenated es)))
                       {} ctx))))
  (testing "and so does an explicit give-up"
    (is (thrown? clojure.lang.ExceptionInfo
                 (tools/handle (reify
                                 tools/Tool
                                 (declaration [_] {:name "b" :description "d" :args :any})
                                 (handle [this args ctx] (tools/handle-each this args ctx))
                                 tools/BatchedTool
                                 (items [_ _ _] [1])
                                 (load-item [_ _ _] (tools.error/unrecoverable! ::nope))
                                 (compose [_ es _] (tools/concatenated es)))
                               {} ctx)))))

(deftest ^:parallel a-malformed-item-result-is-caught-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo #"invalid result"
       (tools/handle (reify
                       tools/Tool
                       (declaration [_] {:name "b" :description "d" :args :any})
                       (handle [this args ctx] (tools/handle-each this args ctx))
                       tools/BatchedTool
                       (items [_ _ _] [1])
                       (load-item [_ _ _] {:outputs "typo"})
                       (compose [_ es _] (tools/concatenated es)))
                     {} ctx))))

(deftest ^:parallel concatenated-test
  (testing "outputs joined in order, structured outputs vectored, data parts concatenated"
    (is (= {:output            "a\nb"
            :structured-output [{:n 1} {:n 2}]
            :data-parts        [{:type :data :data-type "x"} {:type :data :data-type "y"}]}
           (tools/concatenated
            [{:item :a :failed? false :output "a" :structured-output {:n 1}
              :data-parts [{:type :data :data-type "x"}]}
             {:item :b :failed? false :output "b" :structured-output {:n 2}
              :data-parts [{:type :data :data-type "y"}]}]))))
  (testing "keys no entry produced are absent rather than empty"
    (is (= {:output "a"} (tools/concatenated [{:item :a :failed? false :output "a"}])))))

(deftest ^:parallel compose-owns-placement-test
  (testing "an entry is uniform — :output always a string, :failed? always a boolean — so
           concatenating asks nothing and separating asks a boolean"
    (is (= {:output "ok: item 2 | failed: 3"}
           (tools/handle (batched! [2 3]
                                   :compose-fn
                                   (fn [entries]
                                     (let [{ok false failed true} (group-by :failed? entries)]
                                       {:output (str "ok: " (str/join ", " (map :output ok))
                                                     " | failed: "
                                                     (str/join ", " (map :item failed)))})))
                         {} ctx)))))

;;; ------------------------------------------------ with-entity ---------------------------------------------------

(deftest ^:parallel with-entity-converts-read-refusals-test
  (doseq [status [403 404]]
    (testing (str "a " status " becomes the declared not-found error, naming the entity")
      (is (=? {:class   :recoverable
               :code    :metabase.metabot.tools.recoverable.common/not-found
               :message "Timeline 5 was not found. It may not exist, or you may not have access to it."
               :data    {:kind :timeline :id 5}}
              (tools.error/classify
               (is (thrown? clojure.lang.ExceptionInfo
                            (tools/with-entity {:kind :timeline :id 5}
                              (throw (ex-info "nope" {:status-code status})))))))))))

(deftest ^:parallel with-entity-passes-everything-else-through-test
  (testing "a real failure inside the body stays unrecoverable instead of being reported as a miss"
    (doseq [data [{:status-code 500} {} {:status-code 400}]]
      (let [e (is (thrown? clojure.lang.ExceptionInfo
                           (tools/with-entity {:kind :timeline :id 5}
                             (throw (ex-info "a real bug" data)))))]
        (is (= "a real bug" (ex-message e)))
        (is (= :unrecoverable (:class (tools.error/classify e)))))))
  (testing "and a successful body is returned untouched"
    (is (= :fine (tools/with-entity {:kind :timeline :id 5} :fine)))))

;;; -------------------------------------------- with-pipeline-errors ----------------------------------------------

(defn- pipeline-failure
  "Raise `data` from inside `with-pipeline-errors` and return the resulting ToolError."
  [message data]
  (try
    (tools/with-pipeline-errors (throw (ex-info message data)))
    (catch Throwable e
      (assoc (tools.error/classify e) ::ex-message (ex-message e)))))

(deftest ^:parallel with-pipeline-errors-converts-declared-codes-test
  (testing "an :agent-error? with a declared :error code becomes that error, keeping the pipeline's
           own sentence as the message"
    (is (=? {:class    :recoverable
             :code     :metabase.metabot.tools.recoverable.pipeline/unknown-table
             :message  "No table found matching portable FK [\"db\" nil \"t\"]."
             :recovery [{:uses #{"read_resource"}}]}
            (pipeline-failure "No table found matching portable FK [\"db\" nil \"t\"]."
                              {:agent-error? true :status-code 400 :error :unknown-table}))))
  (testing "the payload carries the keys a declaration's recovery branches on"
    (let [error (pipeline-failure "A URI is not a source."
                                  {:agent-error? true :error :uri-in-source-table
                                   :entity-type  "metric" :entity-id 7})]
      (is (=? {:code :metabase.metabot.tools.recoverable.pipeline/uri-in-source-table
               :data {:entity-type "metric" :entity-id 7}}
              error))
      (is (str/starts-with? (:text (first (:recovery error)))
                            "Metrics are aggregations, not sources.")))))

(deftest ^:parallel with-pipeline-errors-converts-refusals-test
  (doseq [status [403 404]]
    (testing (str "a " status " from inside the pipeline becomes not-found, without inventing a kind")
      (is (=? {:class   :recoverable
               :code    :metabase.metabot.tools.recoverable.common/not-found
               :message (str "The entity referenced here was not found. It may not exist, or you "
                             "may not have access to it.")
               :data    {}}
              (pipeline-failure "no" {:status-code status}))))))

(deftest ^:parallel with-pipeline-errors-does-not-relay-foreign-messages-test
  (testing "`as-agent-input-error` stamps :agent-error? onto exceptions from lib, toucan2 and JDBC
           too. Without an :error code there is nothing to say the message was written for a model,
           so it stays unrecoverable and the model never sees it."
    (is (=? {:class       :unrecoverable
             :code        :internal
             ::ex-message "No matching clause: :whatever"}
            (pipeline-failure "No matching clause: :whatever"
                              {:agent-error? true :status-code 400}))))
  (testing "an :error code with no declaration is not converted either — the pipeline-code test is
           what stops that case reaching production"
    (is (=? {:class :unrecoverable :code :internal}
            (pipeline-failure "a brand new pipeline failure"
                              {:agent-error? true :error :no-declaration-for-this}))))
  (testing "and an ordinary exception passes straight through"
    (is (=? {:class :unrecoverable :code :internal} (pipeline-failure "boom" {}))))
  (testing "a successful body is returned untouched"
    (is (= :fine (tools/with-pipeline-errors :fine)))))
