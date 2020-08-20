(ns metabase.models.params.chain-filter-test
  (:require [clojure.test :refer :all]
            [metabase.models.params.chain-filter :as chain-filter]
            [metabase.test :as mt]))

(defmacro ❤chain-filter❤ [field field->value & options]
  `(chain-filter/chain-filter
    (mt/id)
    (mt/$ids nil ~(symbol (str \% (name field))))
    (mt/$ids nil ~(into {} (for [[k v] field->value]
                             [(symbol (str \% k)) v])))
    ~@options))

(deftest chain-filter-test
  (testing "Show me expensive restaurants"
    (is (= ["Dal Rae Restaurant"
            "Lawry's The Prime Rib"
            "Pacific Dining Car - Santa Monica"
            "Sushi Nakazawa"
            "Sushi Yasuda"
            "Tanoshi Sushi & Sake Bar"]
           (❤chain-filter❤ venues.name {venues.price 4}))))
  (testing "Show me cheap Thai restaurants"
    (is (= ["Kinaree Thai Bistro" "Krua Siri"]
           (❤chain-filter❤ venues.name {venues.price 1, categories.name "Thai"}))))
  (testing "Show me the categories that have cheap restaurants"
    (is (= ["Asian" "BBQ" "Bakery" "Bar" "Burger" "Caribbean" "Deli" "Karaoke" "Mexican" "Pizza" "Southern" "Thai"]
           (❤chain-filter❤ categories.name {venues.price 1}))))
  (testing "Show me cheap restaurants with the word 'taco' in their name (case-insensitive)"
    (is (= ["Tacos Villa Corona" "Tito's Tacos"]
           (❤chain-filter❤ venues.name {venues.price 1, venues.name [:contains "tAcO" {:case-sensitive false}]}))))
  (testing "Show me the first 3 expensive restaurants"
    (is (= ["Dal Rae Restaurant" "Lawry's The Prime Rib" "Pacific Dining Car - Santa Monica"]
           (❤chain-filter❤ venues.name {venues.price 4} :limit 3))))
  (testing "Show me restaurants with price = 1 or 2 with the word 'BBQ' in their name (case-sensitive)"
    (is (= ["Baby Blues BBQ" "Beachwood BBQ & Brewing" "Bludso's BBQ"]
           (❤chain-filter❤ venues.name {venues.price #{1 2}, venues.name [:contains "BBQ"]}))))
  (testing "Oh yeah, we actually support arbitrary MBQL filter clauses. Neat!"
    (is (= ["Festa" "Fred 62"]
           (❤chain-filter❤ venues.name {venues.price [:between 2 3]
                                        venues.name  [:starts-with "f" {:case-sensitive false}]})))))
