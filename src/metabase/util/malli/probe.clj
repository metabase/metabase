(ns metabase.util.malli.probe
  (:require
   [clojure.string :as str]
   [malli.core :as mc]))

(set! *warn-on-reflection* true)

(def ^:private seen (atom #{}))

(defn- sketch [v depth]
  (cond
    (nil? v)        "nil"
    (keyword? v)    (str v)
    (string? v)     "String"
    (boolean? v)    "Boolean"
    (map? v)        (if (zero? depth)
                      "Map"
                      (str "{" (str/join ", " (for [[k x] (take 40 (sort-by str v))]
                                                (str (pr-str k) " " (sketch x (dec depth)))))
                           "}"))
    (sequential? v) (if (zero? depth)
                      "Seq"
                      (str "[" (str/join " | " (distinct (map #(sketch % (dec depth)) (take 5 v)))) "]"))
    (set? v)        (str "#{" (str/join " | " (distinct (map #(sketch % (max 0 (dec depth))) (take 5 v)))) "}")
    :else           (.getSimpleName (class v))))

(defn- schema-id [schema]
  (or (:probe/id (mc/properties schema))
      (let [s (str/replace (pr-str (mc/form schema)) #"\s+" " ")]
        (str "FORM:" (subs s 0 (min 250 (count s)))))))

(def ^:private seen-errors (atom #{}))

(defn log-error!
  "Logs a validation error once per fn and error shape; always returns true."
  [explanation context]
  (let [errors (:errors explanation)
        shape  (sort (distinct (map (fn [{:keys [in type]}] [(mapv #(if (keyword? %) % (if (string? %) % '_)) in) type]) errors)))
        dedup  [context shape]]
    (when-not (contains? @seen-errors dedup)
      (swap! seen-errors conj dedup)
      (let [s (str/replace (pr-str (take 6 (map (fn [{:keys [in type value]}] [in type (sketch value 1)]) errors))) #"\s+" " ")]
        (.println System/err (str "MBPROBE-ERR	" context "	" (subs s 0 (min 1500 (count s))))))))
  true)

(defn only-extra-keys?
  "Logs extra-key errors; true when every error of `explanation` is an extra key."
  [explanation context]
  (let [errors (:errors explanation)
        extra  (filter #(= ::mc/extra-key (:type %)) errors)
        only?  (and (seq errors) (= (count extra) (count errors)))]
    (doseq [{:keys [schema value in]} extra
            :let [k     (last in)
                  id    (schema-id schema)
                  sk    (sketch value 2)
                  dedup [id k (if (map? value) (sort (keys value)) (sketch value 0)) only?]]]
      (when-not (contains? @seen dedup)
        (swap! seen conj dedup)
        (.println System/err (str "MBPROBE\t" (if only? "ONLY" "MIXED") "\t" id "\t" (pr-str k) "\t" sk "\t" context))))
    (boolean only?)))
