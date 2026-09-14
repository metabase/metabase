(ns metabase.util.malli.typescript-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli.typescript :as ts]))

(deftest ^:parallel facade-test
  (is (= "(string | number)[]"
         (ts/schema->ts [:vector [:or :string :int]])))
  (is (= "export type Example = string"
         (ts/generate-typescript-type "Example" :string)))
  (is (re-find #"export function identity\(value: string\): string;"
               (ts/fn->ts {:name 'example/identity
                           :arglists '([value])
                           :schema [:=> [:cat :string] :string]})))
  (is (re-find #"export const answer: number;"
               (ts/const->ts {:name 'example/answer
                              :schema :int})))
  (is (re-find #"export function untyped\(value: unknown\): unknown;"
               (ts/def->ts {:name 'example/untyped
                            :arglists '([value])}))))
