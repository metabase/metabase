(ns metabase.lib.named-stages-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr]))

(defn- field [column-name base-type & {:as opts}]
  [:field (merge {:lib/uuid (str (random-uuid)) :base-type base-type} opts) column-name])

(defn- clause [tag & args]
  (into [tag {:lib/uuid (str (random-uuid))}] args))

(def ^:private stages
  "venues; cheap venues; the categories of venues; cheap venues joined to those categories."
  [{:lib/type :mbql.stage/mbql :name "venues" :source-table (meta/id :venues)}
   {:lib/type :mbql.stage/mbql :name "cheap"
    :filters  [(clause := (field "PRICE" :type/Integer) 1)]
    :fields   [(field "NAME" :type/Text) (field "CATEGORY_ID" :type/Integer)]}
   {:lib/type :mbql.stage/mbql :name "categories" :source-stage "venues"
    :breakout [(field "CATEGORY_ID" :type/Integer)]
    :aggregation [(clause :count)]}
   {:lib/type :mbql.stage/mbql :name "result" :source-stage "cheap"
    :joins    [{:lib/type   :mbql/join :alias "c" :source-stage "categories" :strategy :inner-join :fields :all
                :conditions [(clause := (field "CATEGORY_ID" :type/Integer)
                                     (field "CATEGORY_ID" :type/Integer :join-alias "c"))]}]}])

(defn- query []
  (lib/query meta/metadata-provider {:lib/type :mbql/query :database (meta/id) :stages stages}))

(deftest ^:parallel source-stage-number-test
  (let [q (query)]
    (testing "a stage reads the stage it names, or else the one before it"
      (is (= [nil 0 0 1] (mapv #(lib.util/source-stage-number q %) (range 4)))))
    (testing "a stage reads the columns of the stage it names"
      (is (= ["CATEGORY_ID" "count"] (mapv :lib/desired-column-alias (lib/returned-columns q 2)))))
    (testing "a join reads the columns of the stage it names"
      (is (= ["NAME" "CATEGORY_ID" "c__CATEGORY_ID" "c__count"]
             (mapv :lib/desired-column-alias (lib/returned-columns q 3)))))))

(deftest ^:parallel stage-name-validation-test
  (doseq [[problem invalid-stages] {"reads a later stage"     (assoc-in stages [1 :source-stage] "categories")
                                    "reads a missing stage"   (assoc-in stages [3 :joins 0 :source-stage] "nope")
                                    "two stages share a name" (assoc-in stages [2 :name] "cheap")}]
    (testing problem
      (is (not (mr/validate :metabase.lib.schema/stages invalid-stages))))))

(deftest ^:parallel expand-named-stages-test
  (testing "a tree: each join gets a copy of the stages it reads, and stages only joins read are dropped from the chain"
    (let [expanded (lib.util/expand-named-stages (query))]
      (is (= [nil nil nil] (mapv :name (:stages expanded))))
      (is (= 2 (count (-> expanded :stages last :joins first :stages))))
      (is (not-any? #(or (:name %) (:source-stage %)) (:stages expanded)))
      (is (mr/validate :metabase.lib.schema/query expanded)))))
