(ns metabase-enterprise.serialization.init
  (:require
   [metabase-enterprise.serialization.metadata-file-import :as metadata-file-import]
   [metabase-enterprise.serialization.settings]))

(metadata-file-import/init!)
