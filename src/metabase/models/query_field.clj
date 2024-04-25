(ns metabase.models.query-field
  (:require
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.native-query-analyzer :as query-analyzer]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryField [_model] :query_field)

(doto :model/QueryField
  (derive :metabase/model))

;;; Updating QueryField from card

(defn- field-ids-for-mbql
  "Find out ids of all fields used in a query. Conforms to the same protocol as [[query-analyzer/field-ids-for-sql]],
  so returns `{:direct #{...int ids}}` map.

  Does not track wildcards for queries rendered as tables afterwards."
  [query]
  {:direct (mbql.u/referenced-field-ids query)})

(defn update-query-fields-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  Any card is accepted, but this functionality only works for ones with a native query.

  If you're invoking this from a test, be sure to turn on [[*parse-queries-in-test?*]].

  Returns `nil` (and logs the error) if there was a parse error."
  [{card-id :id, query :dataset_query}]
  (when query
    (try
      (let [{:keys [direct indirect] :as res} (case (:type query)
                                                :native (try
                                                          (query-analyzer/field-ids-for-sql query)
                                                          (catch Exception e
                                                            (log/error e "Error parsing SQL" query)))
                                                :query  (field-ids-for-mbql query)
                                                nil     nil)
            id->record                        (fn [direct? field-id]
                                                {:card_id          card-id
                                                 :field_id         field-id
                                                 :direct_reference direct?})
            query-field-records               (concat
                                               (map (partial id->record true) direct)
                                               (map (partial id->record false) indirect))]
        ;; when response is `nil`, it's a disabled parser, not unknown columns
        (when (some? res)
          (t2/with-transaction [_conn]
            (let [known             (t2/select-fn->fn :field_id identity :model/QueryField :card_id card-id)
                  {to-update :update
                   to-insert :insert
                   _to-skip  :skip} (group-by (fn [x]
                                                (cond
                                                  (not (contains? known (:field_id x))) :insert
                                                  (= (:direct_reference (known (:field_id x)))
                                                     (:direct_reference x))             :skip
                                                  :else                                 :update))
                                              query-field-records)
                  to-delete         (remove (comp (set (map :field_id query-field-records)) :field_id) (vals known))]
              (when (seq to-delete)
                ;; this delete seems to break transaction (implicit commit or something) on MySQL, and this algo drops
                ;; it's frequency by a lot - which should help with transactions affecting each other a lot. Parallel
                ;; tests in `metabase.models.query.permissions-test` were breaking when delete was executed
                ;; unconditionally on every query change.
                (t2/delete! :model/QueryField :card_id card-id :field_id [:in (map :field_id to-delete)]))
              (when (seq to-insert)
                (t2/insert! :model/QueryField to-insert))
              (doseq [item to-update]
                (t2/update! :model/QueryField {:card_id card-id :field_id (:field_id item)}
                            (select-keys item [:direct_reference])))))))
      (catch Exception e
        (log/error e "Error parsing native query")))))
