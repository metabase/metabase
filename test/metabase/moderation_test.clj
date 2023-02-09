(ns metabase.moderation-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card]]
   [metabase.moderation]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(comment metabase.moderation/keep-me)

(deftest hydrate-test
  (t2.with-temp/with-temp [Card card {}]
    (is (=? [nil
             {:id (u/the-id card)}]
            (t2/hydrate [nil card]
                        [:moderation_reviews :moderator_details])))))
