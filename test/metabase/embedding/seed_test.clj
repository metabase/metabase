(ns metabase.embedding.seed-test
  (:require
   [clojure.test :refer :all]
   [metabase.embedding.seed :as embed.seed]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- seeded-themes []
  (t2/select :model/EmbeddingTheme {:order-by [[:name :asc]]}))

(deftest seed-default-embedding-themes-test
  (testing "seeds Light and Dark themes on first run"
    (mt/with-empty-h2-app-db!
      (embed.seed/seed-default-embedding-themes!)
      (let [themes (seeded-themes)]
        (is (= ["Dark" "Light"] (map :name themes)))
        (testing "each seeded theme carries the SDK color shape"
          (doseq [{:keys [settings]} themes]
            (is (map? (:colors settings)))
            (is (contains? (:colors settings) :brand))
            (is (contains? (:colors settings) :background))
            (is (= 8 (count (:charts (:colors settings)))))))))))

(deftest seed-is-a-no-op-after-first-run-test
  (testing "re-running the seed is a no-op once the seeded flag is set"
    (mt/with-empty-h2-app-db!
      (embed.seed/seed-default-embedding-themes!)
      (embed.seed/seed-default-embedding-themes!)
      (is (= 2 (count (seeded-themes)))))))

(deftest seed-preserves-admin-edits-test
  (testing "admin edits to a seeded theme are preserved when the seed re-runs"
    (mt/with-empty-h2-app-db!
      (embed.seed/seed-default-embedding-themes!)
      (let [light (t2/select-one :model/EmbeddingTheme :name "Light")]
        (t2/update! :model/EmbeddingTheme (:id light)
                    {:name     "Renamed"
                     :settings {:colors {:brand "#000000"}}})
        (embed.seed/seed-default-embedding-themes!)
        (let [after (t2/select-one :model/EmbeddingTheme :id (:id light))]
          (is (= "Renamed" (:name after)))
          (is (= {:colors {:brand "#000000"}} (:settings after))))))))

(deftest seed-preserves-deletions-test
  (testing "seed does not re-create a theme the admin has deleted"
    (mt/with-empty-h2-app-db!
      (embed.seed/seed-default-embedding-themes!)
      (t2/delete! :model/EmbeddingTheme :name "Dark")
      (embed.seed/seed-default-embedding-themes!)
      (is (= ["Light"] (map :name (seeded-themes)))))))

(deftest seed-applies-whitelabel-colors-test
  (testing "whitelabel application-colors override seeded SDK colors"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{:whitelabel}
        (mt/with-temporary-setting-values [application-colors {:brand   "#ff003b"
                                                               :accent0 "#111111"
                                                               :accent7 "#222222"}]
          (embed.seed/seed-default-embedding-themes!)
          (doseq [{:keys [settings]} (seeded-themes)]
            (is (= "#ff003b" (-> settings :colors :brand)))
            (is (= "#111111" (-> settings :colors :charts (nth 0))))
            (is (= "#222222" (-> settings :colors :charts (nth 7))))))))))
