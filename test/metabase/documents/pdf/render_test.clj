(ns metabase.documents.pdf.render-test
  (:require
   [clojure.test :refer :all]
   [metabase.documents.pdf.render :as render]))

(deftest xhtml->pdf-bytes-produces-valid-pdf-test
  (let [xhtml (str "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
                   "<!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Strict//EN\" "
                   "\"http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd\">\n"
                   "<html xmlns=\"http://www.w3.org/1999/xhtml\">"
                   "<head><meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\" /></head>"
                   "<body><p>Hello World</p></body></html>")
        pdf-bytes (render/xhtml->pdf-bytes xhtml)]
    (is (bytes? pdf-bytes))
    (is (pos? (alength pdf-bytes)))
    (is (= "%PDF" (String. pdf-bytes 0 4 "US-ASCII")))))
