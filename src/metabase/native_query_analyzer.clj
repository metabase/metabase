(ns metabase.native-query-analyzer
  "Integration with Macaw, which parses native SQL queries. All SQL-specific logic is in Macaw, the purpose of this
  namespace is to:

  1. Translate Metabase-isms into generic SQL that Macaw can understand.
  2. Contain Metabase-specific business logic."
  (:require
   [clojure.string :as str]
   [macaw.core :as mac]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- normalize-name
  ;; TODO: This is wildly naive and will be revisited once the rest of the plumbing is sorted out
  [name]
  (-> name
      (str/replace "\"" "")
      u/lower-case-en))

(defn- fields-for-query
  [q db-id]
  (let [{:keys [columns tables]} (-> q
                                     mac/parsed-query
                                     mac/query->components)]
    (t2/query {:select [[:f/id :field_id] [:f/name :column_name] [:t/name :table_name]]
               :from [[(t2/table-name :model/Field) :f]]
               :join [[(t2/table-name :model/Table) :t] [:= :table_id :t.id]]
               :where [:and
                       [:= :t.db_id db-id]
                       [:in :%lower.t/name (map normalize-name tables)]
                       [:in :%lower.f/name (map normalize-name columns)]]})))

(defn- fields-for-card
  "Returns a list of field objects that (may) be referenced in the given cards's query. Errs on the side of optimism:
  i.e., it may return fields that are *not* in the query, and is unlikely to fail to return fields that are in the
  query."
  [card]
  (let [{native-query :native
         db-id        :database} (:dataset_query card)]
    (fields-for-query (:query native-query) db-id)))

(defn- field-usages-for-card
  [{card-id :id :as card}]
  (map #(assoc % :card_id card-id) (fields-for-card card)))

(defn update-field-usages-for-card!
  "Ensures that all FieldUsages associated with this card are up to date with the query, creating or deleting them as necessary.

  Any card is accepted, but this functionality only works for ones with a native query."
  [{card-id :id, query :dataset_query :as card}]
  (when (= :native (:type query))
    ;; This feels inefficient, but the number of records should be quite small and doing some sort of upsert-or-delete
    ;; would involve comparisons in Clojure-land that are more expensive than just "killing and filling" the records.
    (t2/delete! :model/FieldUsage :card_id card-id)
    (t2/insert! :model/FieldUsage (field-usages-for-card card))))
