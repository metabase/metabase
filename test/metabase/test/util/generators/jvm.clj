(ns metabase.test.util.generators.jvm
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.test-util.generators :as lib.tu.gen]
   [metabase.test :as mt]
   [metabase.test.util.random :as tu.rng]))

(defn random-card-query
  "Generate single random legacy query. For use in [[with-random-cards]]."
  [mp]
  (lib.convert/->legacy-MBQL (lib.tu.gen/random-query mp)))

(defmacro with-random-cards
  "Generate random cards (questions or models) and make those availble to caller through `&cards` anaphor.

  Wraps `body` in sequence of nesting `(with-temp..(binding..))` forms. Each for generates a temp card and adds it
  to [[lib.tu.gen/*available-cards*]] so this card can be used in generation of next card. Testing context is added
  inside of [[mt/with-temp]] call so cards are printed on failure."
  [mp card-count & body]
  (if (< 0 card-count)
    (let [card-sym (gensym "card-")]
      `(mt/with-temp
         [:model/Card ~card-sym {:type (tu.rng/rand-nth [:question :model])
                                 :dataset_query (random-card-query ~mp)}]
         (binding [lib.tu.gen/*available-cards* ((fnil conj []) lib.tu.gen/*available-cards*
                                                                (lib.metadata/card ~mp (:id ~card-sym)))]
           (with-random-cards ~mp ~(dec card-count) ~@body))))
    `(let [~(quote &cards) lib.tu.gen/*available-cards*]
       ~@body)))
