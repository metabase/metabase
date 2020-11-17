(ns metabase.pulse.render.image-bundle
  "Logic related to creating image bundles, and some predefined ones. An image bundle contains the data needed to
  either encode the image inline in a URL (when `render-type` is `:inline`), or create the hashes/references needed
  for an attached image (`render-type` of `:attachment`)"
  (:require [clojure.java.io :as io])
  (:import java.net.URL
           java.util.Arrays
           org.apache.commons.io.IOUtils
           org.fit.cssbox.misc.Base64Coder))

(defn- hash-bytes
  "Generate a hash to be used in a Content-ID"
  [^bytes img-bytes]
  (Math/abs ^Integer (Arrays/hashCode img-bytes)))

(defn- hash-image-url
  "Generate a hash to be used in a Content-ID"
  [^java.net.URL url]
  (-> url io/input-stream IOUtils/toByteArray hash-bytes))

(defn- content-id-reference [content-id]
  (str "cid:" content-id))

(defn- mb-hash-str [image-hash]
  (str image-hash "@metabase"))

(defn- write-byte-array-to-temp-file
  [^bytes img-bytes]
  (let [f (doto (java.io.File/createTempFile "metabase_pulse_image_" ".png")
            .deleteOnExit)]
    (with-open [fos (java.io.FileOutputStream. f)]
      (.write fos img-bytes))
    f))

(defn- byte-array->url [^bytes img-bytes]
  (-> img-bytes write-byte-array-to-temp-file io/as-url))

(defn render-img-data-uri
  "Takes a PNG byte array and returns a Base64 encoded URI"
  [img-bytes]
  (str "data:image/png;base64," (String. (Base64Coder/encode img-bytes))))

(defmulti make-image-bundle
  "Create an image bundle. An image bundle contains the data needed to either encode the image inline (when
  `render-type` is `:inline`), or create the hashes/references needed for an attached image (`render-type` of
  `:attachment`)"
  (fn [render-type url-or-bytes]
    [render-type (class url-or-bytes)]))

(defmethod make-image-bundle [:attachment java.net.URL]
  [render-type, ^java.net.URL url]
  (let [content-id (mb-hash-str (hash-image-url url))]
    {:content-id  content-id
     :image-url   url
     :image-src   (content-id-reference content-id)
     :render-type render-type}))

(defmethod make-image-bundle [:attachment (class (byte-array 0))]
  [render-type image-bytes]
  (let [image-url (byte-array->url image-bytes)
        content-id (mb-hash-str (hash-bytes image-bytes))]
    {:content-id  content-id
     :image-url   image-url
     :image-src   (content-id-reference content-id)
     :render-type render-type}))

(defmethod make-image-bundle [:inline java.net.URL]
  [render-type, ^java.net.URL url]
  {:image-src   (-> url io/input-stream IOUtils/toByteArray render-img-data-uri)
   :image-url   url
   :render-type render-type})

(defmethod make-image-bundle [:inline (Class/forName "[B")]
  [render-type image-bytes]
  {:image-src   (render-img-data-uri image-bytes)
   :render-type render-type})

(def ^:private external-link-url (io/resource "frontend_client/app/assets/img/external_link.png"))
(def ^:private no-results-url    (io/resource "frontend_client/app/assets/img/pulse_no_results@2x.png"))
(def ^:private attached-url      (io/resource "frontend_client/app/assets/img/attachment@2x.png"))

(def ^:private external-link-image
  (delay
   (make-image-bundle :attachment external-link-url)))

(def ^:private no-results-image
  (delay
   (make-image-bundle :attachment no-results-url)))

(def ^:private attached-image
  (delay
    (make-image-bundle :attachment attached-url)))

(defn external-link-image-bundle
  "Image bundle for an external link icon."
  [render-type]
  (case render-type
    :attachment @external-link-image
    :inline     (make-image-bundle render-type external-link-url)))

(defn no-results-image-bundle
  "Image bundle for the 'No results' image."
  [render-type]
  (case render-type
    :attachment @no-results-image
    :inline     (make-image-bundle render-type no-results-url)))

(defn attached-image-bundle
  "Image bundle for paperclip 'attachment' image."
  [render-type]
  (case render-type
    :attachment @attached-image
    :inline     (make-image-bundle render-type attached-url)))

(defn image-bundle->attachment
  "Convert an image bundle into an email attachment."
  [{:keys [render-type content-id image-url]}]
  (case render-type
    :attachment {content-id image-url}
    :inline     nil))
