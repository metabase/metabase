(ns metabase-enterprise.serialization.init
  (:require
   [metabase-enterprise.serialization.metadata-file-import :as metadata-file-import]))

(metadata-file-import/init!)
