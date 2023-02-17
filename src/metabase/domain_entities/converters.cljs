(ns metabase.domain-entities.converters
  (:require
    [camel-snake-kebab.core :as csk]
    [malli.core :as mc]
    [malli.transform :as mtx]))

(defn- decode-map [x]
  (cond
    (map? x)    x
    (object? x) (into {} (for [prop (js/Object.keys x)]
                           [(csk/->kebab-case-keyword prop) (unchecked-get x prop)]))))

(defn- decode-map-of [keydec valdec x]
  (cond
    (map? x)    x
    (object? x) (into {} (for [prop (js/Object.keys x)]
                           [(keydec prop) (valdec (unchecked-get x prop))]))))

(defn- encode-map [x keyenc]
  (cond
    (object? x) x
    (map? x) (reduce-kv (fn [obj k v]
                          (unchecked-set obj (keyenc k) v)
                          obj)
                        #js {}
                        x)))

(def js-transformer
  "Malli transformer for converting JavaScript data to and from CLJS data.

  This is a bit more flexible than a JSON transformer. In particular, it normalizes the keys of `:map`
  schema objects to `:kebab-case-keywords`, and restores them to strings with the original spelling when
  converting back.

  **On keyword conversion**

  Note that `\"snake_case\"` is the default spelling we expect in the JS data.
  This can be overridden with the `{:js/prop \"correctSpelling\"}` property on the schema, eg.
  ```
  [:map
   [:camel-case {:js/prop \"camelCase\"} string?]
   [:kebab-case {:js/prop \"kebab-case\"} number?]
   [:snake-case [:enum \"foo\" \"bar\"]]]
  ```

  Observe that `:snake-case` does not need a `:js/prop` setting, since that is the default.

  **On `:map-of`**

  Note that `:map-of` is not `:map`. The spelling of the keys in a `:map-of` is not changed. If the key
  schema is `keyword?`, they will be converted to keywords and back, but with the original spelling.

  **On sequences**
  `:tuple`, `:vector` and `:sequential` all get transformed into CLJS vectors. When converting back to JS,
  they are JS arrays."
  (mtx/transformer
    {:name :js
     :decoders {:keyword           keyword
                'keyword?          keyword
                :qualified-keyword keyword
                :vector            {:enter vec}
                :sequential        {:enter vec}
                :tuple             {:enter vec}
                :map               {:enter decode-map}
                :map-of            {:compile (fn [schema _]
                                               (let [[key-s val-s] (mc/children schema)
                                                     keydec (mc/decoder key-s js-transformer)
                                                     valdec (mc/decoder val-s js-transformer)]
                                                 #(decode-map-of keydec valdec %)))}}
     :encoders {:keyword           name
                'keyword?          name
                :qualified-keyword #(str (namespace %) "/" (name %))
                :vector            {:leave clj->js}
                :sequential        {:leave clj->js}
                :tuple             {:leave clj->js}
                :map               {:compile
                                    (fn [schema _]
                                      (let [js-props (into {} (for [[k props] (mc/children schema)
                                                                    :when (:js/prop props)]
                                                                [k (:js/prop props)]))
                                            keyenc   (fn [k] (or (get js-props k)
                                                                 (csk/->snake_case_string k)))]
                                        {:leave #(encode-map % keyenc)}))}
                :map-of            {:leave #(encode-map % name)}}}))

(defn incoming
  "Returns a function for converting a JS value into CLJS data structures, based on a schema."
  [schema]
  ;; TODO This should be a mc/coercer that decodes and then validates, throwing if it doesn't match.
  ;; However, enabling that now breaks loads of tests that pass input data with lots of holes. The JS
  ;; tests (as opposed to TS) are particularly bad for this.
  ;; Don't forget the nested `mc/decoder` calls elsewhere in this file!
  (mc/decoder schema js-transformer))

(defn outgoing
  "Returns a function for converting a CLJS value back into a plain JS one, based on its schema."
  [schema]
  (mc/encoder schema js-transformer))
