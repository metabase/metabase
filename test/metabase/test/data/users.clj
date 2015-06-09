(ns metabase.test.data.users
  "Code related to creating / managing fake `Users` for testing purposes."
  (:require [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [user :refer [User]])
            [metabase.test.util :refer [random-name]]))

(defn create-user
  "Create a new `User` with random names + password."
  [& {:as kwargs}]
  (let [first-name (random-name)
        defaults {:first_name first-name
                  :last_name (random-name)
                  :email (.toLowerCase ^String (str first-name "@metabase.com"))
                  :password first-name}]
    (->> (merge defaults kwargs)
         (m/mapply ins User))))
