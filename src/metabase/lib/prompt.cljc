(ns metabase.lib.prompt
  "Resolve `:prompt` named arguments to an output spec the runner can send to an LLM."
  (:require
   #?(:clj [metabase.util.json :as json])
   [metabase.lib.schema.expression.string :as lib.schema.expression.string]
   [metabase.util.i18n :as i18n]))

(def named-arg-keys
  "Option keys written by named arguments (`name => value`) in a custom expression."
  lib.schema.expression.string/prompt-named-arg-keys)

(def return-type->output
  "Maps each `returnType` value to the JSON Schema and column type the runner uses."
  {:text     {:json-schema {"type" "string"}
              :base-type   :type/Text
              :json-text?  false}
   :integer  {:json-schema {"type" "integer"}
              :base-type   :type/BigInteger
              :json-text?  false}
   :float    {:json-schema {"type" "number"}
              :base-type   :type/Float
              :json-text?  false}
   :boolean  {:json-schema {"type" "boolean"}
              :base-type   :type/Boolean
              :json-text?  false}
   :date     {:json-schema {"type"        "string"
                            "format"      "date"
                            "description" "ISO 8601 date, YYYY-MM-DD"}
              :base-type   :type/Date
              :json-text?  false}
   :datetime {:json-schema {"type"        "string"
                            "format"      "date-time"
                            "description" "ISO 8601 date and time"}
              :base-type   :type/DateTime
              :json-text?  false}})

(defn- parse-json-schema
  [s]
  (try
    #?(:clj  (json/decode s)
       :cljs (js->clj (js/JSON.parse s)))
    (catch #?(:clj Throwable :cljs :default) _
      ::invalid-json)))

(defn- json-schema-output
  [schema]
  (let [type   (get schema "type")
        format (get schema "format")
        enum   (get schema "enum")]
    (cond
      (= type "integer") {:json-schema schema :base-type :type/BigInteger :json-text? false}
      (= type "number")  {:json-schema schema :base-type :type/Float :json-text? false}
      (= type "boolean") {:json-schema schema :base-type :type/Boolean :json-text? false}
      (= type "string")  (case format
                           "date"      {:json-schema schema :base-type :type/Date :json-text? false}
                           "date-time" {:json-schema schema :base-type :type/DateTime :json-text? false}
                           {:json-schema schema :base-type :type/Text :json-text? false})
      (and (nil? type)
           (sequential? enum)
           (seq enum)
           (every? string? enum))
      {:json-schema schema :base-type :type/Text :json-text? false}

      :else
      {:json-schema schema :base-type :type/Text :json-text? true})))

(defn prompt-output
  "Turn `:prompt` clause options into an output spec, or `{:error message}`.

  A spec is `{:json-schema <map> :base-type <isa type> :json-text? <bool>}`. The runner wraps
  `:json-schema` under `value` and writes the column as `:base-type`."
  [options]
  (let [return-type (some-> (:return-type options) keyword)
        json-schema (:json-schema options)]
    (cond
      (and return-type json-schema)
      {:error (i18n/tru "Use returnType or jsonSchema, not both")}

      json-schema
      (let [parsed (parse-json-schema json-schema)]
        (cond
          (= parsed ::invalid-json)
          {:error (i18n/tru "jsonSchema must be valid JSON")}

          (not (map? parsed))
          {:error (i18n/tru "jsonSchema must be a JSON object, like {0}" "{\"type\": \"integer\"}")}

          :else
          (json-schema-output parsed)))

      :else
      (get return-type->output (or return-type :text)))))
