(ns metabase.query-processor.named-stages-test
  "Query transformations that add or split stages keep each stage reading the stage it names."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.request.core :as request]))

(defn- field [column-name base-type & {:as opts}]
  [:field (merge {:lib/uuid (str (random-uuid)) :base-type base-type} opts) column-name])

(defn- clause [tag & args]
  (into [tag {:lib/uuid (str (random-uuid))}] args))

(defn- query
  "venues; per category, the venues' total price (an expression in a breakout stage, which `nest-expressions` splits);
  venues again, read by name after an unrelated stage; and that, joined to the per-category stage."
  []
  (lib/query
   meta/metadata-provider
   {:lib/type :mbql/query
    :database (meta/id)
    :stages   [{:lib/type :mbql.stage/mbql, :name "venues", :source-table (meta/id :venues)}
               {:lib/type    :mbql.stage/mbql
                :name        "per_category"
                :expressions [[:+ {:lib/uuid (str (random-uuid)), :lib/expression-name "price_plus"}
                               (field "PRICE" :type/Integer) 1]]
                :breakout    [(field "CATEGORY_ID" :type/Integer)]
                :aggregation [[:sum {:lib/uuid (str (random-uuid)), :name "total"}
                               [:expression {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "price_plus"]]]}
               {:lib/type :mbql.stage/mbql, :name "venues_again", :source-stage "venues"}
               {:lib/type :mbql.stage/mbql
                :joins    [{:lib/type     :mbql/join
                            :alias        "c"
                            :source-stage "per_category"
                            :fields       :all
                            :conditions   [(clause := (field "CATEGORY_ID" :type/Integer)
                                                   (field "CATEGORY_ID" :type/Integer :join-alias "c"))]}]}]}))

(deftest ^:parallel nest-expressions-keeps-stage-names-test
  (testing "a split stage reads what it read, and keeps the name later stages read it by"
    (let [nested (nest-query/nest-expressions (request/as-admin (qp.preprocess/preprocess (query))))]
      (is (= [["venues" nil] [nil nil] ["per_category" nil] ["venues_again" "venues"] [nil nil]]
             (mapv (juxt :name :source-stage) (:stages nested))))
      (is (= "per_category" (-> nested :stages last :joins first :source-stage))))))

(deftest ^:parallel implicit-fields-read-the-named-source-test
  (testing "a stage that reads an earlier stage by name gets that stage's columns as its implicit fields"
    (let [preprocessed (request/as-admin (qp.preprocess/preprocess (query)))]
      (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE" "c__CATEGORY_ID" "c__total"]
             (mapv :lib/desired-column-alias (lib/returned-columns preprocessed)))))))
