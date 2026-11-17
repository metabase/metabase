(ns broken-fixtures.boom)

(throw (ex-info "intentional load failure" {}))
