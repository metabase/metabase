(ns metabase.agent-api.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.test-util :refer [captured-events!]]
   [metabase.agent-api.tools :as tools]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Teaching errors
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel teaching-error!-test
  (testing "throws an ex-info carrying :status-code, default 400"
    (let [ex (try (tools/teaching-error! "fix it this way") (catch ExceptionInfo e e))]
      (is (= "fix it this way" (ex-message ex)))
      (is (= 400 (:status-code (ex-data ex))))))
  (testing "explicit status and extra data"
    (let [ex (try (tools/teaching-error! "nope" 403 {:field :name}) (catch ExceptionInfo e e))]
      (is (= 403 (:status-code (ex-data ex))))
      (is (= :name (:field (ex-data ex)))))))

(deftest ^:parallel check-exactly-one!-test
  (testing "exactly one present returns params unchanged"
    (is (= {:query {:a 1}}
           (tools/check-exactly-one! {:query {:a 1}} [:query :query_handle]))))
  (testing "none present names the fix"
    (is (thrown-with-msg?
         ExceptionInfo #"Provide exactly one of `query`, `query_handle`"
         (tools/check-exactly-one! {} [:query :query_handle]))))
  (testing "several present names the fix (both query and query_handle)"
    (is (thrown-with-msg?
         ExceptionInfo #"Provide only one of `query`, `query_handle`"
         (tools/check-exactly-one! {:query {} :query_handle "abc"} [:query :query_handle]))))
  (testing "nil-valued keys count as absent"
    (is (thrown-with-msg?
         ExceptionInfo #"Provide exactly one"
         (tools/check-exactly-one! {:query nil :query_handle nil} [:query :query_handle])))))

;;; ──────────────────────────────────────────────────────────────────
;;; Ref ergonomics
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel classify-ref-test
  (is (= {:kind :id :id 42} (tools/classify-ref 42)))
  (is (= {:kind :entity-id :entity-id "FReCLx5hSWTBU7kjCWfuu"}
         (tools/classify-ref "FReCLx5hSWTBU7kjCWfuu")))
  (is (= {:kind :root} (tools/classify-ref "root")))
  (is (= {:kind :trash} (tools/classify-ref "trash")))
  (is (= {:kind :null} (tools/classify-ref nil)))
  (testing "a non-id string is a teaching error, not a silent pass"
    (is (thrown-with-msg?
         ExceptionInfo #"expected a numeric id or a 21-character entity_id"
         (tools/classify-ref "not-an-id")))))

(deftest ^:parallel resolve-id-test
  (testing "a numeric id passes through and an absent id stays absent"
    (is (= 42 (tools/resolve-id :model/Card 42)))
    (is (nil? (tools/resolve-id :model/Card nil))))
  (testing "an entity_id is translated against the model"
    (mt/with-temp [:model/Card card {}]
      (is (= (:id card) (tools/resolve-id :model/Card (:entity_id card))))))
  (testing "an entity_id that names nothing is a 404, not a nil"
    (let [ex (try (tools/resolve-id :model/Card "0000000000000000000AA")
                  (catch ExceptionInfo e e))]
      (is (= 404 (:status-code (ex-data ex))))))
  (testing "a token that is neither is a teaching error"
    (is (thrown-with-msg?
         ExceptionInfo #"numeric id or a 21-character entity_id"
         (tools/resolve-id :model/Card "root")))))

;;; ──────────────────────────────────────────────────────────────────
;;; response_format projections
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel project-test
  (let [record {:id 1 :name "Orders" :description "the orders table" :row_count 500 :engine "h2"}
        spec   {:concise [:id :name :description]}]
    (testing "nil / concise selects the concise subset with REST property names verbatim"
      (is (= {:id 1 :name "Orders" :description "the orders table"} (tools/project nil spec record)))
      (is (= {:id 1 :name "Orders" :description "the orders table"} (tools/project "concise" spec record))))
    (testing "detailed with no :detailed spec returns the whole record"
      (is (= record (tools/project "detailed" spec record))))
    (testing "detailed honors an explicit :detailed key set"
      (is (= {:id 1 :name "Orders" :row_count 500}
             (tools/project "detailed" (assoc spec :detailed [:id :name :row_count]) record))))
    (testing "project-all maps the projection over a sequence"
      (is (= [{:id 1 :name "Orders" :description "the orders table"}]
             (tools/project-all "concise" spec [record]))))))

;;; ──────────────────────────────────────────────────────────────────
;;; `fields` dot-path picks
;;; ──────────────────────────────────────────────────────────────────

(def ^:private card-spec
  {:concise [:id :name :description :collection_id]})

(defn- declared []
  (tools/spec-paths card-spec))

