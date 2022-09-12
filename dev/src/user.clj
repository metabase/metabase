(ns user)

(defn dev
  "Load and switch to the 'dev' namespace."
  []
  (require 'metabase.bootstrap)
  (require 'dev)
  (in-ns 'dev)
  :loaded)
