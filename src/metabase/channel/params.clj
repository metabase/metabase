(ns metabase.channel.params
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]))

(defn- param-name->path
  [param-name]
  (->> (str/split param-name #"\.")
       (mapv keyword)))

(defn substitute-params
  "Substitute parameters in text with values from context.

  Params are specified using handlebars syntax, e.g. {{param}}."
  [text context & {:keys [ignore-missing?]
                   :or   {ignore-missing? false}
                   :as   _opts}]
  ;; NOTE: in case the syntax involves, consider using the handlebars syntax and use stencil for substitution
  (let [components (lib/parse-parameters text)]
    (str/join ""
              (for [c components]
                (if (lib/parsed-param? c)
                  (or (get-in context (param-name->path (:k c)))
                      (when-not ignore-missing?
                        (throw (ex-info (str "Missing parameter: " (:k c)) {:param (:k c)}))))
                  c)))))

(comment
  (substitute-params "Hello {{user.email}}!" {:user {:email "ngoc@metabase.com"}}))
