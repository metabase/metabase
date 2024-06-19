(ns metabase-enterprise.query-validator.models.query-field
  "A join table connecting queries (both MBQL and native) with the Fields that are referenced within them."
  (:require
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.native-query-analyzer :as query-analyzer]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryField [_model] :query_field)

(doto :model/QueryField
  (derive :metabase/model))

;;; Updating QueryField from card

(defn- query-field-ids
  "Find out ids of all fields used in a query. Conforms to the same protocol as [[query-analyzer/field-ids-for-sql]],
  so returns `{:explicit #{...int ids}}` map.

  Does not track wildcards for queries rendered as tables afterwards."
  [query]
  (case (lib/normalized-query-type query)
    :native     (try
                  (query-analyzer/field-ids-for-sql query)
                  (catch Exception e
                    (log/error e "Error parsing SQL" query)))
    :query      {:explicit (mbql.u/referenced-field-ids query)}
    :mbql/query {:explicit (lib.util/referenced-field-ids query)}
    nil))

(defenterprise update-query-fields-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  If you're invoking this from a test, be sure to turn on [[*parse-queries-in-test?*]].

  Returns `nil` (and logs the error) if there was a parse error."
  :feature :query-validator
  [{card-id :id, query :dataset_query}]
  (try
    (let [{:keys [explicit implicit] :as res} (query-field-ids query)
          id->row                             (fn [explicit? field-id]
                                                {:card_id            card-id
                                                 :field_id           field-id
                                                 :explicit_reference explicit?})
          query-field-rows                    (concat
                                               (map (partial id->row true) explicit)
                                               (map (partial id->row false) implicit))]
      ;; when response is `nil`, it's a disabled parser, not unknown columns
      (when (some? res)
        (t2/with-transaction [_conn]
          (let [existing            (t2/select :model/QueryField :card_id card-id)
                {:keys [to-update
                        to-create
                        to-delete]} (u/row-diff existing query-field-rows
                                                {:id-fn      :field_id
                                                 :to-compare #(dissoc % :id :card_id :field_id)})]
            (when (seq to-delete)
              ;; this delete seems to break transaction (implicit commit or something) on MySQL, and this `diff`
              ;; algo drops its frequency by a lot - which should help with transactions affecting each other a
              ;; lot. Parallel tests in `metabase.models.query.permissions-test` were breaking when delete was
              ;; executed unconditionally on every query change.
              (t2/delete! :model/QueryField :card_id card-id :field_id [:in (map :field_id to-delete)]))
            (when (seq to-create)
              (t2/insert! :model/QueryField to-create))
            (doseq [item to-update]
              (t2/update! :model/QueryField {:card_id card-id :field_id (:field_id item)}
                          (select-keys item [:explicit_reference])))))))
    (catch Exception e
      (log/error e "Error updating query fields"))))
