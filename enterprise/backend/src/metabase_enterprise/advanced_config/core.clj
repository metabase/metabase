(ns metabase-enterprise.advanced-config.core
  "What other modules use of the config.yml loader: the per-section multimethods, the order the boot loader applies
  sections in, and the version check."
  (:require
   [metabase-enterprise.advanced-config.file]
   [metabase-enterprise.advanced-config.file.interface]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.advanced-config.file
  sort-by-initialization-order
  supported-version?]
 [metabase-enterprise.advanced-config.file.interface
  initialize-section!
  section-spec])
