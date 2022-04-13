(ns metabase-enterprise.core
  "Empty namespace. This is here solely so we can try to require it and see whether or not EE code is on the classpath.")

(metabase.public-settings.premium-features/defenterprise my-sum3
  "This is my docstring"
  :feature :embedding
  [x y]
  (+ x 100))

(my-sum3 1 2)
