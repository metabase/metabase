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
  "Wrap `body` in sequence of `(with-temp..(binding..))` forms. Generate one wrapping for per one `card-count`.
  Purpose is to have [[lib.tu.gen/*available-card-ids*]] bound prior _execution_ of inner wrappers, so outer temporary
  cards can be used for generation of inner cards."
  [mp card-count & body]
  (if (< 0 card-count)
    (let [id-sym (gensym "card-id-")]
      `(mt/with-temp
         [:model/Card {~id-sym :id} {:type (tu.rng/rand-nth [:question :model])
                                     :dataset_query (random-card-query ~mp)}]
         ;; TODO: should `binding` go into `do-with-random-card`?
         (binding [lib.tu.gen/*available-card-ids* ((fnil conj []) lib.tu.gen/*available-card-ids* ~id-sym)]
           (with-random-cards ~mp ~(dec card-count) ~@body))))
    `(do ~@body)))

(comment

  (def mp (metabase.lib.metadata.jvm/application-database-metadata-provider (mt/id)))

  (-> '(with-random-cards mp 1 (+ 1 1))
      macroexpand-1)

  (-> '(with-random-cards mp 3 (+ 1 1))
      clojure.walk/macroexpand-all)
  )