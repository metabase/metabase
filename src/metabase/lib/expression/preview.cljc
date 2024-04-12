(ns metabase.lib.expression.preview
  "**Previewing** an expression means evaluating it on sample rows of data.

  This is used in the FE to give example results of expressions under construction, eg. when combining columns with
  `:concat`."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.hierarchy :as lib.hierarchy]))

(defmulti preview-expression
  "Given a `query` and `stage-number`, an `expression` (a pMBQL expression clause or a literal like a string or number)
  and a `row` of data, returns the value of `expression` applied to that data.

  **NOTE:** This does not support all expressions at present! Many of our expressions are quite complex to evaluate
  outside of a database engine. This function only supports a subset of expression functions."
  {:arglists '([query stage-number expression row])}
  (fn [_query _stage-number expression _row]
    (lib.dispatch/dispatch-value expression))
  :hierarchy lib.hierarchy/hierarchy)

;; Default: Throw for an unrecognized expression.
(defmethod preview-expression :default
  [query stage-number expression row]
  (throw (ex-info (str "Unable to preview expression: " (pr-str expression))
                  {:query        query
                   :stage-number stage-number
                   :expression   expression
                   :row          row})))

;; For literals (ie. anything which is neither an MBQL clause nor a `:lib/type` MLv2 structure), preview-expression
;; returns them as they are.
(defmethod preview-expression :dispatch-type/*
  [_query _stage-number expression _row]
  expression)

;; Refs get resolved to their corresponding value in the row.
(defmethod preview-expression :field
  [query stage-number field-ref row]
  (when-let [{:keys [value]} (m/find-first #(lib.equality/find-matching-column
                                              query stage-number field-ref [(:column %)])
                                           row)]
    value))

;; Arithmetic
(defmethod preview-expression :+
  [query stage-number [_+ _opts & args] row]
  (reduce + 0 (for [arg args]
                (preview-expression query stage-number arg row))))

(defmethod preview-expression :-
  [query stage-number [_- _opts a b] row]
  (- (preview-expression query stage-number a row)
     (preview-expression query stage-number b row)))

(defmethod preview-expression :*
  [query stage-number [_* _opts a b] row]
  (* (preview-expression query stage-number a row)
     (preview-expression query stage-number b row)))

(defmethod preview-expression :/
  [query stage-number [_slash _opts a b] row]
  (double (/ (preview-expression query stage-number a row)
             (preview-expression query stage-number b row))))

(defmethod preview-expression :concat
  [query stage-number [_concat _opts & strings] row]
  (str/join (for [s strings]
              (str (preview-expression query stage-number s row)))))
