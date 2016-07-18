(ns metabase.query-processor.sql-parameters
  ;; TODO - is it more appropriate to name this namespace something like `native-parameters` ?
  (:require [clojure.string :as s]
            [metabase.util :as u]))

;;; ------------------------------------------------------------ String Substituion ------------------------------------------------------------

(defprotocol ^:private ISQLParamSubstituion
  (^:private ->sql ^String [this]))

(extend-protocol ISQLParamSubstituion
  nil     (->sql [_] "NULL")
  Object  (->sql [this]
            (str this))
  Boolean (->sql [this]
            (if this "TRUE" "FALSE"))
  String  (->sql [this]
            (str \' (s/replace this #"'" "\\\\'") \')))

(defn- replace-param [s params match param]
  (let [k (keyword param)
        _ (assert (contains? params k)
            (format "Unable to substitute '%s': param not specified." param))
        v (->sql (k params))]
    (s/replace-first s match v)))

(defn- handle-simple [s params]
  (loop [s s, [[match param] & more] (re-seq #"\{\{\s*(\w+)\s*\}\}" s)]
    (if-not match
      s
      (recur (replace-param s params match param) more))))

(defn- handle-optional [s params]
  (try (handle-simple s params)
       (catch Throwable _
         "")))

(defn substitute
  "Replace PARAMS in SQL string. See parameterized SQL guide for more details. (TODO - Add link once we have the guide)

     (substitute \"SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}\"
       {:toucans_are_cool true})
     ; -> \"SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE\""
  {:style/indent 1}
  ^String [sql params]
  (loop [s sql, [[match optional] & more] (re-seq #"\[\[([^\]]+)\]\]" sql)]
    (if-not match
      (s/trim (handle-simple s params))
      (let [s (s/replace-first s match (handle-optional optional params))]
        (recur s more)))))


;;; ------------------------------------------------------------ Param Resolution ------------------------------------------------------------

{:database      213,
 :type          "native",
 :native        {:query "SELECT * \nFROM orders\nWHERE id = {{id}};"},
 :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true, :default "100"}},
 :parameters    [{:type "category", :target ["variable" ["template-tag" "id"]], :value "2"}],
 :constraints   {:max-results 10000, :max-results-bare-rows 2000},
 :info          {:executed-by 21, :uuid "a0286e10-465f-49b1-a51b-631d9c44615e", :query-hash -1098692062, :query-type "native"},
 :driver        {},
 :settings      {}}

(defn- param-value-for-tag [tag params]
  (let [target->param-value (u/key-by :target params)
        param-value         (target->param-value ["variable" ["template-tag" (:name tag)]])]
    (:value param-value)))

(defn- default-value-for-tag [{:keys [default display_name required]}]
  (or default
      (when required
        (throw (Exception. (format "'%s' is a required param." display_name))))))

(defn- value-for-tag [tag params]
  ;; TODO - need to parse tag based on type
  (or (param-value-for-tag tag params)
      (default-value-for-tag tag)))

(defn- query->params-map [{tags :template_tags, params :parameters}]
  (into {} (for [[k tag] tags]
             {k (value-for-tag tag params)})))


;;; ------------------------------------------------------------ Public API ------------------------------------------------------------

(defn expand-params [query]
  (println "NEED TO EXPAND:\n" (u/pprint-to-str 'magenta query)) ; NOCOMMIT
  (update-in query [:native :query] (u/rpartial substitute (query->params-map query))))
