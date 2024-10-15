(ns hooks.metabase.metabot-v3.tools.interface-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.test :refer :all]
   [hooks.metabase.metabot-v3.tools.interface]))

(deftest ^:parallel deftool-test
  (let [node (-> '(metabot-v3.tools.interface/deftool ::say-hello
                    "Say hello to someone."
                    {:properties            {:name     {:type :string}
                                             :greeting {:type #{:string :null}}},
                     :required              [:name :greeting]
                     :additional-properties false}
                    [{who :name}]
                    (printf "Hello, %s!\n" who))
                 pr-str
                 api/parse-string)]
    (is (= '(do
              (clojure.core/defmethod metabase.metabot-v3.tools.interface/tool-definition ::say-hello
                [_tool-name]
                {:description "Say hello to someone."
                 :parameters {:properties {:name {:type :string}, :greeting {:type #{:string :null}}}
                              :additional-properties false,
                              :required [:name :greeting]}})
              (clojure.core/defmethod metabase.metabot-v3.tools.interface/invoke-tool ::say-hello
                [_tool-name {who :name}]
                (printf "Hello, %s!\n" who)))
           (-> {:node node}
               hooks.metabase.metabot-v3.tools.interface/deftool
               :node
               api/sexpr)))))
