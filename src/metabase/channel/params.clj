(ns metabase.channel.params
  (:require
   [clojure.string :as str]
   [metabase.driver.common.parameters :as params]
   [metabase.driver.common.parameters.parse :as params.parse]))

(defn- param-name->path
  [param-name]
  (->> (str/split param-name #"\.")
       (mapv keyword)))

(defn substitute-params
  "Substitute parameters in text with values from context.

  Params are specified using mustache syntax, e.g. {{param}}."
 ([text context]
  (substitute-params text context false))
 ([text context ignore-missing?]
  ;; NOTE: in case the syntax involves, consider using the mustache syntax and use stencil for substitution
  (let [components (params.parse/parse text)]
    (str/join ""
              (for [c components]
                (if (params/Param? c)
                  (or (get-in context (param-name->path (:k c)))
                      (when-not ignore-missing?
                        (throw (ex-info (str "Missing parameter: " (:k c)) {:param (:k c)}))))
                  c))))))

(comment
  (substitute-params "Hello {{user.email}}!" {:user {:email "ngoc@metabase.com"}}))
