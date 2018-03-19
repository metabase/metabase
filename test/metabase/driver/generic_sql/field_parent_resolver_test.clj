(ns metabase.driver.generic-sql.field-parent-resolver-test
  (:require [metabase.driver.generic-sql.field-parent-resolver :as r]
            [expectations :refer :all]))


; get qualified name for field without parents
(expect
  ["sku"]
  (r/get-qualified-name {:field-name "sku"}))


; get qualified name for field with one parent
(expect
  ["product" "sku"]
  (r/get-qualified-name {:field-name "sku" :parent {:field-name "product"}}))


; get qualified name for field with N parents
(expect
  ["cart" "product" "sku"]
  (r/get-qualified-name {:field-name "sku" :parent {:field-name "product" :parent {:field-name "cart"}}}))
