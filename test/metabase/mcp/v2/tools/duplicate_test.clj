(ns metabase.mcp.v2.tools.duplicate-test
  "Contract tests for the `duplicate_content` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, Malli validation, and teaching-error conversion are exercised for free."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.test-util :as documents.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tool the assertions below drive.
   [metabase.mcp.v2.tools.duplicate :as tools.duplicate]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment tools.duplicate/keep-me)

(defn- venues-query
  "A Lib query over VENUES — a runnable `:dataset_query` for fixtures that only need the card to
   have one."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- call-tool!
  ([user args] (call-tool! user nil args))
  ([user scopes args]
   (mt/with-current-user (mt/user->id user)
     (registry/call-tool scopes nil "duplicate_content" args))))

(defn- tool-result
  [{:keys [result error]}]
  (when error
    (throw (ex-info (str "tool call rejected: " (:message error)) {:error error})))
  (when (:isError result)
    (throw (ex-info (str "tool call failed: " (-> result :content first :text))
                    {:result result})))
  (-> result :content first :text json/decode+kw))

(defn- tool-error
  [{:keys [result error]}]
  (cond
    error             (:message error)
    (:isError result) (-> result :content first :text)
    :else             (throw (ex-info "expected a tool error, got success" {:result result}))))

;;; ------------------------------------------------- question -----------------------------------------------------

(deftest duplicate-question-test
  (testing "GHY-4218: an omitted collection_id copies into the caller's personal collection, not
            the source's own collection; the \"Copy of\" name, query, and display stay intact"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Revenue by region"
                                                :type          :question
                                                :display       :bar
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}]
        (let [personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))
              result      (tool-result (call-tool! :crowberto {:type "question" :id card-id}))
              copy        (t2/select-one :model/Card :id (:id result))]
          (is (=? {:type "question" :name "Copy of Revenue by region" :collection_id personal-id}
                  result))
          (is (not= card-id (:id result)))
          (is (= "Copy of Revenue by region" (:name copy)))
          (is (= personal-id (:collection_id copy)))
          (is (= :bar (:display copy)))
          (is (= :question (:type copy)))
          (is (= (:dataset_query (t2/select-one :model/Card :id card-id))
                 (:dataset_query copy))))))))

(deftest duplicate-question-new-name-and-collection-test
  (testing "GHY-4151: new_name and collection_id override the defaults"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {source-coll :id} {}
                     :model/Collection {dest-coll :id} {}
                     :model/Card {card-id :id} {:name          "Revenue by region"
                                                :type          :question
                                                :collection_id source-coll
                                                :dataset_query (venues-query)}]
        (let [result (tool-result (call-tool! :crowberto {:type          "question"
                                                          :id            card-id
                                                          :new_name      "Revenue by region (EMEA)"
                                                          :collection_id dest-coll}))]
          (is (=? {:name "Revenue by region (EMEA)" :collection_id dest-coll} result))
          (is (=? {:name "Revenue by region (EMEA)" :collection_id dest-coll}
                  (t2/select-one :model/Card :id (:id result)))))))))

(deftest duplicate-question-to-root-test
  (testing "GHY-4151: collection_id \"root\" copies into the root collection"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}]
        (let [result (tool-result (call-tool! :crowberto {:type "question" :id card-id :collection_id "root"}))]
          (is (nil? (:collection_id result)))
          (is (nil? (:collection_id (t2/select-one :model/Card :id (:id result))))))))))

(deftest duplicate-dashboard-question-test
  (testing "GHY-4151: a question saved inside a dashboard becomes a normal collection question when
            copied — a card cannot live in both a dashboard and a collection"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:name          "Inline question"
                                                :type          :question
                                                :collection_id coll-id
                                                :dashboard_id  dash-id
                                                :dataset_query (venues-query)}]
        (let [result (tool-result (call-tool! :crowberto {:type "question" :id card-id :collection_id coll-id}))
              copy   (t2/select-one :model/Card :id (:id result))]
          (is (nil? (:dashboard_id copy)))
          (is (= coll-id (:collection_id copy))))))))