(deftest ^:parallel pick-fields-test
  (let [records [{:id 1 :name "Orders" :collection_id 3 :updated_at "2026-01-01"
                  :last-edit-info {:id 7 :email "a@b.c"}}]]
    (testing "picks exactly the named paths, and nothing else"
      (is (= [{:id 1 :name "Orders"}]
             (tools/pick-fields ["id" "name"] records (declared)))))
    (testing "a dot-path reaches into a nested map and keeps the nesting"
      (is (= [{:last-edit-info {:email "a@b.c"}}]
             (tools/pick-fields ["last-edit-info.email"] records (declared)))))
    (testing "a path only the record carries — detail is the whole REST record — is pickable"
      (is (= [{:updated_at "2026-01-01"}]
             (tools/pick-fields ["updated_at"] records (declared)))))))

(deftest ^:parallel pick-fields-validates-against-the-declaration-test
  (testing "an unknown path on an EMPTY result set is refused, not silently answered with []"
    (is (thrown-with-msg?
         ExceptionInfo #"Unknown field \"naem\""
         (tools/pick-fields ["naem"] [] (declared)))))
  (testing "a declared path on an empty result set returns the empty page"
    (is (= [] (tools/pick-fields ["name"] [] (declared)))))
  (testing "the refusal names the paths that exist and suggests the near miss"
    (let [message (try (tools/pick-fields ["colection_id"] [] (declared))
                       (catch ExceptionInfo e (ex-message e)))]
      (is (re-find #"Did you mean \"collection_id\"\?" message))
      (is (re-find #"id, name" message))))
  (testing "a path far from every valid one gets no misleading suggestion"
    (let [message (try (tools/pick-fields ["zzzzzzzzzzzz"] [] (declared))
                       (catch ExceptionInfo e (ex-message e)))]
      (is (not (re-find #"Did you mean" message))))))

(deftest ^:parallel pick-fields-across-a-heterogeneous-batch-test
  (testing "a path one record carries and another does not is absent from the one that lacks it,
            and valid for the batch — the caller wrote one `fields` list against the whole batch"
    (is (= [{:id 1 :collection_id 3} {:id 2}]
           (tools/pick-fields ["id" "collection_id"]
                              [{:id 1 :collection_id 3} {:id 2 :table_id 9}]
                              (declared))))))

(deftest ^:parallel project-rows-test
  (let [records [{:id 1 :name "Orders" :description "d" :collection_id 3 :updated_at "x"}]]
    (testing "without `fields`, the concise/detailed projection applies"
      (is (= [{:id 1 :name "Orders" :description "d" :collection_id 3}]
             (tools/project-rows {:response-format "concise" :spec card-spec} records)))
      (is (= records (tools/project-rows {:response-format "detailed" :spec card-spec} records))))
    (testing "`fields` overrides `response_format`"
      (is (= [{:id 1}]
             (tools/project-rows {:response-format "detailed" :fields ["id"] :spec card-spec}
                                 records))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Response budget
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel estimate-tokens-test
  (testing "the estimate is the JSON encoding at ~4 characters per token"
    (is (zero? (tools/estimate-tokens {})))
    (is (pos? (tools/estimate-tokens {:name (apply str (repeat 400 "x"))})))
    (testing "and it grows with the payload"
      (is (< (tools/estimate-tokens {:a "x"})
             (tools/estimate-tokens {:a (apply str (repeat 4000 "x"))}))))))

(deftest ^:parallel budget-units-test
  (let [size (fn [n] n)]
    (testing "emits complete units until the budget runs out, then names the remainder — never a half unit"
      (is (= {:included [30 30 30] :omitted [30] :truncated? true}
             (tools/budget-units [30 30 30 30] {:token-budget 90 :size-fn size}))))
    (testing "everything fits → nothing omitted, not truncated"
      (is (= {:included [10 10] :omitted [] :truncated? false}
             (tools/budget-units [10 10] {:token-budget 1000 :size-fn size}))))
    (testing "a single over-budget unit is still included (caller decides whether to slice it)"
      (is (= {:included [500] :omitted [10] :truncated? true}
             (tools/budget-units [500 10] {:token-budget 100 :size-fn size}))))
    (testing "no units at all is not a truncation"
      (is (= {:included [] :omitted [] :truncated? false}
             (tools/budget-units [] {:token-budget 100 :size-fn size}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Bounded envelope + steering truncation
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel clamp-limit-test
  (is (= 20 (tools/clamp-limit nil 20 50)) "no limit named → the default")
  (is (= 10 (tools/clamp-limit 10 20 50)))
  (is (= 50 (tools/clamp-limit 500 20 50)) "never above the maximum"))

(deftest ^:parallel list-envelope-test
  (testing "the bare envelope carries data + returned, omits total/truncated when absent"
    (is (= {:data [{:id 1}] :returned 1} (tools/list-envelope [{:id 1}]))))
  (testing "total surfaces when known"
    (is (= {:data [{:id 1}] :returned 1 :total 9} (tools/list-envelope [{:id 1}] {:total 9}))))
  (testing "the one envelope constructor carries `omitted`, so no read has to hand-spell the map"
    (is (= {:data     []
            :returned 0
            :total    2
            :omitted  [{:id 7 :reason "not found, or you do not have access to it"}]}
           (tools/list-envelope
            []
            {:total 2 :omitted [{:id 7 :reason "not found, or you do not have access to it"}]}))))
  (testing "a truncation message flips :truncated and names the narrowing param"
    (let [msg (tools/truncation-message {:total 143 :returned 50 :noun "tables"
                                         :scope "in schema `public`"
                                         :narrow-with [:schema] :next-offset 50})
          env (tools/list-envelope (repeat 50 {:id 1}) {:total 143 :truncation-message msg})]
      (is (true? (:truncated env)))
      (is (= 143 (:total env)))
      (is (re-find #"`schema`" (:truncation_message env)))
      (is (re-find #"`offset: 50`" (:truncation_message env)))
      (is (re-find #"143 tables in schema `public`" (:truncation_message env))))))

(deftest ^:parallel paged-envelope-test
  (let [rows (mapv (fn [i] {:id i :name (str "row " i) :extra "x"}) (range 5))
        spec {:concise [:id :name]}]
    (testing "projects the page and reports the total"
      (is (= {:data [{:id 0 :name "row 0"} {:id 1 :name "row 1"}]
              :returned 2
              :total 5
              :truncated true
              :truncation_message "5 items — showing 2. page with `offset: 2`."}
             (tools/paged-envelope (tools/page-of rows 2 0)
                                   {:limit 2 :offset 0 :total 5 :spec spec :noun "items"}))))
    (testing "the last page is not truncated"
      (is (nil? (:truncated (tools/paged-envelope (tools/page-of rows 2 4)
                                                  {:limit 2 :offset 4 :total 5 :spec spec :noun "items"})))))
    (testing "without a total, a full page is the only evidence there may be more"
      (is (true? (:truncated (tools/paged-envelope (tools/page-of rows 2 0)
                                                   {:limit 2 :offset 0 :spec spec :noun "items"}))))
      (is (nil? (:truncated (tools/paged-envelope (tools/page-of rows 9 0)
                                                  {:limit 9 :offset 0 :spec spec :noun "items"})))))))

(deftest ^:parallel paged-envelope-enforces-the-token-budget-test
  (testing "a page within the row cap is still cut back to the response budget, and says how to continue"
    (let [fat  (apply str (repeat (* 4 tools/token-budget) "x"))
          rows (mapv (fn [i] {:id i :body fat}) (range 10))
          env  (tools/paged-envelope (tools/page-of rows 10 0)
                                     {:limit 10 :offset 0 :total 10
                                      :spec {:concise [:id :body]} :noun "items"})]
      (is (= 1 (:returned env)) "at least one row surfaces, and no more than the budget allows")
      (is (true? (:truncated env)))
      (is (re-find #"`offset: 1`" (:truncation_message env))
          "the next offset counts what was actually returned, not the page size that was asked for"))))

;;; ──────────────────────────────────────────────────────────────────
;;; Read events
;;; ──────────────────────────────────────────────────────────────────

(defn- read-event-signature
  "Topic, reader, and entity of a read event — the part that has to match across the two surfaces.
   The payloads themselves carry either the id or the whole instance, and the instance the REST
   handler loads is hydrated where ours is not."
  [pairs topic]
  (for [[t {:keys [object object-id user-id]}] pairs
        :when (= t topic)]
    [t user-id (or object-id (:id object))]))

(deftest publish-read-event-matches-the-browser-get-test
  (testing "a read tool publishes the read event the entity's REST read publishes, for the same user"
    (mt/with-temp [:model/Dashboard  dash {}
                   :model/Collection coll {}]
      (testing "dashboard — the payload carries the id"
        (let [rest-events (read-event-signature
                           (captured-events! #(mt/user-http-request :rasta :get 200 (str "dashboard/" (:id dash))))
                           :event/dashboard-read)
              tool-events (read-event-signature
                           (captured-events! #(mt/with-test-user :rasta
                                                (tools/publish-read-event! :model/Dashboard dash)))
                           :event/dashboard-read)]
          ;; Without this the comparison below is satisfied by two empty lists, and a spy that captures
          ;; nothing at all passes as a read tool that publishes exactly what the REST endpoint publishes.
          (is (seq tool-events) "the spy has to actually see the event")
          (is (= rest-events tool-events))))
      (testing "collection — the payload carries the instance, because the handler reads more than the id"
        (is (= (read-event-signature
                (captured-events! #(mt/user-http-request :rasta :get 200 (str "collection/" (:id coll) "/items")))
                :event/collection-read)
               (read-event-signature
                (captured-events! #(mt/with-test-user :rasta
                                     (tools/publish-read-event! :model/Collection coll)))
                :event/collection-read)))))))

(deftest publish-read-event-returns-the-object-test
  (mt/with-temp [:model/Dashboard dash {}]
    (is (= dash (mt/with-test-user :rasta (tools/publish-read-event! :model/Dashboard dash))))))

(deftest publish-read-event-card-is-silent-test
  (testing "a card metadata read publishes nothing, exactly as its REST read does — :event/card-read
            comes from the query processor when the card is run"
    (mt/with-temp [:model/Card card {}]
      (is (empty? (captured-events! #(mt/with-test-user :rasta
                                       (tools/publish-read-event! :model/Card card))))))))
