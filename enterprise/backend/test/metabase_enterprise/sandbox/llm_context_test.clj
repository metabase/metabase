(ns metabase-enterprise.sandbox.llm-context-test
  "Tests that the LLM schema context respects sandboxing when it fetches fingerprint statistics."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.sandbox.llm-context-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.llm.context :as llm.context]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- row-restricting-query
  "A GTAP query that restricts rows (not columns) of `:categories`."
  []
  (let [mp       (mt/metadata-provider)
        table    (lib.metadata/table mp (mt/id :categories))
        id-field (lib.metadata/field mp (mt/id :categories :id))]
    (lib/filter (lib/query mp table) (lib/< id-field 3))))

(defn- column-restricting-query
  "A GTAP query that restricts `:categories` to only its `:id` column, so the resulting sandbox
   card's result_metadata -- and therefore sandbox-restricted-fields -- excludes every other column."
  []
  (mt/mbql-query categories
    {:fields [$id]}))

(defn- table-ddl
  "The DDL substring for `table-name` (unqualified) within a multi-table `ddl` string, whether or
   not the table is schema-qualified in the output (e.g. \"PUBLIC.CATEGORIES\")."
  [ddl table-name]
  (some (fn [chunk]
          (let [header (first (str/split-lines chunk))]
            (when (or (str/starts-with? header (str table-name " ("))
                      (str/includes? header (str "." table-name " (")))
              (str "CREATE TABLE " chunk))))
        (rest (str/split ddl #"CREATE TABLE "))))

(defn- column-comment
  "Returns the DDL comment line `ddl` carries for `col-name`, or nil if there isn't one."
  [ddl col-name]
  (->> (str/split-lines ddl)
       (partition 2 1)
       (some (fn [[comment-line col-line]]
               (when (and (str/includes? col-line (str " " col-name " "))
                          (str/starts-with? (str/triml comment-line) "--"))
                 comment-line)))))

(deftest schema-context-drops-fingerprints-only-for-sandboxed-table-test
  (testing "fingerprint dropping is decided per table: a sandboxed table's stats are omitted, but another
            accessible table in the same request keeps its stats"
    (met/with-gtaps! {:gtaps {:categories {:query (row-restricting-query)}}}
      ;; A freshly-sandboxed group only has :query-builder (not :query-builder-and-native) on the
      ;; sandboxed table, so it wouldn't pass fetch-accessible-tables' check at all without this --
      ;; see schema-context-sandbox-survives-native-regrant-test for why that's not a safe assumption
      ;; to build on.
      (perms/set-table-permission! &group (mt/id :categories) :perms/create-queries :query-builder-and-native)
      (perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :query-builder-and-native)
      (let [{:keys [ddl]} (llm.context/build-schema-context (mt/id) #{(mt/id :categories) (mt/id :venues)})
            categories-ddl (table-ddl ddl "CATEGORIES")
            venues-ddl     (table-ddl ddl "VENUES")]
        (testing "the sandboxed table's column loses fingerprint stats"
          (is (some? (column-comment categories-ddl "NAME")))
          (is (not (str/includes? (str (column-comment categories-ddl "NAME")) "distinct: "))))
        (testing "the unsandboxed table's column keeps fingerprint stats"
          (is (some? (column-comment venues-ddl "PRICE")))
          (is (str/includes? (str (column-comment venues-ddl "PRICE")) "range: ")))))))

(deftest schema-context-sandbox-survives-native-regrant-test
  (testing "granting native query access back to a sandboxed group doesn't lift the row restriction"
    (met/with-gtaps! {:gtaps {:categories {:query (row-restricting-query)}}}
      ;; Regrant native access to the SAME sandboxed group. Per enforce-sandbox?, the sandboxed group is
      ;; excluded from the groups checked for de-enforcement, so the sandbox stays enforced even though
      ;; the table now also passes the :query-builder-and-native check in fetch-accessible-tables.
      (perms/set-table-permission! &group (mt/id :categories) :perms/create-queries :query-builder-and-native)
      (let [{:keys [ddl]} (llm.context/build-schema-context (mt/id) #{(mt/id :categories)})
            categories-ddl (table-ddl ddl "CATEGORIES")]
        (testing "the table is now reachable"
          (is (some? categories-ddl)))
        (testing "but fingerprint stats are still withheld"
          (is (some? (column-comment categories-ddl "NAME")))
          (is (not (str/includes? (str (column-comment categories-ddl "NAME")) "distinct: "))))))))

(deftest schema-context-omits-sandbox-restricted-source-columns-test
  (testing "column-level sandbox restrictions apply to a requested table even when native access is regranted"
    (met/with-gtaps! {:gtaps {:categories {:query (column-restricting-query)}}}
      (perms/set-table-permission! &group (mt/id :categories) :perms/create-queries :query-builder-and-native)
      (let [{:keys [ddl tables]} (llm.context/build-schema-context (mt/id) #{(mt/id :categories)})
            categories-ddl     (table-ddl ddl "CATEGORIES")
            response-fields    (into #{} (map :name) (-> tables first :columns))
            lightweight-fields (into #{} (map :name)
                                     (-> (llm.context/get-tables-with-columns
                                          (mt/id) #{(mt/id :categories)})
                                         first
                                         :columns))]
        (testing "the DDL contains only the sandbox source card's columns"
          (is (str/includes? categories-ddl " ID "))
          (is (not (str/includes? categories-ddl " NAME "))))
        (testing "both structured metadata paths contain only allowed columns"
          (is (= #{"ID"} response-fields))
          (is (= #{"ID"} lightweight-fields)))))))

(deftest schema-context-fk-target-sandbox-restricted-field-omitted-test
  (testing "an FK target field hidden by column-level sandboxing is not named in the DDL"
    (met/with-gtaps! {:gtaps {:categories {:query (column-restricting-query)}}}
      (perms/set-table-permission! &group (mt/id :venues) :perms/create-queries :query-builder-and-native)
      (let [name-field-id (mt/id :categories :name)]
        (mt/with-temp-vals-in-db :model/Field (mt/id :venues :category_id) {:fk_target_field_id name-field-id}
          (let [{:keys [ddl]} (llm.context/build-schema-context (mt/id) #{(mt/id :venues)})]
            (is (not (str/includes? ddl "FK->CATEGORIES.NAME")))))))))