(deftest duplicate-document-scoped-question-test
  (testing "GHY-4218: a question saved inside a document is refused, and no copy is written.
            `document_id` is not placement — `mi/can-read? :model/Card` conjoins
            `parent-document-permits?`, which short-circuits to true on a nil `document_id`, so a
            copy that dropped the column would be readable by anyone with collection perms on the
            destination, permanently, and would disclose material the Document's content gate
            exists to withhold"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document {doc-id :id} {:name          "Exploration summary"
                                                   :collection_id coll-id
                                                   :document      (documents.tu/text->prose-mirror-ast "Secret.")}
                     :model/Card {card-id :id} {:name          "Lens-derived question"
                                                :type          :question
                                                :collection_id coll-id
                                                :document_id   doc-id
                                                :dataset_query (venues-query)}]
        (is (= (format (str "Card %d is saved inside a document — duplicate the document instead, "
                            "which copies the questions saved in it.")
                       card-id)
               (tool-error (call-tool! :crowberto {:type "question" :id card-id :collection_id coll-id}))))
        (testing "and no ungated copy exists — asserted through the read gate itself, as a user who
                  cannot read the parent document, rather than by inspecting the returned map"
          (is (= 1 (t2/count :model/Card :collection_id coll-id)))
          (mt/with-non-admin-groups-no-collection-perms coll-id
            (mt/with-current-user (mt/user->id :rasta)
              (is (not-any? mi/can-read? (t2/select :model/Card :collection_id coll-id))))))))))

(deftest duplicate-native-question-without-authoring-perms-test
  (testing "GHY-4218: copying is not authoring. A caller who can read and run a native card but
            lacks native query-building perms can duplicate it, matching `POST /api/card/:id/copy`
            and `documents.models.document/clone-card!` (UXW-5037). The old
            `check-allowed-to-create-card!` ran run-permissions on the source's own query and
            refused with \"you do not have permissions to run its query\" — a query the caller can
            plainly run through the source card"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Native revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (mt/native-query {:query "SELECT 1"})}]
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
          (let [result (tool-result (call-tool! :rasta {:type          "question"
                                                        :id            card-id
                                                        :collection_id coll-id}))]
            (is (= "Copy of Native revenue"
                   (t2/select-one-fn :name :model/Card :id (:id result))))))))))

(deftest duplicate-into-uncuratable-collection-still-refused-test
  (testing "GHY-4218: dropping the authoring check must not drop the destination create-check —
            copying into a collection the caller cannot curate is still refused"
    (mt/with-temp [:model/Collection {source-coll :id} {}
                   :model/Collection {dest-coll :id} {}
                   :model/Card {card-id :id} {:name          "Revenue"
                                              :type          :question
                                              :collection_id source-coll
                                              :dataset_query (venues-query)}]
      (mt/with-non-admin-groups-no-collection-perms dest-coll
        ;; Read but not curate: without the read grant, `resolve-collection-id` collapses an
        ;; unreadable destination to not-found before `api/create-check` ever runs, so the
        ;; assertion would pass on the wrong refusal and stop covering the create-check.
        (perms/grant-collection-read-permissions! (perms/all-users-group) dest-coll)
        (is (re-find #"(?i)permission"
                     (tool-error (call-tool! :rasta {:type          "question"
                                                     :id            card-id
                                                     :collection_id dest-coll}))))
        (is (= 1 (t2/count :model/Card :name "Revenue")))))))

(deftest duplicate-card-flavor-mismatch-test
  (testing "GHY-4151: a model or metric passed as a question is a teaching error saying so, rather than
            silently copying it as a question — the other card flavors aren't supported yet"
    (mt/with-temp [:model/Card {card-id :id} {:type :model :dataset_query (venues-query)}]
      (is (= (format "Card %d is a model — duplicate_content supports type \"question\" only." card-id)
             (tool-error (call-tool! :crowberto {:type "question" :id card-id})))))))

