(ns dev.malli
  (:require
   [clojure.java.shell :as sh]
   [malli.dot :as md]
   [metabase.util.malli.registry :as mr]
   [ring.util.codec :as codec]))

(defn- graphviz-visualizer
  [schema]
  (format "https://dreampuf.github.io/GraphvizOnline/?engine=dot#%s"
          (-> schema mr/resolve-schema md/transform codec/url-encode)))

(defn visualize-schema!
  "Given a schema, visualize it using Graphviz.
     (visualize-schema! [:map [:a :int] [:b :string]])
     (visualize-schema! ::my/schema)"
  [schema]
  (let [url (graphviz-visualizer schema)]
    (sh/sh "open" url)))
