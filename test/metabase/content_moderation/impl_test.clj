(ns metabase.content-moderation.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-moderation.impl]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment metabase.content-moderation.impl/keep-me)

(deftest ^:parallel hydrate-test
  (mt/with-temp [:model/Card card {}]
    (is (=? [nil
             {:id (u/the-id card)}]
            (t2/hydrate [nil card]
                        [:moderation_reviews :moderator_details])))))