(deftest duplicate-archived-source-test
  (testing "GHY-4151: a trashed source is refused for every type. Archived content keeps its real
            collection_id (the trash is presentational) and neither copy path carries `:archived`
            over, so duplicating would resurrect a live copy in the collection it was trashed from"
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Document]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Trashed question"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}
                     :model/Dashboard {dash-id :id} {:name "Trashed dashboard" :collection_id coll-id}
                     :model/Document {doc-id :id} {:name          "Trashed document"
                                                   :collection_id coll-id
                                                   :document      (documents.tu/text->prose-mirror-ast "Gone.")}]
        (doseq [[model id type] [[:model/Card card-id "question"]
                                 [:model/Dashboard dash-id "dashboard"]
                                 [:model/Document doc-id "document"]]]
          (t2/update! model id {:archived true :archived_directly true})
          (testing type
            (is (= (format "%s %d is in the trash — restore it before duplicating." (name model) id)
                   (tool-error (call-tool! :crowberto {:type type :id id}))))))
        ;; The calls above omit `collection_id`, so a copy that slipped past the guard would land in
        ;; the caller's personal collection -- counting the *source* collection would pass either
        ;; way. Count the destination, and the totals, so a resurrected copy has nowhere to hide.
        (testing "and nothing was written"
          (let [personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))]
            (doseq [model [:model/Card :model/Dashboard :model/Document]]
              (testing model
                (is (zero? (t2/count model :collection_id personal-id)))
                (is (= 1 (t2/count model :collection_id coll-id)))))))))))

;;; ------------------------------------------------- dashboard ----------------------------------------------------

(defn- copied-dashcards
  [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(deftest duplicate-dashboard-shallow-test
  (testing "GHY-4151: the default shallow copy re-uses the source's cards rather than duplicating them"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))
              result      (tool-result (call-tool! :crowberto {:type "dashboard" :id dash-id}))]
          (is (=? {:type "dashboard" :name "Copy of Sales" :collection_id personal-id} result))
          (is (not= dash-id (:id result)))
          (testing "the copy's dashcards point at the original card"
            (is (= [card-id] (map :card_id (copied-dashcards (:id result))))))
          (testing "no card was duplicated"
            (is (= 1 (t2/count :model/Card :name "Revenue")))))))))

(deftest duplicate-dashboard-deep-test
  (testing "GHY-4151: is_deep_copy also duplicates the dashboard's questions into the destination"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {source-coll :id} {}
                     :model/Collection {dest-coll :id} {}
                     :model/Card {card-id :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id source-coll
                                                :dataset_query (venues-query)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id source-coll}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [result    (tool-result (call-tool! :crowberto {:type          "dashboard"
                                                             :id            dash-id
                                                             :collection_id dest-coll
                                                             :is_deep_copy  true}))
              new-cards (map :card_id (copied-dashcards (:id result)))]
          (is (=? {:type "dashboard" :collection_id dest-coll} result))
          (is (= 1 (count new-cards)))
          (is (not= [card-id] new-cards))
          (testing "the duplicated card lands in the destination collection"
            (is (=? {:name "Revenue" :collection_id dest-coll}
                    (t2/select-one :model/Card :id (first new-cards))))))))))

(deftest duplicate-dashboard-deep-uncopied-test
  (testing "GHY-4151: a deep copy reports cards it left behind as `uncopied`, and an unreadable one
            is reported by id alone — the tool must not hand the agent the name or query of a card
            the caller cannot read"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Collection {secret-coll :id} {}
                     :model/Card {secret-card :id} {:name          "Salaries"
                                                    :type          :question
                                                    :collection_id secret-coll
                                                    :dataset_query (venues-query)}
                     :model/Card {ok-card :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id secret-card}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id ok-card}]
        (mt/with-non-admin-groups-no-collection-perms secret-coll
          (let [result (tool-result (call-tool! :rasta {:type         "dashboard"
                                                        :id           dash-id
                                                        :is_deep_copy true}))]
            (is (= [{:id secret-card}] (:uncopied result))
                "the unreadable card must be reported by id alone — no name, no query")
            (testing "the unreadable card is left out of the copy entirely"
              (is (= 1 (count (copied-dashcards (:id result))))))
            (testing "while the readable card is duplicated into the caller's personal collection —
                      a different collection from the source, so the name is not suffixed"
              (is (= 1 (t2/count :model/Card
                                 :name "Revenue"
                                 :collection_id (:id (collection/user->personal-collection
                                                      (mt/user->id :rasta)))))))))))))

