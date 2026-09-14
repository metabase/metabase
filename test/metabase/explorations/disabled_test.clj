(ns metabase.explorations.disabled-test
  "Every test that pins the disabled state of explorations, so the definition of \"disabled\" lives in one place: the
  API routes are unmounted, the Metabot profile is unregistered, and the listing surfaces that could hand a client
  residue exploration rows are closed. Rows can still exist: an instance upgraded to a version with explorations, used
  to create some, then downgraded keeps its exploration tables, since their migrations belong to this version."
  (:require
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest exploration-routes-not-mounted-test
  (testing "The application does not serve /api/exploration"
    (mt/user-http-request :crowberto :get 404 "exploration/dimensions")))

(deftest metabot-explorations-profile-unregistered-test
  (testing "Asking the agent for the explorations profile is rejected before a turn starts"
    (mt/with-temporary-setting-values [llm.settings/llm-providers llm.tu/default-connections
                                       metabot.settings/llm-metabot-provider "openrouter/anthropic/claude-haiku-4-5"]
      (binding [scope/*current-user-metabot-permissions* scope/all-yes-permissions]
        (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
          (let [conversation-id (str (random-uuid))]
            (is (=? {:message #"Unknown profile"}
                    (mt/user-http-request :rasta :post 400 "metabot/agent-streaming"
                                          {:message         "hello"
                                           :context         {}
                                           :conversation_id conversation-id
                                           :state           {}
                                           :profile_id      "explorations"})))
            (is (empty? (t2/select :model/MetabotMessage :conversation_id conversation-id))
                "no turn was persisted")))))))

(deftest collection-items-omit-explorations-test
  (testing "GET /api/collection/:id/items"
    (mt/with-temp [:model/Collection  coll {}
                   :model/Card        card {:collection_id (:id coll)}
                   :model/Exploration expl {:name          "Residue exploration"
                                            :creator_id    (mt/user->id :crowberto)
                                            :collection_id (:id coll)}]
      (let [url (str "collection/" (:id coll) "/items")]
        (testing "omits a residue exploration"
          (is (= [["card" (:id card)]]
                 (map (juxt :model :id) (:data (mt/user-http-request :crowberto :get 200 url))))))
        (testing "does not report exploration as an available model"
          (is (= ["card"]
                 (:available_models (mt/user-http-request :crowberto :get 200 url :include-available-models true)))))
        (testing "rejects a models parameter naming exploration"
          (is (=? {:errors {:models some?}}
                  (mt/user-http-request :crowberto :get 400 url :models "exploration")))
          (is (=? {:errors {:models some?}}
                  (mt/user-http-request :crowberto :get 400 url :models "card" :models "exploration"))))
        (testing "the exploration id is not reachable through the residue row"
          (is (not-any? #(= (:id expl) (:id %))
                        (:data (mt/user-http-request :crowberto :get 200 url)))))))))

(deftest bookmarks-omit-explorations-test
  (testing "GET /api/bookmark"
    (mt/with-temp [:model/Collection          coll {}
                   :model/Card                card {:collection_id (:id coll)}
                   :model/Exploration         expl {:name          "Residue exploration"
                                                    :creator_id    (mt/user->id :rasta)
                                                    :collection_id (:id coll)}
                   :model/CardBookmark        _    {:user_id (mt/user->id :rasta) :card_id (:id card)}
                   :model/ExplorationBookmark _    {:user_id (mt/user->id :rasta) :exploration_id (:id expl)}]
      (let [bookmarks (set (map (juxt :type :item_id) (mt/user-http-request :rasta :get 200 "bookmark")))]
        (testing "omits a residue exploration bookmark"
          (is (contains? bookmarks ["card" (:id card)]))
          (is (not-any? #(= "exploration" (first %)) bookmarks))))
      (testing "rejects creating or deleting an exploration bookmark"
        ;; the model enum is part of the route match, so an unknown model is a 404 like any other unknown model
        (is (= "API endpoint does not exist."
               (mt/user-http-request :rasta :post 404 (str "bookmark/exploration/" (:id expl)))))
        (is (= "API endpoint does not exist."
               (mt/user-http-request :rasta :delete 404 (str "bookmark/exploration/" (:id expl)))))
        (is (t2/exists? :model/ExplorationBookmark :exploration_id (:id expl) :user_id (mt/user->id :rasta))
            "the rejected delete left the residue row alone"))
      (testing "rejects an exploration in the bookmark ordering"
        (is (=? {:errors {:orderings some?}}
                (mt/user-http-request :rasta :put 400 "bookmark/ordering"
                                      {:orderings [{:type "exploration" :item_id (:id expl)}]})))))))

(deftest search-omits-explorations-test
  (testing "GET /api/search"
    ;; the index table is only available on app DBs that support it; the in-place engine runs everywhere
    (search.tu/with-temp-index-table-if-supported
      (let [term    (mt/random-name)
            search  (fn [& args]
                      (apply mt/user-http-request :crowberto :get 200 "search" :q term args))
            engines (cond-> ["in-place"]
                      (search/supports-index?) (conj "appdb"))]
        (mt/with-temp [:model/Exploration expl {:name       (str "Residue " term)
                                                :creator_id (mt/user->id :crowberto)}]
          (when (search/supports-index?)
            (testing "the residue row is still ingested into the index"
              (is (t2/exists? (search.index/active-table) :model "exploration" :model_id (str (:id expl))))))
          (doseq [engine engines]
            (testing (str "the " engine " engine")
              (testing "omits the row"
                (is (empty? (:data (search :search_engine engine)))))
              (testing "does not list exploration as an available model"
                (is (not (contains? (set (:available_models (search :search_engine engine
                                                                    :calculate_available_models true)))
                                    "exploration"))))))
          (testing "a models filter naming exploration is rejected"
            (is (=? {:errors {:models some?}}
                    (mt/user-http-request :crowberto :get 400 "search" :q term :models "exploration")))))))))

(deftest search-config-excludes-explorations-test
  (testing "exploration is not a searchable model"
    (is (not (contains? search.config/all-models "exploration")))
    (is (contains? search.config/excluded-models "exploration")))
  (testing "the models search order still covers exactly the searchable models"
    (is (= search.config/all-models (set search.config/models-search-order)))))

(deftest comments-reject-exploration-targets-test
  (mt/with-temp [:model/Exploration expl {:name       "Residue exploration"
                                          :creator_id (mt/user->id :crowberto)}]
    (testing "GET /api/comment/ rejects an exploration target"
      (is (=? {:errors {:target_type some?}}
              (mt/user-http-request :crowberto :get 400 "comment/"
                                    :target_type "exploration" :target_id (:id expl)))))
    (testing "POST /api/comment/ rejects an exploration target"
      (is (=? {:errors {:target_type some?}}
              (mt/user-http-request :crowberto :post 400 "comment/"
                                    {:target_type "exploration"
                                     :target_id   (:id expl)
                                     :content     {:type "doc" :content [{:type "paragraph"
                                                                          :content [{:type "text" :text "hi"}]}]}}))))))
