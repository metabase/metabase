(ns metabase.moderation-test
  (:require
   [clojure.test :refer :all]
   [metabase.moderation]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(comment metabase.moderation/keep-me)

(deftest hydrate-test
  (mt/with-temp [:model/Card card {}]
    (is (=? [nil
             {:id (u/the-id card)}]
            (t2/hydrate [nil card]
                        [:moderation_reviews :moderator_details])))))