(deftest duplicate-dashboard-shallow-uncopied-test
  (testing "GHY-4218: a *shallow* copy drops unreadable cards too, and reports them. `card->decision`
            evaluates its `:discard` branch before it ever consults `deep-copy?`, so the default
            copy path can silently lose dashcards — the description used to promise `uncopied` only
            for deep copies, giving an agent no reason to look at it here"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Collection {secret-coll :id} {}
                     :model/Card {secret-card :id} {:name          "Salaries"
                                                    :type          :question
                                                    :collection_id secret-coll
                                                    :dataset_query (venues-query)}
                     :model/Card {ok-card :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id secret-card}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id ok-card}]
        (mt/with-non-admin-groups-no-collection-perms secret-coll
          ;; No `is_deep_copy` — the documented default, and the path an agent takes unless it has a
          ;; reason not to.
          (let [result (tool-result (call-tool! :rasta {:type "dashboard" :id dash-id}))]
            (is (= [{:id secret-card}] (:uncopied result))
                "the unreadable card is reported by id alone on a shallow copy too")
            (is (= 1 (:uncopied_count result)))
            (testing "and it really is left out of the copy"
              (is (= [ok-card] (map :card_id (copied-dashcards (:id result))))))))))))

(deftest duplicate-uncopied-count-survives-readback-degradation-test
  (testing "GHY-4218: a write-only token still learns the copy was partial. `:uncopied` itself must
            not ride out — `cards-to-copy`'s `redact` reduces a card to its id only when it is
            *unreadable*, so an archived-but-readable card keeps its real name, which would make the
            write scope a read oracle. The scalar count carries the signal without the names"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Collection {secret-coll :id} {}
                     :model/Card {secret-card :id} {:name          "Salaries"
                                                    :type          :question
                                                    :collection_id secret-coll
                                                    :dataset_query (venues-query)}
                     :model/Card {ok-card :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}
                     :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id secret-card}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id ok-card}]
        (mt/with-non-admin-groups-no-collection-perms secret-coll
          (let [result (tool-result (call-tool! :rasta #{metabot.scope/agent-content-write}
                                                {:type "dashboard" :id dash-id :is_deep_copy true}))]
            (is (= #{:id :type :note :uncopied_count} (set (keys result))))
            (is (= 1 (:uncopied_count result)))
            (testing "the names of cards the token cannot read never appear"
              (is (nil? (:uncopied result))))))))))

(deftest duplicate-explicit-false-deep-copy-test
  (testing "GHY-4218: `is_deep_copy: false` is the documented default, and the published strict
            inputSchema marks every property required — so a strict client must send it. Rejecting
            it refused a request the tool already serves; only an explicit `true` is wrong here"
    (mt/with-model-cleanup [:model/Card :model/Document]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Revenue"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}
                     :model/Document {doc-id :id} {:name          "Notes"
                                                   :collection_id coll-id
                                                   :document      (documents.tu/text->prose-mirror-ast "Hi.")}]
        (testing "question"
          (is (=? {:type "question" :name "Copy of Revenue"}
                  (tool-result (call-tool! :crowberto {:type          "question"
                                                       :id            card-id
                                                       :collection_id coll-id
                                                       :is_deep_copy  false})))))
        (testing "document"
          (is (=? {:type "document" :name "Copy of Notes"}
                  (tool-result (call-tool! :crowberto {:type          "document"
                                                       :id            doc-id
                                                       :collection_id coll-id
                                                       :is_deep_copy  false})))))
        (testing "an explicit true is still a teaching error on a non-dashboard"
          (is (= "`is_deep_copy` applies to dashboards only — omit it when duplicating a question."
                 (tool-error (call-tool! :crowberto {:type "question" :id card-id :is_deep_copy true})))))))))

