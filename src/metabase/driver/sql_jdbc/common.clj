(ns metabase.driver.sql-jdbc.common
  (:require [clojure.string :as str]))

(defn handle-additional-options
  "If DETAILS contains an `:addtional-options` key, append those options to the connection string in CONNECTION-SPEC.
   (Some drivers like MySQL provide this details field to allow special behavior where needed).

   Optionally specify SEPERATOR-STYLE, which defaults to `:url` (e.g. `?a=1&b=2`). You may instead set it to
   `:semicolon` or `:comma`, which will separate different options with semicolons or commas instead (e.g. `;a=1;b=2`). (While most drivers
   require the former style, some require semicolon or even comma.)"
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
                                                       :comma     ","
                                                       :semicolon ";"
                                                       :url       (if (str/includes? connection-string "?")
                                                                    "&"
                                                                    "?"))
                                                     additional-options)))))))
