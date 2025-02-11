(ns metabase.revisions.impl.card-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.revisions.impl.card :as impl.card]
   [metabase.revisions.init]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment metabase.revisions.init/keep-me)

(deftest ^:parallel diff-cards-str-test
  (are [x y expected] (= expected
                         (u/build-sentence (revision/diff-strings :model/Card x y)))
    {:name        "Diff Test"
     :description nil}
    {:name        "Diff Test Changed"
     :description "foobar"}
    "added a description and renamed it from \"Diff Test\" to \"Diff Test Changed\"."

    {:name "Apple"}
    {:name "Next"}
    "renamed this Card from \"Apple\" to \"Next\"."

    {:display :table}
    {:display :pie}
    "changed the display from table to pie."

    {:name        "Diff Test"
     :description nil}
    {:name        "Diff Test changed"
     :description "New description"}
    "added a description and renamed it from \"Diff Test\" to \"Diff Test changed\"."))

(deftest ^:parallel diff-cards-str-update-collection--test
  (mt/with-temp
    [:model/Collection {coll-id-1 :id} {:name "Old collection"}
     :model/Collection {coll-id-2 :id} {:name "New collection"}]
    (are [x y expected] (= expected
                           (u/build-sentence (revision/diff-strings :model/Card x y)))

      {:name "Apple"}
      {:name          "Apple"
       :collection_id coll-id-2}
      "moved this Card to New collection."

      {:name        "Diff Test"
       :description nil}
      {:name        "Diff Test changed"
       :description "New description"}
      "added a description and renamed it from \"Diff Test\" to \"Diff Test changed\"."

      {:name          "Apple"
       :collection_id coll-id-1}
      {:name          "Apple"
       :collection_id coll-id-2}
      "moved this Card from Old collection to New collection.")))

(defn- create-card-revision!
  "Fetch the latest version of a Dashboard and save a revision entry for it. Returns the fetched Dashboard."
  [card-id is-creation?]
  (revision/push-revision!
   {:object       (t2/select-one :model/Card :id card-id)
    :entity       :model/Card
    :id           card-id
    :user-id      (mt/user->id :crowberto)
    :is-creation? is-creation?}))

(deftest record-revision-and-description-completeness-test
  (mt/with-temp
    [:model/Database   db   {:name "random db"}
     :model/Dashboard  dashboard {:name "dashboard"}
     :model/Card       base-card {}
     :model/Card       card {:name                "A Card"
                             :description         "An important card"
                             :collection_position 0
                             :cache_ttl           1000
                             :archived            false
                             :parameters          [{:name       "Category Name"
                                                    :slug       "category_name"
                                                    :id         "_CATEGORY_NAME_"
                                                    :type       "category"}]}
     :model/Collection coll {:name "A collection"}]
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (let [columns     (disj (set/difference (set (keys card)) @#'impl.card/excluded-columns-for-card-revision)
                              ;; we only record result metadata for models, so we'll test that seperately
                              :result_metadata)
            update-col  (fn [col value]
                          (cond
                            (= col :collection_id)     (:id coll)
                            (= col :parameters)        (cons {:name "Category ID"
                                                              :slug "category_id"
                                                              :id   "_CATEGORY_ID_"
                                                              :type "number"}
                                                             value)
                            (= col :display)           :pie
                            (= col :made_public_by_id) (mt/user->id :crowberto)
                            (= col :embedding_params)  {:category_name "locked"}
                            (= col :public_uuid)       (str (random-uuid))
                            (= col :table_id)          (mt/id :venues)
                            (= col :source_card_id)    (:id base-card)
                            (= col :database_id)       (:id db)
                            (= col :dashboard_id)      (:id dashboard)
                            (= col :query_type)        :native
                            (= col :type)              "model"
                            (= col :dataset_query)     (mt/mbql-query users)
                            (= col :visualization_settings) {:text "now it's a text card"}
                            (int? value)               (inc value)
                            (boolean? value)           (not value)
                            (string? value)            (str value "_changed")))]
        (doseq [col columns]
          (let [before  (select-keys card [col])
                changes {col (update-col col (get card col))}]
            ;; we'll automatically delete old revisions if we have more than [[revision/max-revisions]]
            ;; revisions for an instance, so let's clear everything to make it easier to test
            (t2/delete! :model/Revision :model "Card" :model_id (:id card))
            (t2/update! :model/Card (:id card) changes)
            (create-card-revision! (:id card) false)
            (testing (format "we should track when %s changes" col)
              (is (= 1 (t2/count :model/Revision :model "Card" :model_id (:id card)))))
            (when-not (#{;; these columns are expected to not have a description because it's always
                         ;; comes with a dataset_query changes
                         :table_id :database_id :query_type :source_card_id
                         ;; we don't need a description for made_public_by_id because whenever this field changes
                         ;; public_uuid will change and we have a description for it.
                         :made_public_by_id
                         ;; similarly, we don't need a description for `archived_directly` because whenever
                         ;; this field changes `archived` will also change and we have a description for that.
                         :archived_directly
                         ;; we don't expect a description for this column because it should never change
                         ;; once created by the migration
                         :dataset_query_metrics_v2_migration_backup} col)
              (testing (format "we should have a revision description for %s" col)
                (let [diff-strings (revision/diff-strings
                                    ;; TODO -- huh? Shouldn't this be testing against `:model/Card` here???
                                    :model/Dashboard
                                    before
                                    changes)]
                  (is (seq diff-strings))
                  (is (u/build-sentence diff-strings)))))))))))

(deftest record-revision-and-description-completeness-test-2
  ;; test tracking result_metadata for models
  (let [card-info (mt/card-with-source-metadata-for-query
                   (mt/mbql-query venues))]
    (mt/with-temp
      [:model/Card card card-info]
      (let [before  (select-keys card [:result_metadata])
            changes (update before :result_metadata drop-last)]
        (t2/update! :model/Card (:id card) changes)
        (create-card-revision! (:id card) false)

        (testing "we should track when :result_metadata changes on model"
          (is (= 1 (t2/count :model/Revision :model "Card" :model_id (:id card)))))

        (testing "we should have a revision description for :result_metadata on model"
          (is (some? (u/build-sentence
                      (revision/diff-strings
                       :model/Dashboard
                       before
                       changes)))))))))