(deftest duplicate-dashboard-shallow-with-dashboard-questions-test
  (testing "GHY-4151: a shallow copy of a dashboard holding dashboard questions is a teaching error
            naming is_deep_copy"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:name "Sales" :collection_id coll-id}
                   :model/Card _ {:name          "Inline question"
                                  :type          :question
                                  :collection_id coll-id
                                  :dashboard_id  dash-id
                                  :dataset_query (venues-query)}]
      (let [message (tool-error (call-tool! :crowberto {:type "dashboard" :id dash-id}))]
        (is (re-find #"is_deep_copy" message))
        (is (re-find #"questions saved inside it" message))))))

(deftest duplicate-deep-copy-wrong-type-test
  (testing "GHY-4151: is_deep_copy is dashboards-only and says so"
    (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query (venues-query)}]
      (is (= "`is_deep_copy` applies to dashboards only — omit it when duplicating a question."
             (tool-error (call-tool! :crowberto {:type "question" :id card-id :is_deep_copy true})))))))

;;; -------------------------------------------------- document ----------------------------------------------------

(deftest duplicate-document-test
  (testing "GHY-4218: a document copy lands in the caller's personal collection under a \"Copy of\" name"
    (mt/with-model-cleanup [:model/Document]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document {doc-id :id} {:name          "Q3 summary"
                                                   :collection_id coll-id
                                                   :document      (documents.tu/text->prose-mirror-ast "Revenue was up.")}]
        (let [personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))
              result      (tool-result (call-tool! :crowberto {:type "document" :id doc-id}))
              copy        (t2/select-one :model/Document :id (:id result))]
          (is (=? {:type "document" :name "Copy of Q3 summary" :collection_id personal-id} result))
          (is (not= doc-id (:id result)))
          (is (= (:document (t2/select-one :model/Document :id doc-id))
                 (:document copy))))))))

(deftest duplicate-document-copies-its-cards-test
  (testing "GHY-4151: the questions saved inside a document are copied along with it"
    (mt/with-model-cleanup [:model/Document :model/Card]
      (mt/with-temp [:model/Collection {source-coll :id} {}
                     :model/Collection {dest-coll :id} {}
                     :model/Document {doc-id :id} {:name          "Q3 summary"
                                                   :collection_id source-coll
                                                   :document      (documents.tu/text->prose-mirror-ast "Revenue was up.")}
                     :model/Card _ {:name          "Inline chart"
                                    :type          :question
                                    :collection_id source-coll
                                    :document_id   doc-id
                                    :dataset_query (venues-query)}]
        (let [result (tool-result (call-tool! :crowberto {:type          "document"
                                                          :id            doc-id
                                                          :collection_id dest-coll}))]
          (is (=? [{:name "Inline chart" :collection_id dest-coll}]
                  (t2/select :model/Card :document_id (:id result)))))))))

;;; ------------------------------------------- ids, permissions, scopes -------------------------------------------

(deftest entity-id-test
  (testing "GHY-4151: id accepts a 21-char entity_id as well as a numeric id"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Dashboard {dash-id :id dash-eid :entity_id} {:name "Sales"}]
        (let [result (tool-result (call-tool! :crowberto {:type "dashboard" :id dash-eid}))]
          (is (not= dash-id (:id result)))
          (is (= "Copy of Sales" (:name result)))))))
  (testing "GHY-4151: a malformed id is a teaching error naming both accepted shapes"
    (is (= "Invalid id \"nope\" — pass the positive numeric id, or the 21-character entity_id from a search or list result."
           (tool-error (call-tool! :crowberto {:type "dashboard" :id "nope"}))))))

(deftest unknown-type-test
  (testing "GHY-4151: a type outside the enum is rejected by argument validation"
    (is (re-find #"should be either"
                 (tool-error (call-tool! :crowberto {:type "collection" :id 1}))))))

(deftest source-read-permission-test
  (testing "GHY-4151: an unreadable source collapses to not-found — the response is never an existence oracle"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}]
        (is (= (format "Card %d not found — it may not exist, or you may not have access to it." card-id)
               (tool-error (call-tool! :rasta {:type "question" :id card-id}))))
        (is (= (format "Dashboard %d not found — it may not exist, or you may not have access to it." dash-id)
               (tool-error (call-tool! :rasta {:type "dashboard" :id dash-id}))))))))

