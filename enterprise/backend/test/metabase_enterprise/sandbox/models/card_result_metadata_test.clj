(ns metabase-enterprise.sandbox.models.card-result-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.sandbox :as sandboxes]
   [metabase.queries.models.card :as queries.card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- column
  [base-type]
  {:name "NAME" :display_name "Name" :base_type base-type :field_ref [:field "NAME" {:base-type base-type}]})

(defn- sandboxed-cards!
  "The ids of `n` new Cards with result metadata, each used by a Sandbox of a group of its own on the Venues Table."
  [n]
  (let [group-ids (t2/insert-returning-pks! :model/PermissionsGroup (for [i (range n)] {:name (str "sandbox card " i " " (random-uuid))}))
        card-ids  (t2/insert-returning-pks! :model/Card
                                            (for [i (range n)]
                                              (merge (mt/with-temp-defaults :model/Card)
                                                     {:name (str "sandbox card " i) :result_metadata [(column :type/Text)]})))]
    (sandboxes/create-sandboxes! (mapv (fn [group-id card-id] {:group_id group-id :table_id (mt/id :venues) :card_id card-id})
                                       group-ids card-ids))
    card-ids))

(defn- update-metadata!
  [card-ids base-type]
  (queries.card/update-cards! (mapv (fn [id] {:id id :result_metadata [(column base-type)]}) card-ids)))

(deftest update-result-metadata-statement-count-test
  (testing "Updating the result metadata of Cards that sandboxes use takes as many statements for many Cards as for few"
    (mt/with-premium-features #{:sandboxes}
      (mt/with-model-cleanup [:model/Sandbox :model/Card :model/PermissionsGroup]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [counted (fn [n]
                          (let [ids (sandboxed-cards! n)]
                            (t2/with-call-count [call-count]
                              (update-metadata! ids :type/Text)
                              (call-count))))]
            (counted 2)
            (is (= (counted 10) (counted 40)))))))))

(deftest update-result-metadata-refuses-one-violating-card-test
  (testing "Updating the result metadata of many Cards is refused, and writes nothing, when one violates a sandbox"
    (mt/with-premium-features #{:sandboxes}
      (mt/with-model-cleanup [:model/Sandbox :model/Card :model/PermissionsGroup]
        (mt/with-current-user (mt/user->id :crowberto)
          (let [[sandboxed] (sandboxed-cards! 1)
                [other-1 other-2] (t2/insert-returning-pks! :model/Card
                                                            (for [i (range 2)]
                                                              (merge (mt/with-temp-defaults :model/Card)
                                                                     {:name (str "plain " i) :result_metadata [(column :type/Text)]})))
                refusal   (fn [ids]
                            (try
                              (update-metadata! ids :type/Integer)
                              nil
                              (catch clojure.lang.ExceptionInfo e (ex-message e))))
                single    (refusal [sandboxed])]
            (is (re-find #"used for Sandboxing" single))
            (is (= single (refusal [other-1 sandboxed other-2])))
            (is (= #{:type/Text}
                   (into #{} (comp (mapcat identity) (map (comp keyword :base_type)))
                         (t2/select-fn-vec :result_metadata :model/Card :id [:in [sandboxed other-1 other-2]]))))))))))
