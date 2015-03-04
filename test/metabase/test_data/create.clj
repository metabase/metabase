(ns metabase.test-data.create
  "Helper functions for creating instances of various metabase models."
  (:require [metabase.db :refer :all]
            (metabase.models [user :refer [User]])
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [random-name]]))

(defn create-user
  "Create a new `User` with random names + password."
  []
  (let [first-name (random-name)
        last-name (random-name)
        email (.toLowerCase ^String (str first-name "@metabase.com"))
        password (random-name)]
    (ins metabase.models.user/User
      :first_name first-name
      :last_name last-name
      :email email
      :password password)))
