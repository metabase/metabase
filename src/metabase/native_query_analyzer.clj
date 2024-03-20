(ns metabase.native-query-analyzer
  "Integration with Macaw, which parses native SQL queries. All SQL-specific logic is in Macaw, the purpose of this
  namespace is to:

  1. Translate Metabase-isms into generic SQL that Macaw can understand.
  2. Contain Metabase-specific business logic."
  (:require
   [clojure.string :as str]
   [macaw.core :as mac]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   [net.sf.jsqlparser JSQLParserException]))

(def ^:dynamic *parse-queries-in-test?*
  "Normally, a native card's query is parsed on every create/update. For most tests, this is an unnecessary
  expense. Therefore, we skip parsing while testing unless this variable is turned on.

  c.f. [[active?]]"
  false)

(defn- active?
  "Should the query run? Either we're not testing or it's been explicitly turned on.

  c.f. [[*parse-queries-in-test?*]]"
  []
  (or (not config/is-test?)
      *parse-queries-in-test?*))

(defn- normalize-name
  ;; TODO: This is wildly naive and will be revisited once the rest of the plumbing is sorted out
  ;; c.f. Milestone 3 of the epic: https://github.com/metabase/metabase/issues/36911
  [name]
  (-> name
      (str/replace "\"" "")
      u/lower-case-en))

(defn- field-ids-for-query
  "Very naively selects the IDs of Fields that could be used in the query. Improvements to this are planned for Q2 2024,
  c.f. Milestone 3 of https://github.com/metabase/metabase/issues/36911"
  [q db-id]
  (try
    (let [{:keys [columns tables]} (mac/query->components (mac/parsed-query q))]
      (t2/select-pks-set :model/Field {:from [[(t2/table-name :model/Field) :f]]
                                       :join [[(t2/table-name :model/Table) :t] [:= :table_id :t.id]]
                                       :where [:and
                                               [:= :t.db_id db-id]
                                               (if (seq tables)
                                                 [:in :%lower.t/name (map normalize-name tables)]
                                                 true)
                                               (if (seq columns)
                                                 [:in :%lower.f/name (map normalize-name columns)]
                                                 true)]}))
    (catch JSQLParserException e
      (log/error e "Error parsing native query"))))

(defn- field-ids-for-card
  "Returns a list of field IDs that (may) be referenced in the given cards's query. Errs on the side of optimism:
  i.e., it may return fields that are *not* in the query, and is unlikely to fail to return fields that are in the
  query.

  Returns `nil` (and logs the error) if there was a parse error."
  [card]
  (let [{native-query :native
         db-id        :database} (:dataset_query card)]
    (field-ids-for-query (:query native-query) db-id)))

(defn update-query-fields-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  Any card is accepted, but this functionality only works for ones with a native query.

  If you're invoking this from a test, be sure to turn on [[*parse-queries-in-test?*]]."
  [{card-id :id, query :dataset_query :as card}]
  (when (and (active?)
             (= :native (:type query)))
    (let [query-field-records (map (fn [field-id] {:card_id  card-id :field_id field-id})
                                   (field-ids-for-card card))]
      ;; This feels inefficient at first glance, but the number of records should be quite small and doing some sort
      ;; of upsert-or-delete would involve comparisons in Clojure-land that are more expensive than just "killing and
      ;; filling" the records.
      (t2/with-transaction [_conn]
        (t2/delete! :model/QueryField :card_id card-id)
        (t2/insert! :model/QueryField query-field-records)))))
