(ns metabase-enterprise.impersonation.llm-context-test
  "Tests that the LLM schema context respects connection impersonation when it fetches field values."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.api.common :as api]
   [metabase.llm.context :as llm.context]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-with-full-field-values!
  "Sets the full (unrestricted) FieldValues of `field-id` to `values` for the duration of `thunk`.
  Restores whatever sync left behind, and deletes any per-role FieldValues the body created."
  [field-id values thunk]
  (let [existing (t2/select-one :model/FieldValues 'field_id field-id 'type :full)]
    (try
      (if existing
        (t2/update! :model/FieldValues (:id existing) {'values values, 'last_used_at :%now})
        (t2/insert! :model/FieldValues {'field_id field-id, 'type :full, 'values values, 'last_used_at :%now}))
      (thunk)
      (finally
        (t2/delete! :model/FieldValues 'field_id field-id 'type :advanced)
        (if existing
          (t2/update! :model/FieldValues (:id existing) (select-keys existing [:values :last_used_at]))
          (t2/delete! :model/FieldValues 'field_id field-id 'type :full))))))

(defn- column-comment
  "Returns the DDL comment line `ddl` carries for `col-name`, or nil if there isn't one."
  [ddl col-name]
  (->> (str/split-lines ddl)
       (partition 2 1)
       (some (fn [[comment-line col-line]]
               (when (and (str/includes? col-line (str " " col-name " "))
                          (str/starts-with? (str/triml comment-line) "--"))
                 comment-line)))))

(deftest schema-context-field-values-respect-impersonation-test
  (testing "sample values in the LLM schema context come from the impersonated role, not the unrestricted cache"
    (mt/with-premium-features #{:advanced-permissions}
      (let [field-id (mt/id :venues :price)]
        (mt/with-temp-vals-in-db :model/Field field-id {:has_field_values :list}
          ;; Stand in for values sync cached under the unrestricted default role. These sentinels cannot come
          ;; back from a query against the test warehouse, so seeing them in the DDL means the unrestricted
          ;; cache was handed to the LLM verbatim.
          (do-with-full-field-values!
           field-id [-11 -22 -33]
           (fn []
             (impersonation.util-test/with-impersonations!
               {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                :attributes     {"impersonation_attr" "impersonation_role"}}
               (let [{:keys [ddl]} (llm.context/build-schema-context (mt/id) #{(mt/id :venues)})
                     comment       (column-comment ddl "PRICE")]
                 (is (some? comment)
                     "the price column gets a DDL comment with sample values")
                 (is (not (str/includes? (str comment) "-11"))
                     "values cached for the unrestricted role are not sent to the LLM")
                 (is (t2/exists? :model/FieldValues 'field_id field-id 'type :advanced)
                     "values are fetched and cached per impersonation role instead"))))))))))

(deftest schema-context-omits-fingerprints-for-impersonated-users-test
  (testing "fingerprint statistics describe every row, so an impersonated user gets none of them"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.util-test/with-impersonations!
        {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
         :attributes     {"impersonation_attr" "impersonation_role"}}
        (let [{:keys [ddl]} (llm.context/build-schema-context (mt/id) #{(mt/id :venues)})]
          (is (str/includes? ddl "CREATE TABLE")
              "the table itself is still described")
          (is (not (str/includes? ddl "range: "))
              "no numeric ranges from the unrestricted fingerprint")
          (is (not (str/includes? ddl "distinct: "))
              "no distinct counts from the unrestricted fingerprint"))))))

(deftest schema-context-skips-on-demand-fingerprinting-for-impersonated-users-test
  (testing "an impersonated user never triggers fingerprinting, whose result would be cached for everyone"
    (mt/with-premium-features #{:advanced-permissions}
      (let [field-id (mt/id :venues :price)
            calls    (atom [])]
        (mt/with-temp-vals-in-db :model/Field field-id {:fingerprint nil}
          (mt/with-dynamic-fn-redefs [sync/refingerprint-field! (fn [field]
                                                                  (swap! calls conj (:id field))
                                                                  {:updated-fingerprints 0})]
            (impersonation.util-test/with-impersonations!
              {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
               :attributes     {"impersonation_attr" "impersonation_role"}}
              (llm.context/build-schema-context (mt/id) #{(mt/id :venues)}))
            (is (= [] @calls))
            (testing "but an unrestricted user still gets on-demand fingerprinting, in an admin context"
              (let [superuser (atom ::not-called)]
                (mt/with-dynamic-fn-redefs [sync/refingerprint-field! (fn [_field]
                                                                        (reset! superuser api/*is-superuser?*)
                                                                        {:updated-fingerprints 0})]
                  (mt/with-test-user :rasta
                    (llm.context/build-schema-context (mt/id) #{(mt/id :venues)}))
                  (is (true? @superuser)))))))))))
