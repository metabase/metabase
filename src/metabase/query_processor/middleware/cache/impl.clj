(ns metabase.query-processor.middleware.cache.impl
  (:require
   [clojure.tools.logging :as log]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.util :as u])
  (:import
   (java.io ByteArrayOutputStream InputStream)))
