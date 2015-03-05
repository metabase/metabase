(ns metabase.test-data.create
  "Helper functions for creating instances of various metabase models."
  (:require [medley.core :as medley]
            [metabase.db :refer :all]
            (metabase.models [user :refer [User]])
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [random-name]]))

(defn create-user
  "Create a new `User` with random names + password."
  [& {:as kwargs}]
  (let [first-name (random-name)
        defaults {:first_name first-name
                  :last_name (random-name)
                  :email (.toLowerCase ^String (str first-name "@metabase.com"))
                  :password (random-name)}]
    (->> (merge defaults kwargs)
         (medley/mapply ins User))))
