(ns hooks.honey-sql-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.test :refer :all]
   [hooks.honey-sql]))

(defn- findings [form-string]
  (let [acc (atom [])]
    (with-redefs [api/reg-finding! (fn [finding] (swap! acc conj finding))]
      (hooks.honey-sql/lint-in-subquery (api/parse-string form-string)))
    @acc))

(deftest flags-in-with-subquery-test
  (doseq [form ["(defn f [] [:in :id {:select [:id] :from [:collection]}])"
                "(defn f [] [:not-in :db_id {:select [:id] :from [:metabase_database]}])"
                "(defn f [] {:where [:and [:= :archived false] [:in :table_id {:select-distinct [:id] :from [:t]}]]})"
                "(defn f [] [:in :id {:union-all [{:select [:id] :from [:a]} {:select [:id] :from [:b]}]}])"
                "(def q {:where [:not [:in :id {:select [:field_id] :from [:fus]}]]})"]]
    (testing form
      (let [[finding :as all] (findings form)]
        (is (= 1 (count all)))
        (is (= :metabase/honeysql-in-subquery (:type finding)))
        (is (pos-int? (:row finding)))))))

(deftest does-not-flag-safe-forms-test
  (doseq [form ["(defn f [ids] [:in :id ids])"
                "(defn f [] [:in :id [:inline [1 2 3]]])"
                "(defn f [] [:in :id [1 2 3]])"
                "(defn f [] [:exists {:select [[[:inline 1]]] :from [:t] :where [:= :t.id :x.id]}])"
                "(defn f [subquery] [:in :id subquery])"
                "(defn f [] [:in :status [\"a\" \"b\"]])"
                "(defn f [] {:in {:select [:x]}})"]]
    (testing form
      (is (= [] (findings form))))))
