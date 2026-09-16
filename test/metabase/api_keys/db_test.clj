(ns metabase.api-keys.db-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.db :as api-keys.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- last-used-at [api-key-id]
  (t2/select-one-fn :last_used_at :model/ApiKey :id api-key-id))

(defn- temp-key-opts []
  {::api-keys/unhashed-key (str "mb_" (mt/random-name))
   :name                   (mt/random-name)
   :user_id                (mt/user->id :crowberto)
   :creator_id             (mt/user->id :crowberto)
   :updated_by_id          (mt/user->id :crowberto)})

(defn- now
  "Truncated to microseconds to match real DB storage precision; H2 alone preserves nanoseconds."
  []
  (-> (t/instant) (t/truncate-to :micros) (t/offset-date-time (t/zone-offset 0))))

(deftest update-api-keys-last-used-at!-updates-available-keys-test
  (testing "nothing is skipped, and every key updates, when nothing else holds the rows"
    (mt/with-temp [:model/ApiKey {id-1 :id} (temp-key-opts)
                   :model/ApiKey {id-2 :id} (temp-key-opts)]
      (let [ts      (now)
            skipped (api-keys.db/update-api-keys-last-used-at! {id-1 ts, id-2 ts})]
        (is (= {} skipped))
        (is (= ts (last-used-at id-1)))
        (is (= ts (last-used-at id-2)))))))

(deftest update-api-keys-last-used-at!-skips-busy-keys-test
  (testing "a key the lock step excludes is skipped and returned to the caller; unrelated keys still update"
    (mt/with-temp [:model/ApiKey {available :id} (temp-key-opts)
                   :model/ApiKey {busy :id} (temp-key-opts)]
      (let [ts (now)]
        (mt/with-dynamic-fn-redefs [api-keys.db/lock-available-key-ids (fn [ids] (remove #{busy} ids))]
          (let [skipped (api-keys.db/update-api-keys-last-used-at! {available ts, busy ts})]
            (is (= {busy ts} skipped))
            (is (= ts (last-used-at available)))
            (is (nil? (last-used-at busy)))))))))
