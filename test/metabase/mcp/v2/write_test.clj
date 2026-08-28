(ns metabase.mcp.v2.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.write :as v2.write]))

(deftest ^:parallel dispatch-write-test
  (let [entry {:create-required [:name]}]
    (testing "create enforces (create)-required fields"
      (is (= [:create {:name "X"}] (v2.write/dispatch-write entry {:method "create" :name "X"})))
      (is (thrown-with-msg? Exception #"`name` is required"
                            (v2.write/dispatch-write entry {:method "create"}))))
    (testing "update requires id"
      (is (= [:update 3 {:name "Y"}]
             (v2.write/dispatch-write entry {:method "update" :id 3 :name "Y"})))
      (is (thrown-with-msg? Exception #"`id` is required"
                            (v2.write/dispatch-write entry {:method "update"}))))
    (testing "an unknown method is a teaching error"
      (is (thrown-with-msg? Exception #"create.*update"
                            (v2.write/dispatch-write entry {:method "delete"}))))))

(deftest ^:parallel dispatch-write-clear-test
  (testing "GHY-4191: `clear` expands to explicit nils, the only way to say \"unset this\" — a null
            can't, since the boundary strips nulls that strict clients flood every property with"
    (let [entry {:create-required [:name] :clearable #{:description :cache_ttl}}]
      (testing "a cleared property arrives as a present nil, which the update paths read as \"set to nil\""
        (let [[_ _ args] (v2.write/dispatch-write entry {:method "update" :id 3 :clear ["description"]})]
          (is (contains? args :description))
          (is (nil? (:description args)))
          (is (not (contains? args :clear)))))
      (testing "clearing several at once, alongside an ordinary set"
        (is (= [:update 3 {:name "Y" :description nil :cache_ttl nil}]
               (v2.write/dispatch-write entry {:method "update" :id 3 :name "Y"
                                               :clear ["description" "cache_ttl"]}))))
      (testing "a property that isn't clearable is refused, and the message names what is"
        (is (thrown-with-msg? Exception #"`name` can't be cleared. This tool can clear: cache_ttl, description"
                              (v2.write/dispatch-write entry {:method "update" :id 3 :clear ["name"]}))))
      (testing "setting and clearing the same property in one call is a contradiction"
        (is (thrown-with-msg? Exception #"both set and cleared"
                              (v2.write/dispatch-write entry {:method "update" :id 3
                                                              :description "x" :clear ["description"]}))))
      (testing "clear is update-only — a new object has nothing set to clear"
        (is (thrown-with-msg? Exception #"applies to method \"update\" only"
                              (v2.write/dispatch-write entry {:method "create" :name "X"
                                                              :clear ["description"]}))))
      (testing "an empty or absent clear is a no-op, and never leaves :clear on the args"
        (is (= [:update 3 {:name "Y"}]
               (v2.write/dispatch-write entry {:method "update" :id 3 :name "Y" :clear []})))
        (is (= [:create {:name "X"}]
               (v2.write/dispatch-write entry {:method "create" :name "X" :clear []})))))
    (testing "a tool declaring nothing clearable says so rather than listing an empty set"
      (is (thrown-with-msg? Exception #"no clearable properties"
                            (v2.write/dispatch-write {:create-required []}
                                                     {:method "update" :id 3 :clear ["description"]}))))))
