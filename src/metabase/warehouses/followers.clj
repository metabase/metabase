(ns metabase.warehouses.followers
  "The multimethod by which the models whose rows belong to a Database delete them as it is deleted. It lives apart
  from the Database model so that a model its namespace requires, such as Secret, can implement it.")

(defmulti delete-for-databases!
  "Delete the rows of `model` that belong to the Database rows `databases`, through the write functions of `model`, as
  [[metabase.warehouses.models.database/delete-databases!]] deletes those Databases."
  {:arglists '([model databases])}
  (fn [model _databases] model))
