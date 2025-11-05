#_:clj-kondo/ignore
(ns dev.mermaid
  (:require
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [metabase.util.json :as json]
   [metabase.util.jvm :as jvm]))

(defn mermaid-live-url [chart-text]
  (->> {:mermaid {:theme "dark"}
        :autoSync true
        :rough true
        ;; allow click:
        :securityLevel= "loose"
        :panZoom true
        :code chart-text
        :pan {:x 100 :y 100}}
       json/encode
       jvm/encode-base64
       (str "https://mermaid.live/edit#base64:")))

(defn open-mermaid-live! [chart-text]
  (sh/sh "open" (mermaid-live-url chart-text)))

(comment

  ;; todo figure out click
  (open-mermaid-live! "flowchart \n A --> B"))
