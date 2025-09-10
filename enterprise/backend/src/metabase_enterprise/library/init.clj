(ns metabase-enterprise.library.init
  (:require
   [metabase-enterprise.library.core :as library]
   [metabase-enterprise.library.settings]))

(library/configure-source!)
