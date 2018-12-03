(ns metabase.driver.sql-jdbc.common
  (:require [clojure.string :as str]
            [metabase.util.honeysql-extensions :as hx]))

(defn escape-field-name
  "Escape dots in a field name so HoneySQL doesn't get confused and separate them. Returns a keyword."
  ^clojure.lang.Keyword [k]
  (keyword (hx/escape-dots (name k))))

(defn handle-additional-options
  "If DETAILS contains an `:addtional-options` key, append those options to the connection string in CONNECTION-SPEC.
   (Some drivers like MySQL provide this details field to allow special behavior where needed).

   Optionally specify SEPERATOR-STYLE, which defaults to `:url` (e.g. `?a=1&b=2`). You may instead set it to
   `:semicolon`, which will separate different options with semicolons instead (e.g. `;a=1;b=2`). (While most drivers
   require the former style, some require the latter.)"
  {:arglists '([connection-spec] [connection-spec details & {:keys [seperator-style]}])}
  ;; single arity provided for cases when `connection-spec` is built by applying simple transformations to `details`
  ([connection-spec]
   (handle-additional-options connection-spec connection-spec))
  ;; two-arity+options version provided for when `connection-spec` is being built up separately from `details` source
  ([{connection-string :subname, :as connection-spec} {additional-options :additional-options, :as details} & {:keys [seperator-style]
                                                                                                               :or   {seperator-style :url}}]
   (-> (dissoc connection-spec :additional-options)
       (assoc :subname (str connection-string (when (seq additional-options)
                                                (str (case seperator-style
                                                       :semicolon ";"
                                                       :url       (if (str/includes? connection-string "?")
                                                                    "&"
                                                                    "?"))
                                                     additional-options)))))))
