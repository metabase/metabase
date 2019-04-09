((clojure-mode . ((eval . (progn
                            ;; Specify which arg is the docstring for certain macros
                            ;; (Add more as needed)
                            (put 'defendpoint 'clojure-doc-string-elt 3)
                            (put 'defendpoint-async 'clojure-doc-string-elt 3)
                            (put 'api/defendpoint 'clojure-doc-string-elt 3)
                            (put 'api/defendpoint-async 'clojure-doc-string-elt 3)
                            (put 'defsetting 'clojure-doc-string-elt 2)
                            (put 'setting/defsetting 'clojure-doc-string-elt 2)
                            (put 's/defn 'clojure-doc-string-elt 2)

                            ;; Define custom indentation for functions inside metabase.
                            ;; This list isn't complete; add more forms as we come across them.
                            (define-clojure-indent
                              (assert 1)
                              (assoc 1)
                              (ex-info 1)
                              (expect 0)
                              (match 1)
                              (merge-with 1)
                              (with-redefs-fn 1)))))))
