(ns metabase.util.validated
  "A validated record is proof that its checks passed for exactly that record.

  Define the record next to the code that writes, with its checks:

    (defrecord RenameCard [user-id card-id title]
      validated/Validatable
      (checks [_]
        [[::title-not-blank (not (str/blank? title))]])
      (external-checks [_]
        [[::may-write-card (do (api/write-check :model/Card card-id) true)]]))

  A check reads the record's fields as locals, so a misspelled field does not compile.

  Validate where the request is parsed. Who is acting is a field, like anything else the checks read:

    (validated/validate (->RenameCard api/*current-user-id* 1 \"New\"))

  The write takes the record and nothing else, and reads what it writes out of it:

    (defn rename-card! [rename]
      (let [^RenameCard rename (validated/validated RenameCard rename)]
        (t2/update! :model/Card (.-card-id rename) {:name (.-title rename)})))

  Read fields with `.-` on a hinted local, not with keywords: a misspelled field is then a reflection warning, which
  the linters fail on, where a misspelled keyword is a silent nil.

  [[validate]] returns the record it was given, and remembers that it did. [[validated]] refuses any record it does not
  remember: one built with the constructor, or one made by `assoc` on a validated record."
  (:require
   [metabase.util.i18n :refer [tru]])
  (:import
   (com.google.common.collect MapMaker)
   (java.util Map)))

(set! *warn-on-reflection* true)

(defprotocol Validatable
  "A record that can be validated. Each method runs its checks, in order, and returns a vector of
  `[check-name result]`. A check passes when its result is exactly `true`. Anything else is the failure, reported
  under its name. Exceptions propagate, so an external check can throw the 403 or 404 that an existing permission
  check already throws."
  (checks [record]
    "Checks that read only the record.")
  (external-checks [record]
    "Checks that read the world, such as permissions. [[validate]] calls this only when every check passed, so these
    never see a malformed record."))

;; Every record [[validate]] returned, by identity: Guava's weak keys compare with `identical?`, not `=`, so an equal
;; record built by hand is not in here. A secret in a field or in metadata would not do: either can be read out of one
;; validated record and put into a forged one. Weak, so a record is garbage collected like any other value.
(defonce ^:private ^Map issued
  (.makeMap (.weakKeys (MapMaker.))))

(defn- failures
  "The `[check-name result]` pairs of `results` that did not pass, as a map. Empty when all passed."
  [results]
  (into {}
        (remove (fn [[_check-name result]] (true? result)))
        results))

(defn- refuse! [record status-code check-failures]
  (throw (ex-info (tru "Invalid {0}" (.getSimpleName (class record)))
                  {:status-code status-code
                   :record      (class record)
                   :failures    check-failures})))

(defn validate
  "Run every check of `record`, then every external check. Returns `record`, now validated, or throws: 400 when a
  check failed, 403 when an external check failed."
  [record]
  (let [check-failures (failures (checks record))]
    (when (seq check-failures)
      (refuse! record 400 check-failures)))
  (let [external-failures (failures (external-checks record))]
    (when (seq external-failures)
      (refuse! record 403 external-failures)))
  (.put issued record true)
  record)

(defn validated?
  "Whether `x` is a record of `record-class` that [[validate]] returned. For a check that a field holds another
  validated record."
  [^Class record-class x]
  (and (instance? record-class x)
       (.containsKey issued x)))

(defn validated
  "`x`, which must be a record of `record-class` that [[validate]] returned. Throws a 500 otherwise. Hint the result
  with the record's class to read its fields with `.-`."
  [^Class record-class x]
  (when-not (validated? record-class x)
    ;; A programming error, not a permission failure: the checks ran or never did.
    (throw (ex-info (str "Expected a validated " (.getSimpleName record-class))
                    {:status-code 500
                     :expected    record-class
                     :got         (type x)})))
  x)
