(ns hooks.metabase.util.log
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [hooks.common]))

;;;; Checks for both log + logf

(defn- disallow-i18n [node]
  (walk/postwalk
   (fn [x]
     (when-let [qualified-symbol (hooks.common/node->qualified-symbol x)]
       (when (and (= (namespace qualified-symbol) "metabase.util.i18n")
                  (or (str/includes? (name qualified-symbol) "tru")
                      (str/includes? (name qualified-symbol) "trs")))
         (api/reg-finding! (assoc (meta x)
                                  :message "do not i18n the logs!"
                                  :type :metabase/validate-logging)))))
   node))

(defn- check-position-of-exception-arg
  "Tell people to do (info e \"whatever\") instead of (info \"whatever\" e)."
  [node]
  (let [[f _first-arg & args] (:children node)]
    (doseq [arg args]
      (when (and (api/token-node? arg)
                 (= (api/sexpr arg) 'e))
        (api/reg-finding! (assoc (meta arg)
                                 :message (format "pass exceptions as the first arg to %s" (api/sexpr f))
                                 :type :metabase/validate-logging))))))

(defn- common-checks [node]
  (check-position-of-exception-arg node)
  (disallow-i18n node))

(defn- check-for-i18n-format-specifiers
  "Make sure people aren't using things like {0} in their log messages."
  [node string-node]
  (when (re-find #"\{\d+\}" (api/sexpr string-node))
    (api/reg-finding! (assoc (meta node)
                             :message "this looks like an i18n format string. Don't use identifiers like {0} in logging."
                             :type :metabase/validate-logging))))

;;; log only

(defn- check-not-format-string
  "Make sure we're not using something like log/trace with a format string."
  [{[f] :children, :as node} string-node]
  (when (pos? (hooks.common/format-string-specifier-count (api/sexpr string-node)))
    (api/reg-finding! (assoc (meta node)
                             :message (format "%s used with a format string, use %s instead."
                                              (api/sexpr f)
                                              (str (api/sexpr f) "f"))
                             :type :metabase/validate-logging))))

(defn- format-node? [node]
  (when (api/list-node? node)
    (let [[x] (:children node)]
      (and (api/token-node? x)
           (or (= (hooks.common/node->qualified-symbol x) 'clojure.core/format)
               (= (api/sexpr x) 'format))))))

(defn- warn-against-log+format-instead-of-logf
  "Tell people to use things like infof instead of info + format."
  [{[f] :children, :as node} [x :as args]]
  (when (and (= (count args) 1)
             (api/list-node? x))
    (when (format-node? x)
      (api/reg-finding! (assoc (meta node)
                               :message (format "Use %s instead of %s + format"
                                                (str (api/sexpr f) "f")
                                                (api/sexpr f))
                               :type :metabase/validate-logging)))))

(defn info
  "Valid log, debug, etc."
  [{:keys [node], :as x}]
  (common-checks node)
  (let [[_f & args]         (:children node)
        [_e & [x :as args]] (if (and (api/token-node? (first args))
                                     (or (api/string-node? (second args))
                                         (format-node? (second args))))
                              args
                              (cons nil args))]
    (when (api/string-node? x)
      (check-for-i18n-format-specifiers node x)
      (check-not-format-string node x))
    (warn-against-log+format-instead-of-logf node args))
  x)

;;;; logf only

(defn- check-format-string-arg-count
  "Make sure the number of args passed to something like tracef match the number of format string specifiers."
  [{[f] :children, :as node} format-string args]
  (let [expected-arg-count (hooks.common/format-string-specifier-count (api/sexpr format-string))
        actual-arg-count   (count args)]
    (when (zero? expected-arg-count)
      (api/reg-finding! (assoc (meta node)
                               :message (format "Don't use %s with no format string arguments, use %s instead."
                                                (api/sexpr f)
                                                (str/replace (str (api/sexpr f)) #"f$" ""))
                               :type :metabase/validate-logging)))
    (when-not (= expected-arg-count actual-arg-count)
      (api/reg-finding! (assoc (meta node)
                               :message (format "log format string expects %d arguments instead of %d."
                                                expected-arg-count
                                                actual-arg-count)
                               :type :metabase/validate-logging)))))



(defn infof
  "Valid logf, debugf, etc."
  [{:keys [node], :as x}]
  (common-checks node)
  (let [[_f & args]               (:children node)
        [_e format-string & args] (if (api/string-node? (first args))
                                    (cons nil args)
                                    args)]
    ;; TODO -- maybe we can error if you did not pass a format string, e.g. (log/infof 1 2) is obviously incorrect.
    (when (api/string-node? format-string)
      (check-for-i18n-format-specifiers node format-string)
      (check-format-string-arg-count node format-string args)))
  x)
