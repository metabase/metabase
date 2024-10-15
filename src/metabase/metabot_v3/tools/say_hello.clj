(ns metabase.metabot-v3.tools.say-hello
  (:require
   [metabase.metabot-v3.tools.interface :as metabot-v3.tools.interface]))

(metabot-v3.tools.interface/deftool :metabot-v3.tool/say-hello
  "Say hello to someone."
  {:properties            {:name     {:type :string}
                           :greeting {:type #{:string :null}}},
   :required              #{:name :greeting}
   :additional-properties false}
  [{who :name}]
  (format "Hello, %s!\n" who))
