((nil . ((indent-tabs-mode . nil)       ; always use spaces for tabs
         (require-final-newline . t)))  ; add final newline on save
 (js2-mode . ((js2-mode-show-parse-errors . nil)      ; these settings will let flycheck do everything through eslint,
              (js2-mode-show-strict-warnings . nil))) ; because js2-mode can't handle flowtype
 (clojure-mode . ((eval . (progn
                            ;; Specify which arg is the docstring for certain macros
                            ;; (Add more as needed)
                            (put 'defendpoint 'clojure-doc-string-elt 3)
                            (put 'defendpoint-async 'clojure-doc-string-elt 3)
                            (put 'api/defendpoint 'clojure-doc-string-elt 3)
                            (put 'api/defendpoint-async 'clojure-doc-string-elt 3)
                            (put 'defsetting 'clojure-doc-string-elt 2)
                            (put 'setting/defsetting 'clojure-doc-string-elt 2)
                            (put 's/defn 'clojure-doc-string-elt 2)
                            (put 'p.types/defprotocol+ 'clojure-doc-string-elt 2)

                            ;; Define custom indentation for functions inside metabase.
                            ;; This list isn't complete; add more forms as we come across them.
                            (define-clojure-indent
                              (let-404 1)
                              (match 1)
                              (merge-with 1)
                              (p.types/defprotocol+ '(1 (:defn)))
                              (p.types/def-abstract-type '(1 (:defn)))
                              (p.types/deftype+ '(2 nil nil (:defn)))
                              (p/def-map-type '(2 nil nil (:defn)))
                              (p.types/defrecord+ '(2 nil nil (:defn))))))
                  ;; if you're using clj-refactor (highly recommended!), prefer prefix notation when cleaning the ns form
                  (cljr-favor-prefix-notation . t)
                  ;; prefer keeping source width about ~118, GitHub seems to cut off stuff at either 119 or 120 and
                  ;; it's nicer to look at code in GH when you don't have to scroll back and forth
                  (fill-column . 118)
                  (clojure-docstring-fill-column . 118))))
