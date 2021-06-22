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
                              (db/insert-many! 1)
                              (let-404)
                              (macros/case 0)
                              (match 1)
                              (mbql.match/match 1)
                              (mt/test-drivers 1)
                              (mt/query 1)
                              (mbql.match/match-one 1)
                              (mbql.match/replace 1)
                              (mbql.match/replace-in 2)
                              (impl/test-migrations 2)
                              (l/matche '(1 (:defn)))
                              (l/matcha '(1 (:defn)))
                              (p/defprotocol+ '(1 (:defn)))
                              (p.types/defprotocol+ '(1 (:defn)))
                              (p.types/def-abstract-type '(1 (:defn)))
                              (p.types/deftype+ '(2 nil nil (:defn)))
                              (p/def-map-type '(2 nil nil (:defn)))
                              (p.types/defrecord+ '(2 nil nil (:defn)))
                              (qp.streaming/streaming-response 1)
                              (prop/for-all 1)
                              (tools.macro/macrolet '(1 (:defn))))))
                  (clojure-indent-style . always-align)
                  ;; if you're using clj-refactor (highly recommended!)
                  (cljr-favor-prefix-notation . nil)
                  ;; prefer keeping source width about ~118, GitHub seems to cut off stuff at either 119 or 120 and
                  ;; it's nicer to look at code in GH when you don't have to scroll back and forth
                  (fill-column . 118)
                  (clojure-docstring-fill-column . 118)
                  (cider-preferred-build-tool . lein))))
