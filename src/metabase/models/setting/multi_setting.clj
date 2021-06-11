(ns metabase.models.setting.multi-setting
  "Helper macros for defining Settings that can have multiple getter/setter implementations. The implementation that
  gets used is determined at runtime when the getter or setter is invoked by a dispatch function.

  This functionality was originally intended to facilitate separate EE and OSS versions of Settings, but rather than
  restrict the impls to just `:oss` and `:ee`, these macros allow an arbitrary dispatch function and any number of
  implementations.

  See PR #16365 for more context."
  (:require [metabase.models.setting :as setting]
            [metabase.util.i18n :refer [tru]]))

(defmulti dispatch-multi-setting
  "Determine the dispatch value for a multi-Setting defined by `define-multi-setting`."
  {:arglists '([setting-key])}
  keyword)

(defmulti get-multi-setting
  "Get the value of a multi-Setting defined by `define-multi-setting` for the `impl` obtained by
  calling `(dispatch-multi-setting setting-key)`."
  {:arglists '([setting-key impl])}
  (fn [setting-key impl]
    [(keyword setting-key) (keyword impl)]))

(defmulti set-multi-setting
  "Update the value of a multi-Setting defined by `define-multi-setting` for the `impl` obtained by
  calling `(dispatch-multi-setting setting-key)`."
  {:arglists '([setting-key impl new-value])}
  (fn [setting-key impl _]
    [(keyword setting-key) (keyword impl)]))

(defmacro define-multi-setting
  "Define a Setting that can have multiple getter/setter implementations. The implementation used is determined by
  calling `dispatch-thunk` when the Setting getter or setter is invoked. And `:getter` or `:setter` defined here will
  be used for all impls; you can use this to make a multi-Setting read-only, for example by specifying `:setter` none
  here.

    defsetting : define-multi-setting :: defn : defmulti"
  {:style/indent :defn}
  [setting-symbol doc dispatch-thunk & {:as options}]
  (let [setting-key (keyword setting-symbol)
        options     (merge {:getter `(fn []
                                       (get-multi-setting ~setting-key (dispatch-multi-setting ~setting-key)))
                            :setter `(fn [new-value#]
                                       (set-multi-setting ~setting-key (dispatch-multi-setting ~setting-key) new-value#))}
                       options)]
    `(do
       (let [dispatch-thunk# ~dispatch-thunk]
         (defmethod dispatch-multi-setting ~setting-key
           [~'_]
           (dispatch-thunk#)))
       (setting/defsetting ~setting-symbol
         ~doc
         ~@(mapcat identity options)))))

(defmacro define-multi-setting-impl
  "Define a implementation for a Setting defined by `define-multi-setting`. Accepts options `:getter` (a function that
  takes no args) and/or `:setter` (a function that takes a single arg, or the keyword `:none`), the same as
  `defsetting`. Note that any of these options defined by `define-multi-setting` will be used for all impls and
  ignored here.

    define-multi-setting : define-multi-setting-impl :: defmulti : defmethod

  See `define-multi-setting` for more details."
  [setting-symbol dispatch-value & {:keys [getter setter]}]
  (let [setting-key    (keyword (name setting-symbol))
        dispatch-value (keyword dispatch-value)]
    `(do
       ~(when getter
          `(let [getter# ~getter]
             (defmethod get-multi-setting [~setting-key ~dispatch-value]
               [~'_ ~'_]
               (getter#))))
       ~(when setter
          (if (= setter :none)
            `(defmethod set-multi-setting [~setting-key ~dispatch-value]
               [~'_ ~'_ ~'_]
               (throw (UnsupportedOperationException. (tru "You cannot set {0}; it is a read-only setting." ~setting-key))))
            `(let [setter# ~setter]
               (defmethod set-multi-setting [~setting-key ~dispatch-value]
                 [~'_ ~'_ new-value#]
                 (setter# new-value#))))))))
