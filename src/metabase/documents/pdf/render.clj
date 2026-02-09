(ns metabase.documents.pdf.render
  "OpenHTMLtoPDF wrapper for converting XHTML+CSS to PDF bytes."
  (:require
   [clojure.java.io :as io])
  (:import
   (com.openhtmltopdf.outputdevice.helper BaseRendererBuilder$FontStyle)
   (com.openhtmltopdf.pdfboxout PdfRendererBuilder)
   (com.openhtmltopdf.svgsupport BatikSVGDrawer)
   (java.io ByteArrayOutputStream File)
   (java.net URL)))

(set! *warn-on-reflection* true)

(def ^:private font-resources
  "Lato font resource paths to register with the PDF renderer.
  Each entry is [resource-path font-family weight style]."
  [["frontend_client/app/fonts/Lato/Lato-Regular.ttf"       "Lato" 400]
   ["frontend_client/app/fonts/Lato/lato-v16-latin-700.ttf"  "Lato" 700]
   ["frontend_client/app/fonts/Lato/lato-v16-latin-900.ttf"  "Lato" 900]])

(defn- resource-url->file
  "Convert a classpath resource URL to a File. For file: URLs, convert directly.
  For jar: URLs, copy to a temp file."
  ^File [^URL url]
  (if (= "file" (.getProtocol url))
    (io/file (.toURI url))
    (let [ext      (re-find #"\.[^.]+$" (.getPath url))
          tmp-file (File/createTempFile "metabase-font-" (or ext ".ttf"))]
      (.deleteOnExit tmp-file)
      (with-open [in (io/input-stream url)]
        (io/copy in tmp-file))
      tmp-file)))

(def ^:private font-files
  "Lazily resolved font File objects."
  (delay
    (for [[resource-path family weight] font-resources
          :let [url (io/resource resource-path)]
          :when url]
      [(resource-url->file url) family weight])))

(defn- register-fonts!
  [^PdfRendererBuilder builder]
  (doseq [[^File font-file ^String family weight] @font-files]
    (.useFont builder font-file family (int weight)
              BaseRendererBuilder$FontStyle/NORMAL true))
  builder)

(defn xhtml->pdf-bytes
  "Convert an XHTML string to PDF bytes using OpenHTMLtoPDF."
  ^bytes [^String xhtml]
  (with-open [os (ByteArrayOutputStream.)]
    (doto (PdfRendererBuilder.)
      (register-fonts!)
      (.useSVGDrawer (BatikSVGDrawer.))
      (.withHtmlContent xhtml nil)
      (.toStream os)
      (.run))
    (.toByteArray os)))
