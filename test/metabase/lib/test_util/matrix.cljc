(ns metabase.lib.test-util.matrix
  (:require
   [clojure.test :refer [deftest is]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-metadata.graph-provider :as meta.graph-provider]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]))

(defn- metadata-with-column-of-type
  [column-type]
  (let [test-column {:description nil
                     :lib/type :metadata/column
                     :database-is-auto-increment false
                     :fingerprint-version 5
                     :base-type column-type
                     :database-required false
                     :table-id 1
                     :name "TEST_ME"
                     :coercion-strategy nil
                     :settings nil
                     :caveats nil
                     :nfc-path nil
                     ;;:database-type "TIMESTAMP WITH TIME ZONE"
                     :effective-type column-type
                     :fk-target-field-id nil
                     :custom-position 0
                     :active true
                     :id 2
                     :parent-id nil
                     :points-of-interest nil
                     :visibility-type :normal
                     :display-name "Test Me"
                     :position 1
                     :has-field-values nil
                     :preview-display true
                     :database-position 1}]
    (assoc (assoc (dissoc meta/metadata :tables) :id 1)
           :tables
           [{:description nil,
             :schema "PUBLIC",
             :lib/type :metadata/table,
             :entity-type :entity/GenericTable,
             :db-id 1,
             :name "MATRIX",
             :initial-sync-status "complete",
             :caveats nil,
             :field-order :database,
             :show-in-getting-started false,
             :active true,
             :id 1 ,
             :points-of-interest nil,
             :visibility-type nil,
             :display-name "Matrix"
             :fields [{:description nil,
                       :lib/type :metadata/column,
                       :fingerprint-version 0,
                       :base-type :type/BigInteger,
                       :semantic-type :type/PK,
                       :database-required false,
                       :table-id 1,
                       :name "ID",
                       :coercion-strategy nil,
                       :settings nil,
                       :caveats nil,
                       :nfc-path nil,
                       :database-type "BIGINT",
                       :effective-type :type/BigInteger,
                       :fk-target-field-id nil,
                       :custom-position 0,
                       :active true,
                       :id 1,
                       :parent-id nil,
                       :points-of-interest nil,
                       :visibility-type :normal,
                       :display-name "ID",
                       :position 0,
                       :has-field-values :none,
                       :target nil,
                       :preview-display true,
                       :database-position 0,
                       :fingerprint nil}
                      test-column]}
            {:description nil,
             :schema "PUBLIC",
             :lib/type :metadata/table,
             :entity-type :entity/GenericTable,
             :db-id 1,
             :name "SUPPORT",
             :initial-sync-status "complete",
             :caveats nil,
             :field-order :database,
             :show-in-getting-started false,
             :active true,
             :id 10,
             :points-of-interest nil,
             :visibility-type nil,
             :display-name "Support"
             :fields [{:description nil,
                       :lib/type :metadata/column,
                       :fingerprint-version 0,
                       :base-type :type/BigInteger,
                       :semantic-type :type/PK,
                       :database-required false,
                       :table-id 10,
                       :name "ID",
                       :coercion-strategy nil,
                       :settings nil,
                       :caveats nil,
                       :nfc-path nil,
                       :database-type "BIGINT",
                       :effective-type :type/BigInteger,
                       :fk-target-field-id nil,
                       :custom-position 0,
                       :active true,
                       :id 10,
                       :parent-id nil,
                       :points-of-interest nil,
                       :visibility-type :normal,
                       :display-name "ID",
                       :position 0,
                       :has-field-values :none,
                       :target nil,
                       :preview-display true,
                       :database-position 0,
                       :fingerprint nil}
                      {:description nil
                       :lib/type :metadata/column
                       :database-is-auto-increment false
                       :fingerprint-version 5
                       :base-type :type/Integer
                       :semantic-type :type/FK
                       :database-required false
                       :table-id 10
                       :name "FK_ID"
                       :coercion-strategy nil
                       :settings nil
                       :caveats nil
                       :nfc-path nil
                       :database-type "INTEGER"
                       :effective-type :type/Integer
                       :fk-target-field-id 1
                       :custom-position 0
                       :active true
                       :id 20
                       :parent-id nil
                       :points-of-interest nil
                       :visibility-type :normal
                       :display-name "Foreign ID"
                       :position 1
                       :has-field-values nil
                       :preview-display true
                       :database-position 1
                       :fingerprint {:global {:distinct-count 200
                                              :nil% 0.0}}}]}])))

(defn test-queries
  "Produces test queries that will contain a column of the specified type.
   The queries are various ways that a database column could be manipulated to expose such a returned-column type.
   Returns a `[query desired-column-alias]` tuple such that `desired-column-alias` is the name of the visible-column that you can use along with `matrix/find-first` to find your column under test."
  [column-type]
  (let [mp (meta.graph-provider/->SimpleGraphMetadataProvider (metadata-with-column-of-type column-type))
        mock-cards (lib.tu/make-mock-cards mp [[:matrix 1]])
        mp (lib/composed-metadata-provider
            mp
            (providers.mock/mock-metadata-provider
             {:cards (vals mock-cards)}))
        table-meta (lib.metadata/table mp 1)
        field-meta (lib.metadata/field mp 2)
        queries [[(lib/query mp table-meta)
                  "TEST_ME"]
                 [(-> (lib/query mp table-meta)
                      (lib/append-stage)
                      (lib/append-stage))
                  "TEST_ME"]
                 [(-> (lib/query mp table-meta)
                      (lib/expression "expr" field-meta))
                  "expr"]
                 [(-> mp
                      (lib/query table-meta)
                      (lib/breakout field-meta))
                  "TEST_ME"]
                 [(-> mp
                      (lib/query table-meta)
                      (lib/breakout field-meta)
                      (lib/append-stage))
                  "TEST_ME"]
                 [(lib/query mp (lib.metadata/table mp 10))
                  "MATRIX__via__FK_ID__TEST_ME"]
                 [(-> (lib/query mp (lib.metadata/table mp 10))
                      (lib/join table-meta))
                  "Matrix - Foreign__TEST_ME"]
                 [(-> (lib/query mp table-meta)
                      (lib/join (lib/join-clause table-meta [(lib/= (lib.metadata/field mp 1) (lib.metadata/field mp 1))])))
                  "Matrix__TEST_ME"]
                 [(lib/query mp (:matrix mock-cards))
                  "TEST_ME"]
                 [(lib/query mp (:matrix/native mock-cards))
                  "TEST_ME"]]]
    queries))

(defn find-first
  "Finds the column with the matching `:lib/desired-column-alias`"
  [metadata-providerable desired columns]
  ;; [[lib/visible-columns]] no longer returns desired column alias (since it's a function of which columns get
  ;; returned), however I don't feel like completely reworking this test so I'm just going to add them here.
  (let [columns (into []
                      (lib.field.util/add-source-and-desired-aliases-xform metadata-providerable)
                      columns)]
    (or (m/find-first (comp #(= desired %) :lib/desired-column-alias) columns)
        (throw (ex-info "Failed to find column"
                        {:desired-column-alias desired, :found (map :lib/desired-column-alias columns)})))))

(deftest ^:parallel matrix-test-queries-test
  (doseq [[query desired] (test-queries :type/Text)]
    (is (find-first query desired (lib/visible-columns query)))))
