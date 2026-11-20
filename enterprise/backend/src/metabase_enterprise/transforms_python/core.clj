(ns metabase-enterprise.transforms-python.core
  "Core namespace for Python transforms functionality.
   Re-exports commonly used vars from internal namespaces."
  (:require
   [metabase-enterprise.transforms-python.write :as write]
   [potemkin :as p]))

(p/import-vars
 [write
  builtin-entity-id])
