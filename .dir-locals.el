((clojure-mode . ((eval . (progn
                            ;; Define custom indentation for functions inside metabase.
                            ;; This list isn't complete; add more forms as we come across them.
                            (define-clojure-indent
                              (api-let 2)
                              (auto-parse 1)
                              (catch-api-exceptions 0)
                              (context 2)
                              (expect 1)
                              (ins 1)
                              (let-400 1)
                              (let-404 1)
                              (match 1)
                              (match-$ 1)
                              (macrolet 1)
                              (org-perms-case 1)
                              (with-credentials 1)))))))
