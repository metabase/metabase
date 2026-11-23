(ns metabase.util.embed-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.events.test-util :as events.tu]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- update-rows!
  "Apply `rows`, each the `:id` of a Card or Dashboard of `model` and its changes, through the model's write function."
  [model rows]
  (case model
    :model/Card      (card/update-cards! (mapv (fn [row-id] (assoc (dissoc (first rows) :id) :id row-id)) (mapv :id rows)))
    :model/Dashboard (dashboard/update-dashboards! (mapv (fn [row-id] (assoc (dissoc (first rows) :id) :id row-id)) (mapv :id rows)))))

(deftest maybe-populate-initially-published-at-test
  (let [now #t "2022-09-01T12:34:56Z"]
    (doseq [model [:model/Card :model/Dashboard]]
      (testing "should populate `initially_published_at` when a Card is inserted with enable_embedding true"
        (mt/with-temp [model card {:enable_embedding true}]
          (is (some? (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should keep `initially_published_at` value when a Card is inserted with one"
        (mt/with-temp [model card {:enable_embedding true :initially_published_at now}]
          (is (= (t/offset-date-time now) (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should populate `initially_published_at` when a Card's enable_embedding is changed to true"
        (mt/with-temp [model card {:enable_embedding false}]
          (is (nil? (:initially_published_at card)))
          (update-rows! model [{:id (u/the-id card) :enable_embedding true}])
          (is (some? (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should keep `initially_published_at` value when a Card's enable_embedding is changed to false"
        (mt/with-temp [model card {:enable_embedding true :initially_published_at now}]
          (is (some? (:initially_published_at card)))
          (update-rows! model [{:id (u/the-id card) :enable_embedding false}])
          (is (= (t/offset-date-time now) (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should keep `initially_published_at` value when `enable_embedding` is already set to true"
        (mt/with-temp [model card {:enable_embedding true :initially_published_at now}]
          (update-rows! model [{:id (u/the-id card) :enable_embedding true}])
          (is (= (t/offset-date-time now) (t2/select-one-fn :initially_published_at model :id (u/the-id card))))))
      (testing "should keep `initially_published_at` value when `enable_embedding` is already set to false"
        (mt/with-temp [model card {:enable_embedding false}]
          (is (nil? (:initially_published_at card)))
          (update-rows! model [{:id (u/the-id card) :enable_embedding false}])
          (is (nil? (t2/select-one-fn :initially_published_at model :id (u/the-id card)))))))))

(deftest update-of-other-column-fills-legacy-embedded-row-test
  (doseq [model [:model/Card :model/Dashboard]]
    (testing (str model " embedded and never published")
      (mt/with-temp [model {id :id} {:enable_embedding true}]
        (t2/update! model :id id {:initially_published_at nil})
        (testing "a plain update of another column fills it"
          (t2/update! model :id id {:description "Changed"})
          (is (some? (t2/select-one-fn :initially_published_at model :id id))))
        (t2/update! model :id id {:initially_published_at nil})
        (testing "an update through the write function fills it"
          (update-rows! model [{:id id :description "Changed again"}])
          (is (some? (t2/select-one-fn :initially_published_at model :id id))))))))

(deftest first-embedding-statement-counts-do-not-grow-with-rows-test
  (let [published #t "2022-09-01T12:34:56Z"]
    (doseq [model [:model/Card :model/Dashboard]]
      (testing (str model " rows of which some are already embedded")
        (mt/with-temp [model {a :id} {}
                       model {b :id} {}
                       model {c :id} {}
                       model {d :id} {}
                       model {e :id} {}
                       model {f :id} {}
                       model {g :id} {}]
          (let [counted (fn [ids]
                          (let [rows (mapv (fn [id] {:id id :name (str "Renamed " (count ids)) :enable_embedding true}) ids)]
                            (doseq [id ids]
                              (t2/update! model :id id {:enable_embedding false})
                              (t2/update! model :id id {:initially_published_at nil}))
                            (doseq [id (take-nth 2 ids)]
                              (t2/update! model :id id {:enable_embedding true})
                              (t2/update! model :id id {:initially_published_at published}))
                            (events.tu/statement-count! #(update-rows! model rows))))]
            (counted [g])
            (is (= (counted [a b]) (counted [a b c d e f])))
            (testing "rows embedded before keep their time and the others get the time of the write"
              (let [stored (t2/select-pk->fn :initially_published_at model :id [:in [a b c d e f]])]
                (is (= #{(t/offset-date-time published)} (set (map stored [a c e]))))
                (is (every? #(and (some? %) (not= (t/offset-date-time published) %)) (map stored [b d f])))))))))))
