(ns metabase.driver.sql.util
  "Utility functions for writing SQL drivers."
  (:require [honeysql.core :as hsql]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.honeysql-extensions :as hx]))

(defn quote-name
  "Quote unqualified string or keyword identifier(s) by passing them to `hx/identifier`, then calling HoneySQL `format`
  on the resulting `Identifier`. Uses the `sql.qp/quote-style` of the current driver. You can implement `->honeysql`
  for `Identifier` if you need custom behavior here.

    (quote-name :mysql \"wow\") ; -> \"`wow`\"
    (quote-name :h2 \"wow\")    ; -> \"\\\"WOW\\\"\"

  You should only use this function for places where you are not using HoneySQL, such as queries written directly in
  SQL. For HoneySQL forms, `Identifier` is converted to SQL automatically when it is compiled."
  {:style/indent 1}
  [driver & identifiers]
  (first
   (hsql/format (sql.qp/->honeysql driver (apply hx/identifier identifiers))
     :quoting             (sql.qp/quote-style driver)
     :allow-dashed-names? true)))
