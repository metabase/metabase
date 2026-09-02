(ns metabase-enterprise.impersonation.llm-context-test
  "Tests that the LLM schema context respects connection impersonation when it fetches field values."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.api.common :as api]
   [metabase.llm.context :as llm.context]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-with-full-field-values!
  "Sets the full (unrestricted) FieldValues of `field-id` to `values` for the duration of `thunk`.
  Restores whatever sync left behind afterwards.

  Rows the body creates are left to `mt/with-model-cleanup`: describing a table fetches values for every
  list-eligible column, not just this one."
  [field-id values thunk]
  (let [existing (t2/select-one :model/FieldValues :field_id field-id :type :full)]
    (try
      (if existing
        (t2/update! :model/FieldValues (:id existing) {:values values, :last_used_at :%now})
        (t2/insert! :model/FieldValues {:field_id field-id, :type :full, :values values, :last_used_at :%now}))
      (thunk)
      (finally
        (when existing
          (t2/update! :model/FieldValues (:id existing) (select-keys existing [:values :last_used_at])))))))

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
      (mt/with-model-cleanup [:model/FieldValues]
        (let [field-id (mt/id :venues :price)]
          (mt/with-temp-vals-in-db :model/Field field-id {:has_field_values :list}
            ;; Stand in for values sync cached under the unrestricted default role. These sentinels cannot
            ;; come back from a query against the test warehouse, so seeing them in the DDL means the
            ;; unrestricted cache was handed to the LLM verbatim.
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
                   (let [per-role (t2/select-one-fn :values :model/FieldValues
                                                    :field_id field-id :type :advanced)]
                     (is (seq per-role)
                         "values are fetched and cached per impersonation role instead")
                     ;; Without this the test would still pass if the values were dropped rather than
                     ;; re-resolved, since the sentinel would be absent either way.
                     (is (str/includes? (str comment) (str (first per-role)))
                         "and those per-role values are the ones that reach the DDL"))))))))))))

(deftest schema-context-omits-fingerprints-for-impersonated-users-test
  (testing "fingerprint statistics describe every row, so an impersonated user gets none of them"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-model-cleanup [:model/FieldValues]
        (impersonation.util-test/with-impersonations!
          {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
           :attributes     {"impersonation_attr" "impersonation_role"}}
          (let [{:keys [ddl]} (llm.context/build-schema-context (mt/id) #{(mt/id :venues)})]
            (is (str/includes? ddl "CREATE TABLE")
                "the table itself is still described")
            (is (not (str/includes? ddl "range: "))
                "no numeric ranges from the unrestricted fingerprint")
            (is (not (str/includes? ddl "distinct: "))
                "no distinct counts from the unrestricted fingerprint")))))))

(deftest schema-context-skips-on-demand-fingerprinting-for-impersonated-users-test
  (testing "an impersonated user never triggers fingerprinting, whose result would be cached for everyone"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-model-cleanup [:model/FieldValues]
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
                    ;; Granted explicitly rather than relying on whatever All Users happens to hold: the
                    ;; table only reaches the LLM with native access, and other suites move that value.
                    (perms.test-util/with-restored-data-perms!
                      (data-perms/set-database-permission! (perms/all-users-group) (mt/id)
                                                           :perms/create-queries :query-builder-and-native)
                      (mt/with-test-user :rasta
                        (llm.context/build-schema-context (mt/id) #{(mt/id :venues)}))
                      (is (true? @superuser)))))))))))))

(defn- venues-field-ids []
  (t2/select-pks-vec :model/Field :table_id (mt/id :venues)))

(defn- advanced-value-rows
  "How many per-role FieldValues rows exist for the venues fields."
  []
  (t2/count :model/FieldValues :type :advanced :field_id [:in (venues-field-ids)]))

(deftest schema-context-caps-per-user-value-fetches-test
  (testing "a restricted user's value lookups are capped, so one request cannot spend the timeout on distinct-values"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-model-cleanup [:model/FieldValues]
        ;; Make the eligible columns explicit rather than relying on whatever sync left on venues, so the
        ;; cap always has at least two columns to choose between.
        (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:has_field_values :list}
          (mt/with-temp-vals-in-db :model/Field (mt/id :venues :name) {:has_field_values :list}
            (let [fetched-under-cap
                  (fn [cap]
                    ;; Scoped to venues: a blanket delete would clear cached values for every other field
                    ;; in the app-db, which `with-model-cleanup` cannot put back.
                    (t2/delete! :model/FieldValues :type :advanced :field_id [:in (venues-field-ids)])
                    ;; `max-restricted-field-values-fetches` holds a number, not a function, so
                    ;; `with-dynamic-fn-redefs` cannot bind it, and it is private so it has to be
                    ;; reached through the var.
                    (with-redefs-fn {#'llm.context/max-restricted-field-values-fetches cap}
                      (fn []
                        (impersonation.util-test/with-impersonations!
                          {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                           :attributes     {"impersonation_attr" "impersonation_role"}}
                          (llm.context/build-schema-context (mt/id) #{(mt/id :venues)}))))
                    (advanced-value-rows))]
              (is (< 1 (fetched-under-cap 20))
                  "venues has more than one list-eligible column, so the cap has something to bite on")
              (is (= 1 (fetched-under-cap 1))
                  "and past the cap a restricted column is left without sample values"))))))))

(deftest schema-context-withholds-shared-values-from-a-restricted-table-test
  (testing "a restricted table gets no values when the per-user cache hands back a shared row"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-model-cleanup [:model/FieldValues]
        (let [field-id (mt/id :venues :price)]
          (mt/with-temp-vals-in-db :model/Field field-id {:has_field_values :list}
            ;; Stand in for a `:sandboxes` token blip: the restriction check says restricted, but the
            ;; cache-key hash comes back trivial so the shared `:full` row is returned.
            (with-redefs-fn {#'params.field-values/get-or-create-field-values!
                             (fn [field]
                               (assoc (field-values/get-or-create-full-field-values! field) :type :full))}
              (fn []
                (impersonation.util-test/with-impersonations!
                  {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                   :attributes     {"impersonation_attr" "impersonation_role"}}
                  (let [{:keys [ddl]} (llm.context/build-schema-context (mt/id) #{(mt/id :venues)})]
                    ;; The column keeps its semantic-type hint; what it must not carry is the prices.
                    (is (not (re-find #"\d" (str (column-comment ddl "PRICE"))))
                        "no sample values, because the row was not resolved for this user")))))))))))
