(ns metabase.domain-entities.converters
  (:require
    [camel-snake-kebab.core :as csk]
    [malli.core :as mc]
    [malli.transform :as mtx]))

(defn- decode-map [schema _]
  (let [drop-nil? (set (for [[map-key props val-schema] (mc/children schema)
                             :when (and (:optional props)
                                        (not (#{'nil? :nil} (mc/type val-schema))))]
                         map-key))]
    {:enter (fn [x]
              (cond
                (map? x)    x
                (object? x) (into {} (for [prop (js/Object.keys x)
                                           :let [js-val  (unchecked-get x prop)
                                                 map-key (csk/->kebab-case-keyword prop)]
                                           ;; If the value is nil, and it's both :optional and not a :maybe,
                                           ;; we just discard the value.
                                           :when (not (and (nil? js-val)
                                                           (drop-nil? map-key)))]
                                       [map-key js-val]))))
     :leave (fn [x]
              (if (map? x)
                x
                (throw (ex-info "decode-map leaving with a JS object not a CLJS map"
                                {:value  x
                                 :schema schema}))))}))

(defn- decode-map-of [keydec x]
  (cond
    (map? x)    x
    (object? x) (into {} (for [prop (js/Object.keys x)]
                           [(keydec prop) (unchecked-get x prop)]))))

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
                :map               {:compile decode-map}
                :map-of            {:compile (fn [schema _]
                                               (let [[key-schema] (mc/children schema)
                                                     keydec (mc/decoder key-schema js-transformer)]
                                                 {:enter #(decode-map-of keydec %)}))}}
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
