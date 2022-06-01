(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [metabase.api.collection :as api.collection]
            [metabase.models :refer [Card Collection Dashboard DashboardCard ModerationReview NativeQuerySnippet
                                     PermissionsGroup PermissionsGroupMembership Pulse PulseCard PulseChannel
                                     PulseChannelRecipient Revision Timeline TimelineEvent User]]
            [metabase.models.collection :as collection]
            [metabase.models.collection-test :as collection-test]
            [metabase.models.collection.graph :as graph]
            [metabase.models.collection.graph-test :as graph.test]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.revision :as revision]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db])
  (:import [java.time ZonedDateTime ZoneId]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

(defmacro ^:private with-collection-hierarchy
  "Totally-rad macro that creates a Collection hierarchy and grants the All Users group perms for all the Collections
  you've bound. See docs for `metabase.models.collection-test/with-collection-hierarchy` for more details."
  {:style/indent 1}
  [collection-bindings & body]
  {:pre [(vector? collection-bindings)
         (every? symbol? collection-bindings)]}
  `(collection-test/with-collection-hierarchy [{:keys ~collection-bindings}]
     ~@(for [collection-symb collection-bindings]
         `(perms/grant-collection-read-permissions! (perms-group/all-users) ~collection-symb))
     ~@body))

(defn- do-with-french-user-and-personal-collection [f]
  (binding [collection/*allow-deleting-personal-collections* true]
    (mt/with-mock-i18n-bundles {"fr" {"{0} {1}''s Personal Collection" "Collection personnelle de {0} {1}"}}
      (mt/with-temp* [User       [user {:locale     "fr"
                                        :first_name "Taco"
                                        :last_name  "Bell"}]
                      Collection [collection {:personal_owner_id (:id user)}]]
        (f user collection)))))

(defmacro ^:private with-french-user-and-personal-collection
  "Create a user with locale's fr and a collection associated with it"
  {:style/indent 2}
  [user collection & body]
  `(do-with-french-user-and-personal-collection
     (fn [~user ~collection]
       ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                GET /collection                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest list-collections-test
  (testing "GET /api/collection"
    (testing "check that we can get a basic list of collections"
      ;; (for the purposes of test purposes remove the personal collections)
      (mt/with-temp Collection [collection]
        (is (= [{:parent_id           nil
                 :effective_location  nil
                 :effective_ancestors []
                 :can_write           true
                 :name                "Our analytics"
                 :authority_level     nil
                 :id                  "root"}
                (assoc (into {} collection) :can_write true)]
               (filter #(#{(:id collection) "root"} (:id %))
                       (mt/user-http-request :crowberto :get 200 "collection"))))))

    (testing "We should only see our own Personal Collections!"
      (is (= ["Lucky Pigeon's Personal Collection"]
             (->> (mt/user-http-request :lucky :get 200 "collection")
                  (filter :personal_owner_id)
                  (map :name))))

      (testing "...unless we are *admins*"
        (is (= ["Crowberto Corv's Personal Collection"
                "Lucky Pigeon's Personal Collection"
                "Rasta Toucan's Personal Collection"
                "Trash Bird's Personal Collection"]
               (->> (mt/user-http-request :crowberto :get 200 "collection")
                    (filter #((set (map mt/user->id [:crowberto :lucky :rasta :trashbird])) (:personal_owner_id %)))
                    (map :name)
                    sort)))))

    (testing "Personal Collection's name and slug should be returned in user's locale"
      (with-french-user-and-personal-collection user collection
        (is (= [{:name "Collection personnelle de Taco Bell"
                 :slug "collection_personnelle_de_taco_bell"}]
               (->> (mt/user-http-request user :get 200 "collection")
                    (filter :personal_owner_id)
                    (map #(select-keys % [:name :slug])))))))

    (testing "check that we don't see collections if we don't have permissions for them"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [collection-1 {:name "Collection 1"}]
                        Collection [collection-2 {:name "Collection 2"}]]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection-1)
          (is (= ["Our analytics"
                  "Collection 1"
                  "Rasta Toucan's Personal Collection"]
                 (->> (mt/user-http-request :rasta :get 200 "collection")
                      (filter (fn [{collection-name :name}]
                                (or (#{"Our analytics" "Collection 1" "Collection 2"} collection-name)
                                    (str/includes? collection-name "Personal Collection"))))
                      (map :name)))))))

    (mt/with-temp* [Collection [collection-1 {:name "Archived Collection", :archived true}]
                    Collection [collection-2 {:name "Regular Collection"}]]
      (letfn [(remove-other-collections [collections]
                (filter (fn [{collection-name :name}]
                          (or (#{"Our analytics" "Archived Collection" "Regular Collection"} collection-name)
                              (str/includes? collection-name "Personal Collection")))
                        collections))]
        (testing "check that we don't see collections if they're archived"
          (is (= ["Our analytics"
                  "Rasta Toucan's Personal Collection"
                  "Regular Collection"]
                 (->> (mt/user-http-request :rasta :get 200 "collection")
                      remove-other-collections
                      (map :name)))))

        (testing "Check that if we pass `?archived=true` we instead see archived Collections"
          (is (= ["Archived Collection"]
                 (->> (mt/user-http-request :rasta :get 200 "collection" :archived :true)
                      remove-other-collections
                      (map :name)))))))

    (testing "?namespace= parameter"
      (mt/with-temp* [Collection [{normal-id :id} {:name "Normal Collection"}]
                      Collection [{coins-id :id} {:name "Coin Collection", :namespace "currency"}]]
        (letfn [(collection-names [collections]
                  (->> collections
                       (filter #(#{normal-id coins-id} (:id %)))
                       (map :name)))]
          (testing "shouldn't show Collections of a different `:namespace` by default"
            (is (= ["Normal Collection"]
                   (collection-names (mt/user-http-request :rasta :get 200 "collection")))))

          (perms/grant-collection-read-permissions! (perms-group/all-users) coins-id)
          (testing "By passing `:namespace` we should be able to see Collections of that `:namespace`"
            (testing "?namespace=currency"
              (is (= ["Coin Collection"]
                     (collection-names (mt/user-http-request :rasta :get 200 "collection?namespace=currency")))))

            (testing "?namespace=stamps"
              (is (= []
                     (collection-names (mt/user-http-request :rasta :get 200 "collection?namespace=stamps")))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/tree                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- collection-tree-transform [xform collections]
  (vec (for [collection collections
             :let       [collection (xform collection)]
             :when      collection]
         (cond-> collection
           (:children collection) (update :children (partial collection-tree-transform xform))))))

(defn- collection-tree-names-only
  "Keep just the names of Collections in `collection-ids-to-keep` in the response returned by the Collection tree
  endpoint."
  [collection-ids-to-keep collections]
  (collection-tree-transform (fn [collection]
                               (when (contains? (set collection-ids-to-keep) (:id collection))
                                 (select-keys collection [:name :children])))
                             collections))

(deftest collection-tree-test
  (testing "GET /api/collection/tree"
    (let [personal-collection (collection/user->personal-collection (mt/user->id :rasta))]
      (testing "sanity check"
        (is (some? personal-collection)))
      (with-collection-hierarchy [a b c d e f g]
        (let [ids      (set (map :id (cons personal-collection [a b c d e f g])))
              response (mt/user-http-request :rasta :get 200 "collection/tree")]
          (testing "Make sure overall tree shape of the response is as is expected"
            (is (= [{:name     "A"
                     :children [{:name "B", :children []}
                                {:name     "C"
                                 :children [{:name     "D"
                                             :children [{:name "E", :children []}]}
                                            {:name     "F"
                                             :children [{:name "G", :children []}]}]}]}
                    {:name "Rasta Toucan's Personal Collection", :children []}]
                   (collection-tree-names-only ids response))))
          (testing "Make sure each Collection comes back with the expected keys"
            (is (= {:description       nil
                    :archived          false
                    :entity_id         nil
                    :slug              "rasta_toucan_s_personal_collection"
                    :color             "#31698A"
                    :name              "Rasta Toucan's Personal Collection"
                    :personal_owner_id (mt/user->id :rasta)
                    :id                (:id (collection/user->personal-collection (mt/user->id :rasta)))
                    :location          "/"
                    :namespace         nil
                    :children          []
                    :authority_level   nil}
                   (some #(when (= (:id %) (:id (collection/user->personal-collection (mt/user->id :rasta))))
                            %)
                         response))))))
      (testing "Excludes archived collections (#19603)"
        (mt/with-temp* [Collection [a {:name "A"}]
                        Collection [b {:name     "B archived"
                                       :location (collection/location-path a)
                                       :archived true}]
                        Collection [c {:name "C archived"
                                       :archived true}]]
          (let [ids      (set (map :id [a b c]))
                response (mt/user-http-request :rasta :get 200
                                               "collection/tree?exclude-archived=true")]
            (is (= [{:name "A" :children []}]
                   (collection-tree-names-only ids response)))))))

    (testing "for personal collections, it should return name and slug in user's locale"
      (with-french-user-and-personal-collection user collection
        (is (= {:description       nil
                :archived          false
                :entity_id         nil
                :slug              "collection_personnelle_de_taco_bell"
                :color             "#ABCDEF"
                :name              "Collection personnelle de Taco Bell"
                :personal_owner_id (:id user)
                :id                (:id collection)
                :location          "/"
                :namespace         nil
                :children          []
                :authority_level   nil}
               (some #(when (= (:id %) (:id collection)) %)
                     (mt/user-http-request user :get 200 "collection/tree"))))))))

(deftest collection-tree-child-permissions-test
  (testing "GET /api/collection/tree"
    (testing "Tree endpoint should still return Collections if we don't have perms for the parent Collection (#14114)"
      ;; Create a hierarchy like:
      ;;
      ;; + Our analytics (Revoke permissions to All Users)
      ;; +--+ Parent collection (Revoke permissions to All Users)
      ;;    +--+ Child collection (Give All Users group Curate access)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [parent-collection {:name "Parent"}]
                        Collection [child-collection  {:name "Child", :location (format "/%d/" (:id parent-collection))}]]
          (perms/revoke-collection-permissions! (perms-group/all-users) parent-collection)
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) child-collection)
          (is (= [{:name "Child", :children []}]
                 (collection-tree-names-only (map :id [parent-collection child-collection])
                                             (mt/user-http-request :rasta :get 200 "collection/tree")))))))

    (testing "Namespace parameter"
      (mt/with-temp* [Collection [{normal-id :id} {:name "Normal Collection"}]
                      Collection [{coins-id :id} {:name "Coin Collection", :namespace "currency"}]]
        (let [ids [normal-id coins-id]]
          (testing "shouldn't show Collections of a different `:namespace` by default"
            (is (= [{:name "Normal Collection", :children []}]
                   (collection-tree-names-only ids (mt/user-http-request :rasta :get 200 "collection/tree")))))

          (perms/grant-collection-read-permissions! (perms-group/all-users) coins-id)
          (testing "By passing `:namespace` we should be able to see Collections of that `:namespace`"
            (testing "?namespace=currency"
              (is (= [{:name "Coin Collection", :children []}]
                     (collection-tree-names-only ids (mt/user-http-request :rasta :get 200 "collection/tree?namespace=currency")))))

            (testing "?namespace=stamps"
              (is (= []
                     (collection-tree-names-only ids (mt/user-http-request :rasta :get 200 "collection/tree?namespace=stamps")))))))))

    (testing "Tree should elide Collections for which we have no permissions (#14280)"
      ;; Create hierarchy like
      ;;
      ;;     +-> B*
      ;;     |
      ;; A* -+-> C -+-> D -> E*
      ;;            |
      ;;            +-> F* -> G*
      ;;
      ;; Grant perms for collections with a `*`. Should see
      ;;
      ;;     +-> B*
      ;;     |
      ;; A* -+-> E*
      ;;     |
      ;;     +-> F* -> G*
      (collection-test/with-collection-hierarchy [{:keys [a b e f g], :as collections}]
        (doseq [collection [a b e f g]]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection))
        (is (= [{:name     "A"
                 :children [{:name "B", :children []}
                            {:name "E", :children []}
                            {:name     "F"
                             :children [{:name "G", :children []}]}]}]
               (collection-tree-transform
                (let [ids-to-keep (set (map u/the-id (vals collections)))]
                  (fn [{collection-id :id, :as collection}]
                    (when (or (not collection-id)
                              (ids-to-keep collection-id))
                      (select-keys collection [:name :children]))))
                (mt/user-http-request :rasta :get 200 "collection/tree"))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-collection-test
  (testing "GET /api/collection/:id"
    (testing "check that we can see collection details"
      (mt/with-temp Collection [collection {:name "Coin Collection"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (is (= "Coin Collection"
               (:name (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection))))))))

    (testing "check that collections detail properly checks permissions"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "collection/" (u/the-id collection))))))))

    (testing "for personal collections, it should return name and slug in user's locale"
      (with-french-user-and-personal-collection user collection
        (is (= {:name "Collection personnelle de Taco Bell"
                :slug "collection_personnelle_de_taco_bell"}
               (select-keys (mt/user-http-request (:id user) :get 200 (str "collection/" (:id collection)))
                            [:name :slug])))))))

;;; ------------------------------------------------ Collection Items ------------------------------------------------

(defn- do-with-some-children-of-collection [collection-or-id-or-nil f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [collection-id-or-nil (when collection-or-id-or-nil
                                 (u/the-id collection-or-id-or-nil))]
      (mt/with-temp* [Card       [{card-id :id}
                                  {:name          "Birthday Card"
                                   :collection_id collection-id-or-nil}]
                      Dashboard  [{dashboard-id :id}
                                  {:name          "Dine & Dashboard"
                                   :collection_id collection-id-or-nil}]
                      Pulse      [{pulse-id :id, :as pulse}
                                  {:name          "Electro-Magnetic Pulse"
                                   :collection_id collection-id-or-nil}]
                      ;; this is a dashboard subscription
                      DashboardCard [{dashboard-card-id :id}
                                     {:dashboard_id dashboard-id
                                      :card_id      card-id}]
                      Pulse      [{dashboard-sub-pulse-id :id}
                                  {:name          "Acme Products"
                                   :collection_id collection-id-or-nil}]
                      PulseCard  [{dashboard-sub-pulse-card-id :id}
                                  {:card_id           card-id
                                   :dashboard_card_id dashboard-card-id
                                   :pulse_id          dashboard-sub-pulse-id}]]
        (f {:card-id                         card-id
            :dashboard-id                    dashboard-id
            :pulse-id                        pulse-id
            :dashboard-subscription-pulse-id dashboard-sub-pulse-id
            :dashboard-sub-pulse-card-id     dashboard-sub-pulse-card-id})))))

(defmacro ^:private with-some-children-of-collection {:style/indent 1} [collection-or-id-or-nil & body]
  `(do-with-some-children-of-collection
    ~collection-or-id-or-nil
    (fn [~'&ids]
      ~@body)))

(defn- remove-non-test-items
  "Remove Cards, Dashboards, and Pulses that aren't the 'Birthday Card'/'Dine & Dashboard'/'Electro-Magnetic Pulse'
  created by `with-some-children-of-collection`."
  [items {:keys [card-id dashboard-id pulse-id]}]
  (filter (fn [{:keys [id model]}]
            (case model
              "card"      (= id card-id)
              "dashboard" (= id dashboard-id)
              "pulse"     (= id pulse-id)
              true))
          items))

(defn- remove-non-personal-collections
  [items]
  (remove (fn [{:keys [model name]}]
            (when (= model "collection")
              (not (str/includes? name "Personal Collection"))))
          items))

(defn- default-item [{:keys [model] :as item-map}]
  (merge {:id true, :collection_position nil, :entity_id false}
         (when (= model "collection")
           {:authority_level nil})
         (when (= model "card")
           {:moderated_status nil})
         item-map))

(defn- collection-item [collection-name & {:as extra-keypairs}]
  (merge {:id              true
          :description     nil
          :can_write       (str/ends-with? collection-name "Personal Collection")
          :model           "collection"
          :authority_level nil
          :entity_id       false
          :name            collection-name}
         extra-keypairs))

(deftest collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "check that cards are returned with the collection/items endpoint"
      (mt/with-temp* [Collection       [collection]
                      User             [{user-id :id} {:first_name "x" :last_name "x" :email "zzzz@example.com"}]
                      Card             [{card-id :id :as card} {:collection_id (u/the-id collection)}]
                      ModerationReview [_ {:moderated_item_type "card"
                                           :moderated_item_id   card-id
                                           :status              "verified"
                                           :moderator_id        user-id
                                           :most_recent         true}]]
        (is (= (mt/obj->json->obj
                [{:id                  card-id
                  :name                (:name card)
                  :collection_position nil
                  :display             "table"
                  :description         nil
                  :entity_id           nil
                  :moderated_status    "verified"
                  :model               "card"}])
               (mt/obj->json->obj
                (:data (mt/user-http-request :crowberto :get 200
                                             (str "collection/" (u/the-id collection) "/items"))))))))
    (testing "check that limit and offset work and total comes back"
      (mt/with-temp* [Collection [collection]
                      Card       [card3        {:collection_id (u/the-id collection)}]
                      Card       [card2        {:collection_id (u/the-id collection)}]
                      Card       [card1        {:collection_id (u/the-id collection)}]]
        (is (= 2 (count (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "1")))))
        (is (= 1 (count (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "2")))))
        (is (= 3 (:total (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "1"))))))

    (testing "check that pinning filtering exists"
      (mt/with-temp* [Collection [collection]
                      Card       [card3        {:collection_id (u/the-id collection)
                                                :collection_position 1
                                                :name "pinned-1"}]
                      Card       [card2        {:collection_id (u/the-id collection)
                                                :collection_position 1
                                                :name "pinned-2"}]
                      Card       [card1        {:collection_id (u/the-id collection)
                                                :name "unpinned-card"}]
                      Timeline   [timeline     {:collection_id (u/the-id collection)
                                                :name "timeline"}]]
        (letfn [(fetch [pin-state]
                  (:data (mt/user-http-request :crowberto :get 200
                                               (str "collection/" (u/the-id collection) "/items")
                                               :pinned_state pin-state)))]
          (is (= #{"pinned-1" "pinned-2"} (->> (fetch "is_pinned")
                                               (map :name)
                                               set)))
          (is (= #{"timeline" "unpinned-card"} (->> (fetch "is_not_pinned")
                                                    (map :name)
                                                    set))))))

    (testing "check that you get to see the children as appropriate"
      (mt/with-temp Collection [collection {:name "Debt Collection"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (with-some-children-of-collection collection
          (is (= (map default-item [{:name "Acme Products", :model "pulse", :entity_id false}
                                    {:name "Birthday Card", :description nil, :model "card", :display "table", :entity_id false}
                                    {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id false}
                                    {:name "Electro-Magnetic Pulse", :model "pulse", :entity_id false}])
                 (mt/boolean-ids-and-timestamps
                  (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items"))))))))

      (testing "...and that you can also filter so that you only see the children you want to see"
        (mt/with-temp Collection [collection {:name "Art Collection"}]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (with-some-children-of-collection collection
            (is (= ()
                   (mt/boolean-ids-and-timestamps
                     (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items?models=no_models"))))))
            (is (= [(default-item {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id false})]
                   (mt/boolean-ids-and-timestamps
                    (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items?models=dashboard"))))))
            (is (= [(default-item {:name "Birthday Card", :description nil, :model "card", :display "table", :entity_id false})
                    (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id false})]
                   (mt/boolean-ids-and-timestamps
                    (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items?models=dashboard&models=card"))))))))))


    (testing "Let's make sure the `archived` option works."
      (mt/with-temp Collection [collection {:name "Art Collection"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (with-some-children-of-collection collection
          (db/update-where! Dashboard {:collection_id (u/the-id collection)} :archived true)
          (is (= [(default-item {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id false})]
                 (mt/boolean-ids-and-timestamps
                  (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items?archived=true")))))))))
    (mt/with-temp* [Collection [{collection-id :id} {:name "Collection with Items"}]
                    User       [{user1-id :id} {:first_name "Test" :last_name "AAAA" :email "aaaa@example.com"}]
                    User       [{user2-id :id} {:first_name "Test" :last_name "ZZZZ" :email "zzzz@example.com"}]
                    Card       [{card1-id :id :as card1}
                                {:name "Card with history 1" :collection_id collection-id}]
                    Card       [{card2-id :id :as card2}
                                {:name "Card with history 2" :collection_id collection-id}]
                    Card       [_ {:name "ZZ" :collection_id collection-id}]
                    Card       [_ {:name "AA" :collection_id collection-id}]
                    Revision   [_revision1 {:model    "Card"
                                            :model_id card1-id
                                            :user_id  user2-id
                                            :object   (revision/serialize-instance card1 card1-id card1)}]
                    Revision   [_revision2 {:model    "Card"
                                            :model_id card2-id
                                            :user_id  user1-id
                                            :object   (revision/serialize-instance card2 card2-id card2)}]]
      ;; need different timestamps and Revision has a pre-update to throw as they aren't editable
      (db/execute! {:update :revision
                    ;; in the past
                    :set {:timestamp (.minusHours (ZonedDateTime/now (ZoneId/of "UTC")) 24)}
                    :where [:= :id (:id _revision1)]})
      (testing "Results include last edited information from the `Revision` table"
        (is (= [{:name "AA"}
                {:name "Card with history 1",
                 :last-edit-info
                 {:id         true,
                  :email      "zzzz@example.com",
                  :first_name "Test",
                  :last_name  "ZZZZ",
                  :timestamp  true}}
                {:name "Card with history 2",
                 :last-edit-info
                 {:id         true,
                  :email      "aaaa@example.com",
                  :first_name "Test",
                  :last_name  "AAAA",
                  ;; timestamp collapsed to true, ordinarily a OffsetDateTime
                  :timestamp  true}}
                {:name "ZZ"}]
               (->> (:data (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items")))
                    mt/boolean-ids-and-timestamps
                    (map #(select-keys % [:name :last-edit-info]))))))
      (testing "Results can be ordered by last-edited-at"
        (testing "ascending"
          (is (= ["Card with history 1" "Card with history 2" "AA" "ZZ"]
                 (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_at&sort_direction=asc"))
                      :data
                      (map :name)))))
        (testing "descending"
          (is (= ["Card with history 2" "Card with history 1" "AA" "ZZ"]
                 (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_at&sort_direction=desc"))
                      :data
                      (map :name))))))
      (testing "Results can be ordered by last-edited-by"
        (testing "ascending"
          ;; card with history 2 has user Test AAAA, history 1 user Test ZZZZ
          (is (= ["Card with history 2" "Card with history 1" "AA" "ZZ"]
                 (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_by&sort_direction=asc"))
                      :data
                      (map :name)))))
        (testing "descending"
          (is (= ["Card with history 1" "Card with history 2" "AA" "ZZ"]
                 (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_by&sort_direction=desc"))
                      :data
                      (map :name))))))
      (testing "Results can be ordered by model"
        (mt/with-temp* [Collection [{collection-id :id} {:name "Collection with Items"}]
                        Card       [_ {:name "ZZ" :collection_id collection-id}]
                        Card       [_ {:name "AA" :collection_id collection-id}]
                        Dashboard  [_ {:name "ZZ" :collection_id collection-id}]
                        Dashboard  [_ {:name "AA" :collection_id collection-id}]
                        Pulse      [_ {:name "ZZ" :collection_id collection-id}]
                        Pulse      [_ {:name "AA" :collection_id collection-id}]]
          (testing "sort direction asc"
            (is (= [["dashboard" "AA"] ["dashboard" "ZZ"] ["pulse" "AA"] ["pulse" "ZZ"] ["card" "AA"] ["card" "ZZ"]]
                   (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=model&sort_direction=asc"))
                        :data
                        (map (juxt :model :name))))))
          (testing "sort direction desc"
            (is (= [["card" "AA"] ["card" "ZZ"] ["pulse" "AA"] ["pulse" "ZZ"] ["dashboard" "AA"] ["dashboard" "ZZ"]]
                   (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=model&sort_direction=desc"))
                        :data
                        (map (juxt :model :name)))))))))
    (testing "Results have the lastest revision timestamp"
      (mt/with-temp* [Collection [{collection-id :id} {:name "Collection with Items"}]
                      User       [{failuser-id :id} {:first_name "failure" :last_name "failure" :email "failure@example.com"}]
                      User       [{passuser-id :id} {:first_name "pass" :last_name "pass" :email "pass@example.com"}]
                      Card       [{card-id :id :as card}
                                  {:name "card" :collection_id collection-id}]
                      Dashboard  [{dashboard-id :id :as dashboard} {:name "dashboard" :collection_id collection-id}]
                      Revision   [card-revision1
                                  {:model    "Card"
                                   :model_id card-id
                                   :user_id  failuser-id
                                   :object   (revision/serialize-instance card card-id card)}]
                      Revision   [card-revision2
                                  {:model    "Card"
                                   :model_id card-id
                                   :user_id  failuser-id
                                   :object   (revision/serialize-instance card card-id card)}]
                      Revision   [dash-revision1
                                  {:model    "Dashboard"
                                   :model_id dashboard-id
                                   :user_id  failuser-id
                                   :object   (revision/serialize-instance dashboard dashboard-id dashboard)}]
                      Revision   [dash-revision2
                                  {:model    "Dashboard"
                                   :model_id dashboard-id
                                   :user_id  failuser-id
                                   :object   (revision/serialize-instance dashboard dashboard-id dashboard)}]]
        (letfn [(at-year [year] (ZonedDateTime/of year 1 1 0 0 0 0 (ZoneId/of "UTC")))]
          (db/execute! {:update :revision
                        ;; in the past
                        :set    {:timestamp (at-year 2015)}
                        :where  [:in :id (map :id [card-revision1 dash-revision1])]})
          ;; mark the later revisions with the user with name "pass". Note important that its the later revision by
          ;; id. Query assumes increasing timestamps with ids
          (db/execute! {:update :revision
                        :set    {:timestamp (at-year 2021)
                                 :user_id   passuser-id}
                        :where  [:in :id (map :id [card-revision2 dash-revision2])]}))
        (is (= ["pass" "pass"]
               (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?models=dashboard&models=card"))
                    :data
                    (map (comp :last_name :last-edit-info)))))))
    (testing "Results include authority_level"
      (mt/with-temp* [Collection [{collection-id :id} {:name "Collection with Items"}]
                      Collection [_ {:name "subcollection"
                                     :location (format "/%d/" collection-id)
                                     :authority_level "official"}]
                      Card       [_ {:name "card" :collection_id collection-id}]
                      Dashboard  [_ {:name "dash" :collection_id collection-id}]]
        (let [items (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?models=dashboard&models=card&models=collection"))
                         :data)]
          (is (= #{{:name "card"}
                   {:name "dash"}
                   {:name "subcollection" :authority_level "official"}}
                 (into #{} (map #(select-keys % [:name :authority_level]))
                       items))))))
    (testing "Includes datasets"
      (mt/with-temp* [Collection [{collection-id :id} {:name "Collection with Items"}]
                      Collection [_ {:name "subcollection"
                                     :location (format "/%d/" collection-id)
                                     :authority_level "official"}]
                      Card       [_ {:name "card" :collection_id collection-id}]
                      Card       [_ {:name "dataset" :dataset true :collection_id collection-id}]
                      Dashboard  [_ {:name "dash" :collection_id collection-id}]]
        (let [items (->> "/items?models=dashboard&models=card&models=collection"
                         (str "collection/" collection-id)
                         (mt/user-http-request :rasta :get 200)
                         :data)]
          (is (= #{"card" "dash" "subcollection"}
                 (into #{} (map :name) items))))
        (let [items (->> "/items?models=dashboard&models=card&models=collection&models=dataset"
                         (str "collection/" collection-id)
                         (mt/user-http-request :rasta :get 200)
                         :data)]
          (is (= #{"card" "dash" "subcollection" "dataset"}
                 (into #{} (map :name) items))))
        (let [items (->> (str "collection/" collection-id "/items")
                         (mt/user-http-request :rasta :get 200)
                         :data)]
          (is (= #{"card" "dash" "subcollection" "dataset"}
                 (into #{} (map :name) items))))))))

(deftest children-sort-clause-test
  (testing "Default sort"
    (doseq [app-db [:mysql :h2 :postgres]]
      (is (= [[:%lower.name :asc]]
             (api.collection/children-sort-clause nil app-db)))))
  (testing "Sorting by last-edited-at"
    (is (= [[(hsql/call :ISNULL :last_edit_timestamp)]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause [:last-edited-at :asc] :mysql)))
    (is (= [[:last_edit_timestamp :nulls-last]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause [:last-edited-at :asc] :postgres))))
  (testing "Sorting by last-edited-by"
    (is (= [[:last_edit_last_name :nulls-last]
            [:last_edit_last_name :asc]
            [:last_edit_first_name :nulls-last]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause [:last-edited-by :asc] :postgres)))
    (is (= [[(hsql/call :ISNULL :last_edit_last_name)]
            [:last_edit_last_name :asc]
            [(hsql/call :ISNULL :last_edit_first_name)]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause [:last-edited-by :asc] :mysql))))
  (testing "Sortinb by model"
    (is (= [[:model_ranking :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause [:model :asc] :postgres)))
    (is (= [[:model_ranking :desc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause [:model :desc] :mysql)))))

(deftest snippet-collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "Native query snippets should come back when fetching the items in a Collection in the `:snippets` namespace"
      (mt/with-temp* [Collection         [{collection-id :id} {:namespace "snippets", :name "My Snippet Collection"}]
                      NativeQuerySnippet [{snippet-id :id}    {:collection_id collection-id, :name "My Snippet"}]
                      NativeQuerySnippet [{archived-id :id}   {:collection_id collection-id, :name "Archived Snippet", :archived true}]]
        (is (= [{:id        snippet-id
                 :name      "My Snippet"
                 :entity_id nil
                 :model     "snippet"}]
               (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" collection-id)))))

        (testing "\nShould be able to fetch archived Snippets"
          (is (= [{:id        archived-id
                   :name      "Archived Snippet"
                   :entity_id nil
                   :model     "snippet"}]
                 (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items?archived=true" collection-id))))))

        (testing "\nShould be able to pass ?model=snippet, even though it makes no difference in this case"
          (is (= [{:id        snippet-id
                   :name      "My Snippet"
                   :entity_id nil
                   :model     "snippet"}]
                 (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items?model=snippet" collection-id))))))))))


;;; --------------------------------- Fetching Personal Collections (Ours & Others') ---------------------------------

(defn- lucky-personal-collection []
  (merge
   (mt/object-defaults Collection)
   {:slug                "lucky_pigeon_s_personal_collection"
    :color               "#31698A"
    :can_write           true
    :name                "Lucky Pigeon's Personal Collection"
    :personal_owner_id   (mt/user->id :lucky)
    :effective_ancestors [{:metabase.models.collection.root/is-root? true
                           :name                                     "Our analytics"
                           :id                                       "root"
                           :authority_level                          nil
                           :can_write                                true}]
    :effective_location  "/"
    :parent_id           nil
    :entity_id           nil
    :id                  (u/the-id (collection/user->personal-collection (mt/user->id :lucky)))
    :location            "/"}))

(defn- lucky-personal-collection-id
  []
  (u/the-id (collection/user->personal-collection (mt/user->id :lucky))))

(defn- api-get-lucky-personal-collection [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  (mt/user-http-request user-kw :get expected-status-code (str "collection/" (lucky-personal-collection-id))))

(defn- api-get-lucky-personal-collection-items [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  (:data (mt/user-http-request user-kw :get expected-status-code (str "collection/" (lucky-personal-collection-id) "/items"))))

(deftest fetch-personal-collection-test
  (testing "GET /api/collection/:id"
    (testing "Can we use this endpoint to fetch our own Personal Collection?"
      (is (= (lucky-personal-collection)
             (api-get-lucky-personal-collection :lucky))))

    (testing "Can and admin use this endpoint to fetch someone else's Personal Collection?"
      (is (= (lucky-personal-collection)
             (api-get-lucky-personal-collection :crowberto))))

    (testing "Other, non-admin Users should not be allowed to fetch others' Personal Collections!"
      (is (= "You don't have permissions to do that."
             (api-get-lucky-personal-collection :rasta, :expected-status-code 403))))))

(def ^:private lucky-personal-subcollection-item
  [(collection-item "Lucky's Personal Sub-Collection" :can_write true)])

(defn- api-get-lucky-personal-collection-with-subcollection [user-kw]
  (mt/with-temp Collection [_ {:name     "Lucky's Personal Sub-Collection"
                               :location (collection/children-location
                                          (collection/user->personal-collection (mt/user->id :lucky)))}]
    (mt/boolean-ids-and-timestamps (api-get-lucky-personal-collection-items user-kw))))

(deftest fetch-personal-collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "If we have a sub-Collection of our Personal Collection, that should show up"
      (is (= lucky-personal-subcollection-item
             (api-get-lucky-personal-collection-with-subcollection :lucky))))

    (testing "sub-Collections of other's Personal Collections should show up for admins as well"
      (is (= lucky-personal-subcollection-item
             (api-get-lucky-personal-collection-with-subcollection :crowberto))))))


;;; ------------------------------------ Effective Ancestors & Effective Children ------------------------------------

(defn- format-ancestors
  "Nicely format the `:effective_` results from an API call."
  [results]
  (-> results
      (select-keys [:effective_ancestors :effective_location])
      (update :effective_ancestors (partial map #(update % :id integer?)))
      (update :effective_location collection-test/location-path-ids->names)))

(defn- api-get-collection-ancestors
  "Call the API with Rasta to fetch `collection-or-id` and put the `:effective_` results in a nice format for the tests
  below."
  [collection-or-id & additional-get-params]
  (format-ancestors (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection-or-id)))))

(defn- api-get-collection-children
  [collection-or-id & additional-get-params]
  (mt/boolean-ids-and-timestamps (:data (apply mt/user-http-request :rasta
                                         :get 200 (str "collection/" (u/the-id collection-or-id) "/items")
                                         additional-get-params))))

(deftest effective-ancestors-and-children-test
  ;; Create hierarchy like
  ;;
  ;;     +-> B*
  ;;     |
  ;; A* -+-> C* +-> D* -> E
  ;;            |
  ;;            +-> F --> G*
  ;;
  ;; Grant perms for collections with a `*`. Should see
  ;;
  ;;     +-> B*
  ;;     |
  ;; A* -+-> C* +-> D*
  ;;            |
  ;;            +-> G*
  (testing "does a top-level Collection like A have the correct Children?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is(= {:effective_ancestors []
               :effective_location  "/"}
              (api-get-collection-ancestors a))))
      (testing "children"
        (is (= (map collection-item ["B" "C"])
               (api-get-collection-children a))))))

  (testing "ok, does a second-level Collection have its parent and its children?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors c))))
      (testing "children"
        (is (= (map collection-item ["D" "G"])
               (api-get-collection-children c))))))

  (testing "what about a third-level Collection?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}
                                      {:name "C", :id true, :can_write false}]
                :effective_location  "/A/C/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d))))))

  (testing (str "for D: if we remove perms for C we should only have A as an ancestor; effective_location should lie "
                "and say we are a child of A")
    (with-collection-hierarchy [a b d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d))))))

  (testing "for D: If, on the other hand, we remove A, we should see C as the only ancestor and as a root-level Collection."
    (with-collection-hierarchy [b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "C", :id true, :can_write false}]
                :effective_location  "/C/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d)))))

    (testing "for C: if we remove D we should get E and F as effective children"
      (with-collection-hierarchy [a b c e f g]
        (testing "ancestors"
          (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}]
                  :effective_location  "/A/"}
                 (api-get-collection-ancestors c))))
        (testing "children"
          (is (= (map collection-item ["E" "F"])
                 (api-get-collection-children c)))))))

  (testing "Make sure we can collapse multiple generations. For A: removing C and D should move up E and F"
    (with-collection-hierarchy [a b e f g]
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a))))
      (testing "children"
        (is (= (map collection-item ["B" "E" "F"])
               (api-get-collection-children a))))))

  (testing "Let's make sure the 'archived` option works on Collections, nested or not"
    (with-collection-hierarchy [a b c]
      (db/update! Collection (u/the-id b) :archived true)
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a :archived true))))
      (testing "children"
        (is (= [(collection-item "B")]
               (api-get-collection-children a :archived true)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/root                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-root-collection-test
  (testing "GET /api/collection/root"
    (testing "Check that we can see stuff that isn't in any Collection -- meaning they're in the so-called \"Root\" Collection"
      (is (= {:name                "Our analytics"
              :id                  "root"
              :can_write           true
              :effective_location  nil
              :effective_ancestors []
              :authority_level     nil
              :parent_id           nil}
             (with-some-children-of-collection nil
               (mt/user-http-request :crowberto :get 200 "collection/root")))))))

(deftest fetch-root-items-collection-test
  (testing "GET /api/collection/root/items"
    (testing "Make sure you can see everything for Users that can see everything"
      (is (= [(default-item {:name "Birthday Card", :description nil, :model "card", :display "table"})
              (collection-item "Crowberto Corv's Personal Collection")
              (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
              (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})]
             (with-some-children-of-collection nil
               (-> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                   (remove-non-test-items &ids)
                   remove-non-personal-collections
                   mt/boolean-ids-and-timestamps))))

      (testing "... with limits and offsets"
        (with-some-children-of-collection nil
          (letfn [(items [limit offset]
                    (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"
                                                 :limit (str limit), :offset (str offset))))]
            (let [[a-1 b-1 :as items-1] (items 2 0)]
              (is (= 2
                     (count items-1)))
              (let [[a-2 b-2 :as items-2] (items 2 1)]
                (is (= 2
                       (count items-2)))
                (is (= b-1 a-2))
                (is (not= items-1 items-2)))))))

      (testing "... with a total back, too, even with limit and offset"
        ;; `:total` should be at least 5 items based on `with-some-children-of-collection`. Might be a bit more if
        ;; other stuff was created
        (is (<= 5 (with-some-children-of-collection nil
                    (:total (mt/user-http-request :crowberto :get 200 "collection/root/items" :limit "2" :offset "1"))))))

      (testing "...but we don't let you see stuff you wouldn't otherwise be allowed to see"
        (is (= [(collection-item "Rasta Toucan's Personal Collection")]
               ;; if a User doesn't have perms for the Root Collection then they don't get to see things with no collection_id
               (with-some-children-of-collection nil
                 (-> (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))
                     remove-non-personal-collections
                     mt/boolean-ids-and-timestamps))))

        (testing "...but if they have read perms for the Root Collection they should get to see them"
          (with-some-children-of-collection nil
            (mt/with-temp* [PermissionsGroup           [group]
                            PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]]
              (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
              (is (= [(default-item {:name "Birthday Card", :description nil, :model "card", :display "table"})
                      (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
                      (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})
                      (collection-item "Rasta Toucan's Personal Collection")]
                     (-> (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))
                         (remove-non-test-items &ids)
                         remove-non-personal-collections
                         mt/boolean-ids-and-timestamps))))))))

    (testing "So I suppose my Personal Collection should show up when I fetch the Root Collection, shouldn't it..."
      (is (= [{:name            "Rasta Toucan's Personal Collection"
               :id              (u/the-id (collection/user->personal-collection (mt/user->id :rasta)))
               :description     nil
               :model           "collection"
               :authority_level nil
               :entity_id       nil
               :can_write       true}]
             (->> (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))
                  (filter #(str/includes? (:name %) "Personal Collection")))))

      (testing "and personal collection's name should be translated to user's locale"
        (with-french-user-and-personal-collection user collection
          (is (= [{:name            "Collection personnelle de Taco Bell"
                   :id              (:id collection)
                   :description     nil
                   :model           "collection"
                   :authority_level nil
                   :entity_id       nil
                   :can_write       true}]
                 (->> (:data (mt/user-http-request user :get 200 "collection/root/items"))
                      (filter #(str/includes? (:name %) "Taco Bell"))))))))

    (testing "For admins, only return our own Personal Collection (!)"
      (is (= [{:name            "Crowberto Corv's Personal Collection"
               :id              (u/the-id (collection/user->personal-collection (mt/user->id :crowberto)))
               :description     nil
               :model           "collection"
               :authority_level nil
               :entity_id       nil
               :can_write       true}]
             (->> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                  (filter #(str/includes? (:name %) "Personal Collection")))))

      (testing "That includes sub-collections of Personal Collections! I shouldn't see them!"
        (mt/with-temp Collection [_ {:name     "Lucky's Sub-Collection"
                                     :location (collection/children-location
                                                (collection/user->personal-collection (mt/user->id :lucky)))}]
          (is (= [{:name            "Crowberto Corv's Personal Collection"
                   :id              (u/the-id (collection/user->personal-collection (mt/user->id :crowberto)))
                   :description     nil
                   :model           "collection"
                   :authority_level nil
                   :entity_id       nil
                   :can_write       true}]
                 (->> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                      (filter #(str/includes? (:name %) "Personal Collection")))))))

      (testing "Can we look for `archived` stuff with this endpoint?"
        (mt/with-temp Card [card {:name "Business Card", :archived true}]
          (is (= [{:name                "Business Card"
                   :description         nil
                   :collection_position nil
                   :display             "table"
                   :moderated_status    nil
                   :entity_id           nil
                   :model               "card"}]
                 (for [item (:data (mt/user-http-request :crowberto :get 200 "collection/root/items?archived=true"))]
                   (dissoc item :id)))))))))


;;; ----------------------------------- Effective Children, Ancestors, & Location ------------------------------------

(defn- api-get-root-collection-ancestors
  "Call the API with Rasta to fetch the 'Root' Collection and put the `:effective_` results in a nice format for the
  tests below."
  [& additional-get-params]
  (format-ancestors (mt/user-http-request :rasta :get 200 "collection/root")))

(defn- api-get-root-collection-children
  [& additional-get-params]
  (mt/boolean-ids-and-timestamps (:data (apply mt/user-http-request :rasta :get 200 "collection/root/items" additional-get-params))))

(defn- remove-non-test-collections [items]
  (filter (fn [{collection-name :name}]
            (or (str/includes? collection-name "Personal Collection")
                (#{"A" "B" "C" "D" "E" "F" "G"} collection-name)))
          items))

(deftest fetch-root-collection-items-test
  (testing "sanity check"
    (is (collection/user->personal-collection (mt/user->id :rasta))))
  (testing "GET /api/collection/root/items"
    (testing "Do top-level collections show up as children of the Root Collection?"
      (with-collection-hierarchy [a b c d e f g]
        (testing "ancestors"
          (is (= {:effective_ancestors []
                  :effective_location  nil}
                 (api-get-root-collection-ancestors))))
        (testing "children"
          (is (= (map collection-item ["A" "Rasta Toucan's Personal Collection"])
                 (remove-non-test-collections (api-get-root-collection-children)))))))

    (testing "...and collapsing children should work for the Root Collection as well"
      (with-collection-hierarchy [b d e f g]
        (testing "ancestors"
          (is (= {:effective_ancestors []
                  :effective_location  nil}
                 (api-get-root-collection-ancestors))))
        (testing "children"
          (is (= (map collection-item ["B" "D" "F" "Rasta Toucan's Personal Collection"])
                 (remove-non-test-collections (api-get-root-collection-children)))))))

    (testing "does `archived` work on Collections as well?"
      (with-collection-hierarchy [a b d e f g]
        (db/update! Collection (u/the-id a) :archived true)
        (testing "ancestors"
          (is (= {:effective_ancestors []
                  :effective_location  nil}
                 (api-get-root-collection-ancestors :archived true))))
        (testing "children"
          (is (= [(collection-item "A")]
                 (remove-non-test-collections (api-get-root-collection-children :archived true)))))))

    (testing "\n?namespace= parameter"
      (mt/with-temp* [Collection [{normal-id :id} {:name "Normal Collection"}]
                      Collection [{coins-id :id}  {:name "Coin Collection", :namespace "currency"}]]
        (perms/grant-collection-read-permissions! (perms-group/all-users) coins-id)
        (letfn [(collection-names [items]
                  (->> (:data items)
                       (filter #(and (= (:model %) "collection")
                                     (#{normal-id coins-id} (:id %))))
                       (map :name)))]
          (testing "should only show Collections in the 'default' namespace by default"
            (is (= ["Normal Collection"]
                   (collection-names (mt/user-http-request :rasta :get 200 "collection/root/items")))))

          (testing "By passing `:namespace` we should be able to see Collections in that `:namespace`"
            (testing "?namespace=currency"
              (is (= ["Coin Collection"]
                     (collection-names (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=currency")))))
            (testing "?namespace=stamps"
              (is (= []
                     (collection-names (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=stamps")))))))))))

(deftest root-collection-snippets-test
  (testing "GET /api/collection/root/items?namespace=snippets"
    (testing "\nNative query snippets should come back when fetching the items in the root Collection of the `:snippets` namespace"
      (mt/with-temp* [NativeQuerySnippet [{snippet-id :id}   {:name "My Snippet", :entity_id nil}]
                      NativeQuerySnippet [{snippet-id-2 :id} {:name "My Snippet 2", :entity_id nil}]
                      NativeQuerySnippet [{archived-id :id}  {:name "Archived Snippet", :archived true, :entity_id nil}]
                      Dashboard          [{dashboard-id :id} {:name "My Dashboard", :entity_id nil}]]
        (letfn [(only-test-items [results]
                  (if (sequential? results)
                    (filter #(#{["snippet" snippet-id]
                                ["snippet" snippet-id-2]
                                ["snippet" archived-id]
                                ["dashboard" dashboard-id]} ((juxt :model :id) %))
                            results)
                    results))
                (only-test-item-names [results]
                  (let [items (only-test-items results)]
                    (if (sequential? items)
                      (map :name items)
                      items)))]
          (is (= [{:id        snippet-id
                   :name      "My Snippet"
                   :entity_id nil
                   :model     "snippet"}
                  {:id        snippet-id-2
                   :name      "My Snippet 2"
                   :entity_id nil
                   :model     "snippet"}]
                 (only-test-items (:data (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=snippets")))))

          (testing "\nSnippets should not come back for the default namespace"
            (is (= ["My Dashboard"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))))))

          (testing "\nSnippets shouldn't be paginated, because FE is not ready for it yet and default pagination behavior is bad"
            (is (= ["My Snippet", "My Snippet 2"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=snippets&limit=1&offset=0"))))))

          (testing "\nShould be able to fetch archived Snippets"
            (is (= ["Archived Snippet"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200
                                                               "collection/root/items?namespace=snippets&archived=true"))))))

          (testing "\nShould be able to pass ?model=snippet, even though it makes no difference in this case"
            (is (= ["My Snippet", "My Snippet 2"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200
                                                               "collection/root/items?namespace=snippets&model=snippet")))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/collection                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-collection-test
  (testing "POST /api/collection"
    (testing "\ntest that we can create a new collection"
      (mt/with-model-cleanup [Collection]
        (is (= (merge
                (mt/object-defaults Collection)
                {:name              "Stamp Collection"
                 :slug              "stamp_collection"
                 :color             "#123456"
                 :archived          false
                 :location          "/"
                 :personal_owner_id nil})
               (-> (mt/user-http-request :crowberto :post 200 "collection"
                                         {:name "Stamp Collection", :color "#123456"})
                   (dissoc :id))))))

    (testing "\ntest that non-admins aren't allowed to create a collection in the root collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "collection"
                                     {:name "Stamp Collection", :color "#123456"})))))

    (testing "\nCan a non-admin user with Root Collection perms add a new collection to the Root Collection? (#8949)"
      (mt/with-model-cleanup [Collection]
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp* [PermissionsGroup           [group]
                          PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]]
            (perms/grant-collection-readwrite-permissions! group collection/root-collection)
            (is (= (merge
                    (mt/object-defaults Collection)
                    {:name     "Stamp Collection"
                     :color    "#123456"
                     :location "/"
                     :slug     "stamp_collection"})
                   (dissoc (mt/user-http-request :rasta :post 200 "collection"
                                                 {:name "Stamp Collection", :color "#123456"})
                           :id)))))))

    (testing "\nCan I create a Collection as a child of an existing collection?"
      (mt/with-model-cleanup [Collection]
        (with-collection-hierarchy [a c d]
          (is (= (merge
                  (mt/object-defaults Collection)
                  {:id          true
                   :name        "Trading Card Collection"
                   :slug        "trading_card_collection"
                   :description "Collection of basketball cards including limited-edition holographic Draymond Green"
                   :color       "#ABCDEF"
                   :location    "/A/C/D/"})
                 (-> (mt/user-http-request :crowberto :post 200 "collection"
                                           {:name        "Trading Card Collection"
                                            :color       "#ABCDEF"
                                            :description "Collection of basketball cards including limited-edition holographic Draymond Green"
                                            :parent_id   (u/the-id d)})
                     (update :location collection-test/location-path-ids->names)
                     (update :id integer?)))))))

    (testing "\nShould be able to create a Collection in a different namespace"
      (let [collection-name (mt/random-name)]
        (try
          (is (schema= {:name      (s/eq collection-name)
                        :namespace (s/eq "snippets")
                        s/Keyword  s/Any}
                       (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name       collection-name
                                              :color      "#f38630"
                                              :descrption "My SQL Snippets"
                                              :namespace  "snippets"})))
          (finally
            (db/delete! Collection :name collection-name)))))
    (testing "collection types"
      (mt/with-model-cleanup [Collection]
        (testing "Admins should be able to create with a type"
          (is (schema= {:description (s/eq nil)
                        :archived (s/eq false)
                        :slug (s/eq "foo")
                        :color (s/eq "#f38630")
                        :name (s/eq "foo")
                        :personal_owner_id (s/eq nil)
                        :authority_level (s/eq "official")
                        :id s/Int
                        :location  (s/eq "/")
                        :entity_id (s/maybe su/NanoIdString)
                        :namespace (s/eq nil)}
                       (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name "foo", :color "#f38630", :authority_level "official"})))
          (testing "But they have to be valid types"
            (mt/user-http-request :crowberto :post 400 "collection"
                                  {:name "foo", :color "#f38630", :authority_level "no-way-this-is-valid-type"})))
        (testing "Non-admins cannot create a collection with a type"
          (mt/user-http-request :rasta :post 403 "collection"
                                {:name "foo", :color "#f38630", :authority_level "official"}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUT /api/collection/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-collection-test
  (testing "PUT /api/collection/:id"
    (testing "test that we can update a collection"
      (mt/with-temp Collection [collection]
        (is (= (merge
                (mt/object-defaults Collection)
                {:id       (u/the-id collection)
                 :name     "My Beautiful Collection"
                 :slug     "my_beautiful_collection"
                 :color    "#ABCDEF"
                 :location "/"
                 :authority_level "official"
                 :parent_id nil})
               (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                     {:name "My Beautiful Collection", :color "#ABCDEF", :authority_level "official"})))))
    (testing "Admins can edit the type"
      (mt/with-temp Collection [collection]
        (is (= "official"
               (-> (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                         {:name "foo" :authority_level "official"})
                   :authority_level)))
        (is (= :official
               (db/select-one-field :authority_level Collection :id (u/the-id collection)))))
      (testing "But not for personal collections"
        (let [personal-coll (collection/user->personal-collection (mt/user->id :crowberto))]
          (mt/user-http-request :crowberto :put 403 (str "collection/" (u/the-id personal-coll))
                                {:authority_level "official"})
          (is (nil? (db/select-one-field :authority_level Collection :id (u/the-id personal-coll))))))
      (testing "And not for children of personal collections"
        (let [personal-coll (collection/user->personal-collection (mt/user->id :crowberto))]
          (mt/with-temp Collection [child-coll]
            (collection/move-collection! child-coll (collection/children-location personal-coll))
            (mt/user-http-request :crowberto :put 403 (str "collection/" (u/the-id child-coll))
                                  {:authority_level "official"})))))
    (testing "Non-admins get a 403 when editing the type"
      (mt/with-temp Collection [collection]
        (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                              {:name "foo" :authority_level "official"})))
    (testing "Non-admins patching without type is fine"
      (mt/with-temp Collection [collection {:name "whatever" :authority_level "official"}]
        (is (= "official"
               (-> (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id collection))
                                         {:name "foo"})
                   :authority_level)))))
    (testing "Admins can mark a tree as official"
      (mt/with-temp* [Collection [collection]
                      Collection [sub-collection]
                      Collection [sub-sub-collection]]
        (collection/move-collection! sub-collection (collection/children-location collection))
        (collection/move-collection! sub-sub-collection
                                     ;; needs updated path so reload
                                     (collection/children-location (Collection (:id sub-collection))))
        (is (= "official"
               (-> (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                         {:authority_level "official" :update_collection_tree_authority_level true})
                   :authority_level)))
        ;; descended and marked sub collections
        (is (= :official (db/select-one-field :authority_level Collection :id (:id sub-collection))))
        (is (= :official (db/select-one-field :authority_level Collection :id (:id sub-sub-collection))))
        (testing "Non-admins cannot apply types to the whole tree"
          (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                {:name "new name" :update_collection_tree_authority_level true})
          (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                {:name "new name" :authority_level nil :update_collection_tree_authority_level true}))))
    (testing "check that users without write perms aren't allowed to update a Collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                       {:name "My Beautiful Collection", :color "#ABCDEF"}))))))))

(deftest archive-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Archiving a collection should delete any alerts associated with questions in the collection"
      (mt/with-temp* [Collection            [{collection-id :id}]
                      Card                  [{card-id :id :as card} {:collection_id collection-id}]
                      Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                             :alert_first_only false
                                                             :creator_id       (mt/user->id :rasta)
                                                             :name             "Original Alert Name"}]

                      PulseCard             [_              {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id-1 :id} {:user_id          (mt/user->id :crowberto)
                                                             :pulse_channel_id pc-id}]
                      PulseChannelRecipient [{pcr-id-2 :id} {:user_id          (mt/user->id :rasta)
                                                             :pulse_channel_id pc-id}]]
        (mt/with-fake-inbox
          (mt/with-expected-messages 2
            (mt/user-http-request :crowberto :put 200 (str "collection/" collection-id)
                                  {:name "My Beautiful Collection", :color "#ABCDEF", :archived true}))
          (testing "emails"
            (is (= (merge (mt/email-to :crowberto {:subject "One of your alerts has stopped working",
                                                   :body    {"the question was archived by Crowberto Corv" true}})
                          (mt/email-to :rasta {:subject "One of your alerts has stopped working",
                                               :body    {"the question was archived by Crowberto Corv" true}}))
                   (mt/regex-email-bodies #"the question was archived by Crowberto Corv"))))
          (testing "Pulse"
            (is (= nil
                   (Pulse pulse-id)))))))

    (testing "I shouldn't be allowed to archive a Collection without proper perms"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                       {:archived true})))))

      (testing "Perms checking should be recursive as well..."
        ;; Create Collections A > B, and grant permissions for A. You should not be allowed to archive A because you
        ;; would also need perms for B
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp* [Collection [collection-a]
                          Collection [collection-b {:location (collection/children-location collection-a)}]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-a)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                         {:archived true})))))))))

(deftest move-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Can I *change* the `location` of a Collection? (i.e. move it into a different parent Collection)"
      (with-collection-hierarchy [a b e]
        (is (= (merge
                (mt/object-defaults Collection)
                {:id       true
                 :name     "E"
                 :slug     "e"
                 :color    "#ABCDEF"
                 :location "/A/B/"
                 :parent_id (u/the-id b)})
               (-> (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id e))
                                         {:parent_id (u/the-id b)})
                   (update :location collection-test/location-path-ids->names)
                   (update :id integer?))))))

    (testing "I shouldn't be allowed to move the Collection without proper perms."
      (testing "If I want to move A into B, I should need permissions for both A and B"
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp* [Collection [collection-a]
                          Collection [collection-b]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-a)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                         {:parent_id (u/the-id collection-b)}))))))

      (testing "Perms checking should be recursive as well..."
        (testing "Create A, B, and C; B is a child of A."
          (testing "Grant perms for A and B. Moving A into C should fail because we need perms for C"
            ;; (collections with readwrite perms marked below with a `*`)
            ;; A* -> B* ==> C -> A -> B
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp* [Collection [collection-a]
                              Collection [collection-b {:location (collection/children-location collection-a)}]
                              Collection [collection-c]]
                (doseq [collection [collection-a collection-b]]
                  (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)}))))))

          (testing "Grant perms for A and C. Moving A into C should fail because we need perms for B."
            ;; A* -> B  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp* [Collection [collection-a]
                              Collection [collection-b {:location (collection/children-location collection-a)}]
                              Collection [collection-c]]
                (doseq [collection [collection-a collection-c]]
                  (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)}))))))

          (testing "Grant perms for B and C. Moving A into C should fail because we need perms for A"
            ;; A -> B*  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp* [Collection [collection-a]
                              Collection [collection-b {:location (collection/children-location collection-a)}]
                              Collection [collection-c]]
                (doseq [collection [collection-b collection-c]]
                  (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)})))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          GET /api/collection/root|:id/timelines                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- timelines-request
  [collection include-events?]
  (if include-events?
    (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/timelines") :include "events")
    (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/timelines"))))

(defn- timeline-names [timelines]
  (->> timelines (map :name) set))

(defn- event-names [timelines]
  (->> timelines (mapcat :events) (map :name) set))

(deftest timelines-test
  (testing "GET /api/collection/root|id/timelines"
    (mt/with-temp* [Collection [coll-a {:name "Collection A"}]
                    Collection [coll-b {:name "Collection B"}]
                    Collection [coll-c {:name "Collection C"}]
                    Timeline [tl-a {:name          "Timeline A"
                                    :collection_id (u/the-id coll-a)}]
                    Timeline [tl-b {:name          "Timeline B"
                                    :collection_id (u/the-id coll-b)}]
                    Timeline [tl-b-old {:name          "Timeline B-old"
                                        :collection_id (u/the-id coll-b)
                                        :archived      true}]
                    Timeline [tl-c {:name          "Timeline C"
                                    :collection_id (u/the-id coll-c)}]
                    TimelineEvent [event-aa {:name        "event-aa"
                                             :timeline_id (u/the-id tl-a)}]
                    TimelineEvent [event-ab {:name        "event-ab"
                                             :timeline_id (u/the-id tl-a)}]
                    TimelineEvent [event-ba {:name        "event-ba"
                                             :timeline_id (u/the-id tl-b)}]
                    TimelineEvent [event-bb {:name        "event-bb"
                                             :timeline_id (u/the-id tl-b)
                                             :archived    true}]]
      (testing "Timelines in the collection of the card are returned"
        (is (= #{"Timeline A"}
               (timeline-names (timelines-request coll-a false)))))
      (testing "Timelines in the collection have a hydrated `:collection` key"
        (is (= #{(u/the-id coll-a)}
               (->> (timelines-request coll-a false)
                    (map #(get-in % [:collection :id]))
                    set))))
      (testing "check that `:can_write` key is hydrated"
        (is (every?
             #(contains? % :can_write)
             (map :collection (timelines-request coll-a false)))))
      (testing "Only un-archived timelines in the collection of the card are returned"
        (is (= #{"Timeline B"}
               (timeline-names (timelines-request coll-b false)))))
      (testing "Timelines have events when `include=events` is passed"
        (is (= #{"event-aa" "event-ab"}
               (event-names (timelines-request coll-a true)))))
      (testing "Timelines have only un-archived events when `include=events` is passed"
        (is (= #{"event-ba"}
               (event-names (timelines-request coll-b true)))))
      (testing "Timelines with no events have an empty list on `:events` when `include=events` is passed"
        (is (= '()
               (->> (timelines-request coll-c true) first :events)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            GET /api/collection/graph and PUT /api/collection/graph                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest graph-test
  (mt/with-temp* [Collection [{default-a :id}   {:location "/"}]
                  Collection [{default-ab :id}  {:location (format "/%d/" default-a)}]
                  Collection [{currency-a :id}  {:namespace "currency", :location "/"}]
                  Collection [{currency-ab :id} {:namespace "currency", :location (format "/%d/" currency-a)}]
                  PermissionsGroup [{group-id :id}]]
    (letfn [(nice-graph [graph]
              (let [id->alias {default-a   "Default A"
                               default-ab  "Default A -> B"
                               currency-a  "Currency A"
                               currency-ab "Currency A -> B"}]
                (transduce
                 identity
                 (fn
                   ([graph]
                    (-> (get-in graph [:groups group-id])
                        (select-keys (vals id->alias))))
                   ([graph [collection-id k]]
                    (graph.test/replace-collection-ids collection-id graph k)))
                 graph
                 id->alias)))]
      (doseq [collection [default-a default-ab currency-a currency-ab]]
        (perms/grant-collection-read-permissions! group-id collection))
      (testing "GET /api/collection/graph\n"
        (testing "Should be able to fetch the permissions graph for the default namespace"
          (is (= {"Default A" "read", "Default A -> B" "read"}
                 (nice-graph (mt/user-http-request :crowberto :get 200 "collection/graph")))))

        (testing "Should be able to fetch the permissions graph for a non-default namespace"
          (is (= {"Currency A" "read", "Currency A -> B" "read"}
                 (nice-graph (mt/user-http-request :crowberto :get 200 "collection/graph?namespace=currency")))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "collection/graph")))))

      (testing "PUT /api/collection/graph\n"
        (testing "Should be able to update the graph for the default namespace.\n"
          (testing "Should ignore updates to Collections outside of the namespace"
            (let [response (mt/user-http-request :crowberto :put 200 "collection/graph"
                                                 (assoc (graph/graph) :groups {group-id {default-ab :write, currency-ab :write}}))]
              (is (= {"Default A" "read", "Default A -> B" "write"}
                     (nice-graph response))))))

        (testing "Should be able to update the graph for a non-default namespace.\n"
          (testing "Should ignore updates to Collections outside of the namespace"
            (let [response (mt/user-http-request :crowberto :put 200 "collection/graph"
                                                 (assoc (graph/graph)
                                                        :groups {group-id {default-a :write, currency-a :write}}
                                                        :namespace :currency))]
              (is (= {"Currency A" "write", "Currency A -> B" "read"}
                     (nice-graph response))))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "collection/graph"
                                       (assoc (graph/graph)
                                              :groups {group-id {default-a :write, currency-a :write}}
                                              :namespace :currency)))))))))
