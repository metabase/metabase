(ns metabase.sync.metadata-sync.pages-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.metadata-sync.pages :as pages]))

(def ^:private tables
  "Tables in key order, each with a weight."
  [{:schema nil :name "loose" :weight 2}
   {:schema "a" :name "x" :weight 3}
   {:schema "a" :name "y" :weight 4}
   {:schema "b" :name "x" :weight 1}])

(defn- page-names [after limit]
  (-> (pages/page tables :weight after limit)
      (update :tables #(mapv (juxt :schema :name) %))))

(deftest ^:parallel page-test
  (testing "a page holds the first Tables whose weights fit in the limit"
    (is (= {:tables [[nil "loose"] ["a" "x"]] :more true} (page-names nil 5)))
    (is (= {:tables [[nil "loose"] ["a" "x"]] :more true} (page-names nil 8))))
  (testing "a page starts after the key it is given, and a nil schema is before every other"
    (is (= {:tables [["a" "x"] ["a" "y"]] :more true} (page-names [nil "loose"] 7)))
    (is (= {:tables [["b" "x"]] :more false} (page-names ["a" "y"] 7))))
  (testing "a key that no Table has starts after the place it would be at"
    (is (= {:tables [["a" "y"] ["b" "x"]] :more false} (page-names ["a" "xx"] 100))))
  (testing "a Table that is heavier than the limit is sent alone, so every page moves on"
    (is (= {:tables [[nil "loose"]] :more true} (page-names nil 1)))
    (is (= {:tables [["a" "y"]] :more true} (page-names ["a" "x"] 1))))
  (testing "everything fits"
    (is (= {:tables [[nil "loose"] ["a" "x"] ["a" "y"] ["b" "x"]] :more false} (page-names nil 10))))
  (testing "nothing is left"
    (is (= {:tables [] :more false} (page-names ["b" "x"] 10)))
    (is (= {:tables [] :more false} (pages/page [] :weight nil 10)))))

(deftest ^:parallel next-cursor-test
  (testing "while a kind has more, the next answer goes on after the last Table of this one"
    (is (= {:kind "objects" :key ["a" "x"]} (pages/next-cursor "objects" ["a" "x"] true))))
  (testing "a kind that is done is followed by the start of the next kind"
    (is (= {:kind "links"} (pages/next-cursor "objects" ["b" "x"] false)))
    (is (= {:kind "stats"} (pages/next-cursor "links" nil false))))
  (testing "after the last kind there is no next answer"
    (is (nil? (pages/next-cursor "stats" ["b" "x"] false)))))
