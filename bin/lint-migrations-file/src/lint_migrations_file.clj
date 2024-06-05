(ns lint-migrations-file
  (:require
   [change-set.strict]
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.walk :as walk]))

(set! *warn-on-reflection* true)

(comment change-set.strict/keep-me)

;; just print ordered maps like normal maps.
(defmethod print-method flatland.ordered.map.OrderedMap
  [m writer]
  (print-method (into {} m) writer))

(s/def ::migrations
  (s/keys :req-un [::databaseChangeLog]))

;; ================================= Error handling =================================================================
;; When specs completely fail, the output is really painful. Instead of failing specs, let's conform all our inputs to
;; *either* the input (if valid) or an error (if it's not). This way we can print out the error message and details in
;; a more readable way.

;; An error looks like `{:error/message ...}`, optionally with an `:error/details` map.
;;
;; When writing validation specs in this namespace, you *can* use any normal spec, like `(s/def ::foo even?)`,
;; but preferably you'll instead write a function that returns an error in the invalid case, and use it like
;; ```
;; (s/def ::foo
;;  (or-error-conformer
;;   (fn [i]
;;    (when-not (even? i)
;;     (error "`i` is not even." :number-i i)))))
;; ```
;; This way, when the spec fails, the user sees nice errors like
(s/def :error/message string?)
(s/def :error/details (s/map-of keyword? any?))
(s/def ::error (s/keys :req [:error/message]
                       :opt [:error/details]))

(s/def :error/errors (s/coll-of ::error :kind vector? :min-count 1))
;; the input, so we can continue checking
(s/def :error/in any?)
(s/def ::errors (s/keys :req [:error/errors
                              :error/in]))

(defn- add-error [errors error]
  (update errors :errors conj error))

(defn- new-errors [input error]
  {:error/errors [error]
   :error/in input})

(defn- error?
  [x]
  (s/valid? ::error x))

(defn- errors?
  [xs]
  (s/valid? ::errors xs))

(defn- error
  "Make a new error"
  [message & details]
  {:error/message message
   :error/details (apply hash-map details)})

(defn- or-error-conformer
  "Takes a function `f` that returns either an `error` or an arbitrary value.

  Returns a function that conforms the input to either:
  - an `::errors` value, or
  - the input itself."
  [f]
  (s/conformer
   (fn [x]
     ;; in the error case, we continue checking specs against the *original* input
     (let [in (if (errors? x)
                (:error/in x)
                x)
           out (f in)]
       (cond
         ;; if we found an error and we already have errors, add the error to the existing errors
         (and (errors? x)
              (error? out))
         (add-error x out)

         ;; if we found an error and we don't already have errors, make a new `::errors`
         (error? out)
         (new-errors in out)

         ;; return the input (either `::errors` if we already had them or the value to check)
         :else x)))))

(defn- change-set-ids
  "Returns all the change set ids given a change-log."
  [change-log]
  (for [{{id :id} :changeSet} change-log
        :when id]
    id))

(s/def ::distinct-change-set-ids
  (or-error-conformer
   (fn [change-log]
     (let [ids (change-set-ids change-log)
           ;; can't apply distinct? with so many IDs
           duplicates (->> ids
                           (group-by identity)
                           (keep (fn [[k v]]
                                   (when (< 1 (count v))
                                     k))))]
       (when (seq duplicates)
         (error "Change set IDs are not distinct." :duplicates duplicates))))))

(s/def ::change-set-ids-in-order
  (or-error-conformer
   (fn [change-log]
     (when-let [out-of-order-ids (->> change-log
                                      (change-set-ids)
                                      (partition 2 1)
                                      (filter (fn [[id1 id2]]
                                                (pos? (compare id1 id2))))
                                      seq)]
       (error "Change set IDs are not in order"
              :out-of-order-ids out-of-order-ids)))))

(defn- check-change-use-types?
  "Return `true` if change use any type in `types`."
  [types change]
  {:pre [(set? types)]}
  (let [match-target-types? (fn [ttype]
                              (contains? types (str/lower-case ttype)))]
    (cond
     ;; a createTable or addColumn change; see if it adds a target-type col
     (or (:createTable change) (:addColumn change))
     (let [op (cond (:createTable change) :createTable (:addColumn change) :addColumn)]
       (some (fn [col-def]
               (match-target-types? (get-in col-def [:column :type] "")))
             (get-in change [op :columns])))

     ;; a modifyDataType change; see if it change a column to target-type
     (and (:modifyDataType change)
          (match-target-types? (get-in change [:modifyDataType :newDataType] "")))
     true)))

(defn- check-change-set-use-types?
  "Return true if `change-set` doesn't contain usage of any type in `types`."
  [target-types change-set]
  (some #(check-change-use-types? target-types %) (get-in change-set [:changeSet :changes])))

(defn- assert-no-types-in-change-log
  "Returns true if none of the changes in the change-log contain usage of any type specified in `target-types`.

  `id-filter-fn` is a function that takes an ID and return true if the changeset should be checked."
  ([target-types change-log]
   (assert-no-types-in-change-log target-types change-log (constantly true)))
  ([target-types change-log id-filter-fn]
   {:pre [(set? target-types)]}
   (when-let [using-types? (->> change-log
                                (filter (fn [change-set]
                                          (let [id (get-in change-set [:changeSet :id])]
                                            (and (string? id)
                                                 (id-filter-fn id)))))
                                (filter #(check-change-set-use-types? target-types %))
                                (map #(get-in % [:changeSet :id]))
                                seq)]
     (error (format "Migration(s) [%s] uses invalid types (in %s)"
                    (str/join "," (map #(str "'" % "'") using-types?))
                    (str/join "," (map #(str "'" % "'") target-types)))
            :invalid-ids using-types?
            :target-types target-types))))

(defn no-bare-blob-or-text-types?
  "Ensures that no \"text\" or \"blob\" type columns are added in any changesets."
  [change-log]
  (assert-no-types-in-change-log #{"blob" "text"} change-log))

(s/def ::no-bare-blob-or-text-types
  (or-error-conformer
   no-bare-blob-or-text-types?))

(defn no-bare-boolean-types?
  "Ensures that no \"boolean\" type columns are added in changesets with id later than v49.00-032. From that point on,
  \"${boolean.type}\" should be used instead, so that we can consistently use `BIT(1)` for Boolean columns on MySQL."
  [change-log]
  (assert-no-types-in-change-log #{"boolean"} change-log #(pos? (compare % "v49.00-032"))))

(s/def ::no-bare-boolean-types (or-error-conformer no-bare-boolean-types?))

(defn no-datetime-type?
  "Ensures that no \"datetime\" or \"timestamp without time zone\".
  From that point on, \"${timestamp_type}\" should be used instead, so that all of our time related columsn are tz-aware."
  [change-log]
  (assert-no-types-in-change-log
   #{"datetime" "timestamp" "timestamp without time zone"}
   change-log
   #(pos? (compare % "v49.00-000"))))

(s/def ::no-datetime-type (or-error-conformer no-datetime-type?))

(s/def ::changeSet
  (s/spec :change-set.strict/change-set))

(s/def ::databaseChangeLog
  (s/and (s/nonconforming
          (s/+ (s/alt :property              (s/keys :req-un [::property])
                      :objectQuotingStrategy (s/keys :req-un [::objectQuotingStrategy])
                      :changeSet             (s/keys :req-un [::changeSet]))))
         ::distinct-change-set-ids
         ::change-set-ids-in-order
         ::no-bare-blob-or-text-types
         ::no-bare-boolean-types
         ::no-datetime-type))

(defn- collect-errors [result]
  ;; there's probably a way prettier way to do this, but ... this works.
  (let [collector (atom [])]
    (walk/postwalk #(do
                      (when (error? %)
                        (swap! collector conj %))
                      %)
                   result)
    @collector))

(defn- validate-migrations [migrations]
  (let [result (s/conform ::migrations migrations)
        errors (collect-errors result)]
    (cond
      (seq errors)
      (throw (ex-info "Validation error"
                      {::errors errors}))

      (= ::s/invalid result)
      (let [data (s/explain-data ::migrations migrations)]
        (throw (ex-info (format "Validation failed: %s"
                                (with-out-str (pprint/pprint (mapv #(dissoc % :val)
                                                                   (::s/problems data)))))
                        (or (dissoc data ::s/value) {}))))))
  :ok)

(def ^:private filename
  "../../resources/migrations/001_update_migrations.yaml")

(defn- migrations []
  (let [file (io/file filename)]
    (assert (.exists file) (format "%s does not exist" filename))
    (letfn [(fix-vals [x]
                      ;; convert any lazy seqs to regular vectors and maps
                      (cond (map? x)        (update-vals x fix-vals)
                            (sequential? x) (mapv fix-vals x)
                            :else           x))]
      (fix-vals (yaml/parse-string (slurp file))))))

(defn- validate-all []
  (validate-migrations (migrations)))

(defn -main
  "Entry point for Clojure CLI task `lint-migrations-file`. Run it with

    ./bin/lint-migrations-file.sh"
  []
  (println "Check Liquibase migrations file...")
  (try
    (validate-all)
    (println "Ok.")
    (System/exit 0)
    (catch Throwable e
      (if-let [errors (::errors (ex-data e))]
        (doseq [error errors]
          (println)
          (printf "Error:\t%s\n" (:error/message error))
          (printf "Details:\n\n %s" (with-out-str (pprint/pprint (:error/details error))))
          (println))
        (do
          (pprint/pprint (Throwable->map e))
          (println (.getMessage e))))
      (System/exit 1))))
