(ns metabase-enterprise.data-studio.api.seed-test
  "Tests for /api/ee/data-studio/seed endpoints (list, delete, permissions).
  Create/replace multipart is covered by seeds-test's domain-level tests + manual QA."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest list-seeds-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Seed _ {:name "zeta" :csv "a\n1" :csv_hash "x"}
                   :model/Seed _ {:name "alpha" :csv "a\n1" :csv_hash "x"}]
      (testing "data analysts can list; csv payload is excluded"
        (let [seeds (mt/user-http-request :crowberto :get 200 "ee/data-studio/seed")]
          (is (= ["alpha" "zeta"] (map :name seeds)))
          (is (not-any? :csv seeds))))
      (testing "regular users are rejected"
        (mt/user-http-request :rasta :get 403 "ee/data-studio/seed")))))

(deftest delete-seed-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Seed seed {:name "doomed" :csv "a\n1" :csv_hash "x"}]
      (mt/user-http-request :crowberto :delete 204 (str "ee/data-studio/seed/" (:id seed)))
      (is (nil? (t2/select-one :model/Seed :id (:id seed)))))))
