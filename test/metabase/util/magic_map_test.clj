(ns metabase.util.magic-map-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase.util.magic-map :as magic-map]))

(deftest normalize-key-test
  (doseq [k-str  ["my-key" "my_key"]
          k-str  [k-str (str/upper-case k-str)]
          ns-str [nil "my-ns" "my_ns"]
          ns-str (if ns-str
                   [ns-str (str/upper-case ns-str)]
                   [ns-str])
          k      [k-str
                  (keyword ns-str k-str)]
          :let   [expected (cond
                             (string? k) "my-key"
                             ns-str      :my-ns/my-key
                             :else       :my-key)]]
    (testing (format "%s -> %s" (pr-str k) (pr-str expected))
      (is (= expected
             (magic-map/normalize-key k))))))

(deftest create-test
  (let [m (magic-map/magic-map {:snake/snake_case 1, "SCREAMING_SNAKE_CASE" 2, :lisp-case 3, :ANGRY/LISP-CASE 4})]
    (is (= (magic-map/magic-map {:snake/snake-case 1, "screaming-snake-case" 2, :lisp-case 3, :angry/lisp-case 4})
           m)))
  (testing "Should be able to create a map with varargs"
    (is (= {:db-id 1}
           (magic-map/magic-map :db_id 1)))
    (is (= {:db-id 1, :table-id 2}

           (magic-map/magic-map :db_id 1, :TABLE_ID 2))))
  (testing "Should preserve metadata"
    (is (= {:x 100}
           (meta (magic-map/magic-map (with-meta {} {:x 100}))))))
  (testing "Should be able to use #magic data reader"
    (let [m #magic {"snake_case" :wow}]
      (is (magic-map/magic-map? m))
      (is (= {"snake-case" :wow}
             m)))))

(deftest keys-test
  (testing "keys"
    (let [m #magic {:db_id 1, :table_id 2}]
      (testing "get keys"
        (testing "get"
          (is (= 1
                 (:db_id m)))
          (is (= 1
                 (:db-id m))))
        (is (= [:db-id :table-id]
               (keys m)))
        (testing "assoc"
          (is (= #magic {:db-id 2, :table-id 2}
                 (assoc m :db_id 2)))
          (is (= #magic {:db-id 3, :table-id 2}
                 (assoc m :db-id 3))))
        (testing "dissoc"
          (is (= {}
                 (dissoc (magic-map/magic-map "ScReAmInG_SnAkE_cAsE" 1) "screaming_snake_case"))))
        (testing "update"
          (is (= #magic {:db-id 2, :table-id 2}
                 (update m :db_id inc))))))))

(deftest equality-test
  (testing "Two maps created with different key cases should be equal"
    (= #magic {:db-id 1, :table-id 2}
       #magic {:db_id 1, :table_id 2}))
  (testing "should be equal to normal map with the same keys"
    (is (= {:db-id 1, :table-id 2}
           #magic {:db_id 1, :table_id 2}))
    (is (= {}
           #magic {}))))

(deftest meta-test
  (testing "Set and fetch metadata"
    (let [m (with-meta #magic {:table-id 1} {:a 100})]
      (is (= {:table-id 1}
             m))
      (is (= {:a 100}
             (meta m))))))

(deftest magic-map?-test
  (testing "Magic maps"
    (is (= true
           (magic-map/magic-map? #magic {:db_id 1}))))
  (testing "Not magic maps"
    (doseq [x [{} [] nil 100 (Object.) {:db_id 1}]]
      (testing (pr-str x)
        (is (= false
               (magic-map/magic-map? {})))))))

(deftest magical-mappify-test
  ;; TODO
  )
