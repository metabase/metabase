(ns metabase.lib.expression.preview
  "**Previewing** an expression means evaluating it on sample rows of data.

  This is used in the FE to give example results of expressions under construction, eg. when combining columns with
  `:concat`."
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.hierarchy :as lib.hierarchy]))

(defmulti preview-expression
  "Given a `query` and `stage-number`, an `expression` (a pMBQL expression clause or a literal like a string or number)
  a list `columns` and a `col->value` function, returns the value of `expression` applied to that data.

  It is **legal** for the expression to refer to columns that aren't found in the `columns`! They might be a new
  implicit join, or otherwise not found in the columns. In that case, [[preview-expression]] throws an exception.

  **NOTE:** This does not support all expressions at present! Many of our expressions are quite complex to evaluate
  outside of a database engine. This function only supports a subset of expression functions."
  {:arglists '([query stage-number expression columns col->value])}
  (fn [_query _stage-number expression _columns _col->value]
    (lib.dispatch/dispatch-value expression))
  :hierarchy lib.hierarchy/hierarchy)

;; Default: Throw for an unrecognized expression.
(defmethod preview-expression :default
  [query stage-number expression columns _col->value]
  (throw (ex-info (str "Unable to preview expression: " (pr-str expression))
                  {:query        query
                   :stage-number stage-number
                   :expression   expression
                   :columns      columns})))

;; For literals (ie. anything which is neither an MBQL clause nor a `:lib/type` MLv2 structure), preview-expression
;; returns them as they are.
(defmethod preview-expression :dispatch-type/*
  [_query _stage-number expression _columns _col->value]
  expression)

;; Refs get resolved to their corresponding value in the row.
(defmethod preview-expression :field
  [query stage-number field-ref columns col->value]
  (let [column (lib.equality/find-matching-column field-ref columns)
        value  (if column
                 (col->value column ::not-found) ; `nil` might be a legit NULL!
                 ::not-found)]
    (if (not= value ::not-found)
      value
      (throw (ex-info "Failed to find field in preview-expression" {:query        query
                                                                    :stage-number stage-number
                                                                    :field-ref    field-ref
                                                                    :columns      columns
                                                                    :col->value   col->value})))))

;; Arithmetic
(defmethod preview-expression :+
  [query stage-number [_+ _opts & args] columns col->value]
  (reduce + 0 (for [arg args]
                (preview-expression query stage-number arg columns col->value))))

(defmethod preview-expression :-
  [query stage-number [_- _opts a b] columns col->value]
  (- (preview-expression query stage-number a columns col->value)
     (preview-expression query stage-number b columns col->value)))

(defmethod preview-expression :*
  [query stage-number [_* _opts a b] columns col->value]
  (* (preview-expression query stage-number a columns col->value)
     (preview-expression query stage-number b columns col->value)))

(defmethod preview-expression :/
  [query stage-number [_slash _opts a b] columns col->value]
  (double (/ (preview-expression query stage-number a columns col->value)
             (preview-expression query stage-number b columns col->value))))

(defmethod preview-expression :concat
  [query stage-number [_concat _opts & strings] columns col->value]
  (str/join (for [s strings]
              (str (preview-expression query stage-number s columns col->value)))))
