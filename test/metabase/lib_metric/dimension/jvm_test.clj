(ns metabase.lib-metric.dimension.jvm-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-metric.dimension.jvm :as dimension.jvm]
   [metabase.lib-metric.metadata.jvm :as lib-metric.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- enrich-columns-with-has-field-values ----------------------------------------

(deftest enrich-columns-with-has-field-values-test
  (testing "enriches columns that have field IDs with :has-field-values"
    (let [mp       (mt/metadata-provider)
          table    (lib.metadata/table mp (mt/id :venues))
          query    (lib/query mp table)
          columns  (lib/visible-columns query)
          enriched (dimension.jvm/enrich-columns-with-has-field-values columns)]
      (is (= (count columns) (count enriched))
          "should return same number of columns")
      (testing "columns with field IDs should have :has-field-values"
        (doseq [col enriched
                :when (pos-int? (:id col))]
          (is (contains? col :has-field-values)
              (str "column " (:name col) " should have :has-field-values"))
          (is (#{:list :search :none} (:has-field-values col))
              (str "column " (:name col) " should have a valid :has-field-values value"))))))
  (testing "returns empty collection unchanged"
    (is (= [] (dimension.jvm/enrich-columns-with-has-field-values [])))))

;;; ---------------------------------------- compute-dimension-pairs ----------------------------------------

(deftest compute-dimension-pairs-test
  (testing "computes dimension pairs from a metric query"
    (let [mp     (lib-metric.metadata.jvm/metadata-provider)
          table  (lib.metadata/table (mt/metadata-provider) (mt/id :venues))
          query  (-> (lib/query (mt/metadata-provider) table)
                     (lib/aggregate (lib/count)))
          pairs  (dimension.jvm/compute-dimension-pairs mp "owner" query)]
      (is (seq pairs) "should produce at least one dimension pair")
      (testing "each pair has :dimension and :mapping"
        (doseq [pair pairs]
          (is (contains? pair :dimension))
          (is (contains? pair :mapping))))
      (testing "dimensions have :has-field-values populated"
        (let [dims-with-hfv (filter #(get-in % [:dimension :has-field-values]) pairs)]
          (is (seq dims-with-hfv)
              "at least some dimensions should have :has-field-values")
          (doseq [pair dims-with-hfv]
            (is (#{:list :search :none} (get-in pair [:dimension :has-field-values]))
                (str "dimension " (get-in pair [:dimension :name])
                     " should have a valid :has-field-values value"))))))))

(deftest compute-dimension-pairs-native-sql-source-card-test
  (testing "source-card metrics built on native-SQL models resolve dimensions (UXW-3491)"
    ;; Native-SQL model cards have `:table_id nil` (there's no underlying table), so the
    ;; dimension-sync path must fall back to the card's `:database_id` to find a usable
    ;; db-specific MetadataProvider. Prior to the fix, compute-dimension-pairs returned
    ;; zero pairs for this shape because the metric-context provider can't resolve
    ;; `:metadata/card` requests.
    (mt/with-temp [:model/Card model {:type            :model
                                      :dataset_query   (mt/native-query
                                                        {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES"})
                                      :database_id     (mt/id)
                                      :result_metadata [{:name         "ID"
                                                         :display_name "ID"
                                                         :base_type    :type/BigInteger}
                                                        {:name         "NAME"
                                                         :display_name "Name"
                                                         :base_type    :type/Text}
                                                        {:name         "CATEGORY_ID"
                                                         :display_name "Category ID"
                                                         :base_type    :type/Integer}]}]
      (is (nil? (:table_id model))
          "sanity check: native-SQL model should have no :table_id")
      (let [mp        (lib-metric.metadata.jvm/metadata-provider)
            db-mp     (mt/metadata-provider)
            card-meta (lib.metadata/card db-mp (:id model))
            query     (-> (lib/query db-mp card-meta)
                          (lib/aggregate (lib/count)))
            pairs     (dimension.jvm/compute-dimension-pairs mp "owner" query)]
        (is (seq pairs)
            "should resolve dimensions from the card's result_metadata")
        (is (= #{"ID" "NAME" "CATEGORY_ID"}
               (into #{} (map #(get-in % [:dimension :name])) pairs))
            "dimension names should match the card's result_metadata columns")))))

(deftest compute-dimension-pairs-has-field-values-for-category-columns-test
  (testing "CATEGORY_ID dimension has :has-field-values populated"
    (let [mp     (lib-metric.metadata.jvm/metadata-provider)
          table  (lib.metadata/table (mt/metadata-provider) (mt/id :venues))
          query  (-> (lib/query (mt/metadata-provider) table)
                     (lib/aggregate (lib/count)))
          pairs  (dimension.jvm/compute-dimension-pairs mp "owner" query)
          cat-dim (first (filter #(= "CATEGORY_ID" (get-in % [:dimension :name])) pairs))]
      (is (some? cat-dim) "CATEGORY_ID dimension should exist")
      (is (some? (get-in cat-dim [:dimension :has-field-values]))
          "CATEGORY_ID should have :has-field-values"))))

(defn- self-joined-venues-query
  "An MBQL 5 query joining Venues to itself, so every Venues field is visible twice."
  []
  (let [mp        (mt/metadata-provider)
        venues    (lib.metadata/table mp (mt/id :venues))
        venues-id (lib.metadata/field mp (mt/id :venues :id))]
    (-> (lib/query mp venues)
        (lib/join (lib/join-clause venues
                                   [(lib/= venues-id
                                           (lib/with-join-alias venues-id "V2"))])))))

(deftest compute-dimension-pairs-self-joined-source-card-distinct-ids-test
  (testing "a model that joins the same table twice gets a distinct dimension id per column"
    ;; `dimension-id` derives the id from `[owner-key (field-ref->key target)]`, and `field-id-ref`
    ;; rewrites a source-card column's name-based ref to use the column's integer field id. A model
    ;; that self-joins a table surfaces each underlying field twice, and both copies carry the *same*
    ;; field id — the join alias that told them apart lives inside the model, not in the outer query's
    ;; refs. So both targets reduce to the same key and both dimensions get the same id.
    ;;
    ;; The visible symptom is that editing one dimension edits its twin: resolution is by id
    ;; (`dimensions-for-table`, `lib-metric.dimension/dimension`), so renaming PRICE also rewrites the
    ;; other columns to their second-copy values.
    (mt/with-temp [:model/Card model {:type          :model
                                      :dataset_query (self-joined-venues-query)}]
      (let [mp        (lib-metric.metadata.jvm/metadata-provider)
            db-mp     (mt/metadata-provider)
            card-meta (lib.metadata/card db-mp (:id model))
            query     (-> (lib/query db-mp card-meta)
                          (lib/aggregate (lib/count)))
            pairs     (dimension.jvm/compute-dimension-pairs mp "owner" query)
            field-ids (keep #(get-in % [:dimension :sources 0 :field-id]) pairs)]
        (testing "precondition: the self-join surfaces at least one field id twice"
          (is (seq (for [[field-id n] (frequencies field-ids)
                         :when       (> n 1)]
                     field-id))
              "the model's self-join should put two columns with the same field id in the dimension set"))
        (is (= (count pairs)
               (count (into #{} (map #(get-in % [:dimension :id])) pairs)))
            "every dimension should have its own id")))))