(deftest destination-write-permission-test
  (testing "GHY-4151: copying into a collection the caller can't curate is refused, and nothing is written"
    (mt/with-temp [:model/Collection {source-coll :id} {}
                   :model/Collection {dest-coll :id} {}
                   :model/Card {card-id :id} {:name          "Revenue"
                                              :type          :question
                                              :collection_id source-coll
                                              :dataset_query (venues-query)}]
      (mt/with-non-admin-groups-no-collection-perms dest-coll
        ;; A bare `:isError` cannot tell a permission refusal from a Malli failure, a not-found on
        ;; the destination id, or an internal error sanitized to "Internal error" -- assert the
        ;; refusal actually mentions permissions, the way every other error test here does. That
        ;; needs the destination readable but not curatable: an unreadable one collapses to
        ;; not-found in `resolve-collection-id` before the create-check runs.
        (perms/grant-collection-read-permissions! (perms/all-users-group) dest-coll)
        (is (re-find #"(?i)permission"
                     (tool-error (call-tool! :rasta {:type          "question"
                                                     :id            card-id
                                                     :collection_id dest-coll}))))
        (is (= 1 (t2/count :model/Card :name "Revenue")))))))

(deftest scope-test
  (testing "GHY-4151: the tool itself requires agent:content:write"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales"}]
      (is (re-find #"^Insufficient scope to call tool: duplicate_content\."
                   (tool-error (call-tool! :crowberto #{metabot.scope/agent-content-read}
                                           {:type "dashboard" :id dash-id}))))))
  ;; GHY-4225 folded duplicate_content's per-type create scopes into the single
  ;; `agent:content:write` the tool already gates on, so there is no second scope to check.
  (testing "the tool's own write scope is all a copy needs"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales"}]
        ;; Without agent:content:read the echo degrades to the GHY-4227 ack, so the copy row is
        ;; what proves the write landed.
        (let [result (tool-result (call-tool! :crowberto #{metabot.scope/agent-content-write}
                                              {:type "dashboard" :id dash-id}))]
          (is (not= dash-id (:id result)))
          (is (= "Copy of Sales" (t2/select-one-fn :name :model/Dashboard :id (:id result)))))))))

(deftest readback-requires-read-scope-test
  (testing "GHY-4227: new_name defaults to \"Copy of <source name>\", so echoing the copy's name hands
            a write-only token the source's name — the echo degrades to an ack without agent:content:read"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Board deck Q3"}]
        (let [result (tool-result (call-tool! :crowberto #{metabot.scope/agent-content-write}
                                              {:type "dashboard" :id dash-id}))]
          ;; `:type` is the caller's own argument, so it survives as an ack-key; the source-derived
          ;; `:name` and `:collection_id` do not.
          (is (= #{:id :type :note} (set (keys result))))
          (is (= "dashboard" (:type result)))
          (is (re-find #"agent:content:read" (:note result)))
          (testing "and the copy still happened"
            (is (= "Copy of Board deck Q3"
                   (t2/select-one-fn :name :model/Dashboard :id (:id result)))))))
      (testing "a token that could read the copy back keeps the full echo"
        (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Board deck Q4"}]
          (is (=? {:type "dashboard" :name "Copy of Board deck Q4"}
                  (tool-result (call-tool! :crowberto #{metabot.scope/agent-content-write
                                                        metabot.scope/agent-content-read}
                                           {:type "dashboard" :id dash-id}))))))))
  (testing "GHY-4227: the leak is the source's name, so a caller-supplied new_name degrades too —
            the copy's own row fields are no more readable than the source"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:name          "Revenue by region"
                                                :type          :question
                                                :collection_id coll-id
                                                :dataset_query (venues-query)}]
        (let [result (tool-result (call-tool! :crowberto #{metabot.scope/agent-content-write}
                                              {:type "question" :id card-id :new_name "Mine"}))]
          (is (= #{:id :type :note} (set (keys result))))
          (is (= "Mine" (t2/select-one-fn :name :model/Card :id (:id result)))))))))
