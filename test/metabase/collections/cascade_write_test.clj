(ns metabase.collections.cascade-write-test
  "What a Collection's writes imply for its descendants and contents, per the [[proof/cascade-write]] declarations."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.proof.core :as proof]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- derived-write
  [child-model collection-id operation changes]
  (proof/cascade-write child-model :model/Collection
                       (cond-> {:model :model/Collection, :operation operation, :subject collection-id}
                         changes (assoc :changes changes))))

(defn- subtree-rows
  "The subquery clause [[collection/contents-cascade-write]] keys content rows by, over the subtree of `collection-id`
  restricted by `collection-clauses`."
  [collection-id & collection-clauses]
  [:in :collection_id {:select [:id]
                       :from   [:collection]
                       :where  (into [:and [:or
                                            [:= :id collection-id]
                                            [:like :location (format "/%d/%%" collection-id)]]]
                                     collection-clauses)}])

(deftest cascade-write-test
  (let [op-1 (str (random-uuid))
        op-2 (str (random-uuid))]
   (mt/with-temp [:model/Collection {live :id} {}
                 :model/Collection {trashed :id} {:archive_operation_id op-1, :archived_directly true, :archived true}]
    (let [descendants (fn [id] [:like :location (format "/%d/%%" id)])]
      (testing "archiving a Collection"
        (let [changes {:archive_operation_id op-2, :archived_directly true, :archived true}]
          (is (= {:where   [:and (descendants live) [:not :archived]]
                  :changes {:archive_operation_id op-2, :archived_directly false, :archived true}}
                 (derived-write :model/Collection live :update changes))
              "marks its live descendants with the operation")
          (is (= {:where   [:and (subtree-rows live [:= :archive_operation_id op-2]) [:= :archived_directly false]]
                  :changes {:archived true}}
                 (derived-write :model/Card live :update changes))
              "archives the contents of the Collections in the operation, except those archived on their own")
          (is (= {:where   [:and (subtree-rows live [:= :archive_operation_id op-2])]
                  :changes {:archived true}}
                 (derived-write :model/Pulse live :update changes))
              "and the contents that have no state of their own outright")
          (is (= {:where   [:and (subtree-rows live [:= :type collection/library-data-collection-type])]
                  :changes {:collection_id nil, :is_published false}}
                 (derived-write :model/Table live :update changes))
              "and unpublishes the Tables of its Library data Collections")))
      (testing "unarchiving a Collection"
        (let [changes {:is_remote_synced false, :archive_operation_id nil, :archived_directly nil, :archived false}]
          (is (= {:where   [:and (descendants trashed) [:= :archive_operation_id op-1] [:not= :archived_directly true]]
                  :changes {:is_remote_synced false, :archive_operation_id nil, :archived_directly nil, :archived false}}
                 (derived-write :model/Collection trashed :update changes))
              "restores the descendants its operation marked, in place")
          (is (= {:where   [:and (descendants trashed) [:= :archive_operation_id op-1] [:not= :archived_directly true]]
                  :changes {:is_remote_synced     false
                            :archive_operation_id nil
                            :archived_directly    nil
                            :archived             false
                            :location             [:replace :location (format "/%d/" trashed) (format "/%d/%d/" live trashed)]}}
                 (derived-write :model/Collection trashed :update (assoc changes :location (format "/%d/" live))))
              "and moves them along when it is restored elsewhere")
          (is (= {:where   [:and (subtree-rows trashed [:= :archive_operation_id op-1]) [:= :archived_directly false]]
                  :changes {:archived false}}
                 (derived-write :model/Card trashed :update changes))
              "restores the contents its operation covered, keyed by the id the Collection's row still carries")
          (is (nil? (derived-write :model/Table trashed :update changes))
              "and republishes nothing")))
      (testing "moving a Collection"
        (let [changes {:location (format "/%d/" trashed), :is_remote_synced true}]
          (is (= {:where   (descendants live)
                  :changes {:is_remote_synced true
                            :location         [:replace :location (format "/%d/" live) (format "/%d/%d/" trashed live)]}}
                 (derived-write :model/Collection live :update changes))
              "rewrites its descendants' locations")
          (is (nil? (derived-write :model/Card live :update changes))
              "and leaves its contents where they are")))
      (testing "deleting a Collection"
        (is (= {:where (descendants live), :changes nil}
               (derived-write :model/Collection live :delete nil)))
        (is (= {:where [:and (subtree-rows live)], :changes nil}
               (derived-write :model/Card live :delete nil)))
        (is (= {:where   [:and (subtree-rows live)]
                :changes {:collection_id nil, :is_published false}}
               (derived-write :model/Table live :delete nil))
            "unpublishes every Table inside it"))
      (testing "any other write implies nothing for the children"
        (doseq [child [:model/Collection :model/Card :model/Pulse :model/Table]]
          (is (nil? (derived-write child live :update {:name "renamed", :description "x"})))))
      (testing "a Collection that does not exist implies nothing"
        (is (nil? (derived-write :model/Card Integer/MAX_VALUE :delete nil))))))))

(deftest cascade-from-the-real-proof-test
  (testing "a cascade from a Collection's proof carries the derived write and nothing else"
    (mt/with-temp [:model/Collection {id :id} {}]
      (let [archive (proof/test-only {:model     :model/Collection
                                      :operation :update
                                      :subject   id
                                      :changes   {:archive_operation_id "op", :archived_directly true, :archived true}})
            rename  (proof/test-only {:model :model/Collection, :operation :update, :subject id, :changes {:name "x"}})]
        (is (=? {:model :model/Card, :operation :update, :changes {:archived true}}
                (proof/verify (proof/cascade archive :model/Card)
                              {:model :model/Card, :operation :update, :subject-kind :where})))
        (is (nil? (proof/cascade rename :model/Card))
            "a rename cannot be turned into any write on the contents")))))

(deftest each-module-applies-its-own-cascade-test
  (testing "deleting a Collection reaches every content model through its own module, Documents included"
    (mt/with-temp [:model/Collection {id :id} {}
                   :model/Card       {card-id :id} {:collection_id id}
                   :model/Document   {document-id :id} {:collection_id id}]
      (is (= #{:model/Card :model/Dashboard :model/Document :model/Exploration :model/NativeQuerySnippet
               :model/Pulse :model/Table :model/TableUserSettings :model/Timeline}
             (disj (proof/cascade-children :model/Collection) :model/Collection)))
      (collection/delete-collection! (proof/test-only {:model :model/Collection, :operation :delete, :subject id}))
      (is (nil? (t2/select-one :model/Card :id card-id)))
      (is (nil? (t2/select-one :model/Document :id document-id))
          "a Document used to be left behind in the root, since the collections module kept its own list"))))
