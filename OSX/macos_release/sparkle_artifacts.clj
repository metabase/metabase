(ns macos-release.sparkle-artifacts
  (:require [clojure.data.xml :as xml]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [hiccup.core :as h]
            [macos-release
             [codesign :as codesign]
             [common :as c]]
            [pl.danieljanus.tagsoup :as tagsoup])
  (:import [java.io File FileOutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets))

(def ^:private ^String appcast-file       (c/artifact "appcast.xml"))
(def ^:private ^String release-notes-file (c/artifact "release-notes.html"))
(def ^:private ^String zip-file           (c/artifact "Metabase.zip"))

(defn- verify-zip-codesign []
  (c/step (format "Verify code signature of Metabase.app archived in %s" zip-file)
    (let [temp-file "/tmp/Metabase.zip"]
      (c/delete-file! temp-file)
      (c/sh {:quiet? true}
            "unzip" (c/assert-file-exists zip-file)
            "-d"    temp-file)
      (c/assert-file-exists temp-file)
      (let [unzipped-app-file (c/assert-file-exists (str temp-file "/Metabase.app"))]
        (codesign/verify-codesign unzipped-app-file)))))

(defn- create-zip-archive! []
  (c/delete-file! zip-file)
  (c/step (format "Create ZIP file %s" zip-file)
    (c/assert-file-exists (c/artifact "Metabase.app"))
    ;; Use ditto instead of zip to preserve the codesigning -- see https://forums.developer.apple.com/thread/116831
    (c/sh {:dir c/artifacts-directory}
          "ditto" "-c" "-k" "--sequesterRsrc"
          "--keepParent" "Metabase.app" "Metabase.zip")
    (c/assert-file-exists zip-file)
    (verify-zip-codesign)))

(defn- generate-file-signature [filename]
  (c/step (format "Generate signature for %s" filename)
    (let [private-key (c/assert-file-exists (str c/macos-source-dir "/dsa_priv.pem"))
          script      (c/assert-file-exists (str c/root-directory "/bin/lib/sign_update.rb"))
          [out]       (c/sh script (c/assert-file-exists filename) private-key)
          signature   (str/trim out)]
      (assert (seq signature))
      signature)))

(defn- handle-namespaced-keyword [k]
  (if (namespace k)
    (str (namespace k) ":" (name k))
    k))

(defn- xml [form]
  (if (and (sequential? form)
           (keyword? (first form)))
    (let [[element & more] form
          [attrs & body]   (if (map? (first more))
                             more
                             (cons {} more))
          attrs            (into {} (for [[k v] attrs]
                                      [(handle-namespaced-keyword k) v]))
          element          (handle-namespaced-keyword element)]
      (apply xml/element element attrs (map xml body)))
    form))

(defn- appcast-xml
  ([]
   (appcast-xml (.length (File. (c/assert-file-exists zip-file)))
                (generate-file-signature zip-file)))

  ([length signature]
   (xml
    [:rss
     {:version       "2.0"
      :xmlns/sparkle "http://www.andymatuschak.org/xml-namespaces/sparkle"
      :xmlns/dc      "http://purl.org/dc/elements/1.1/"}
     [:channel
      [:title "Metabase ChangeLog"]
      [:link (c/uploaded-artifact-url "appcast.xml")]
      [:language "en"]
      [:item
       [:title (format "Version %s" (c/version))]
       [:sparkle/releaseNotesLink (c/uploaded-artifact-url "release-notes.html")]
       [:enclosure
        {:url                  (c/uploaded-artifact-url "Metabase.zip")
         :sparkle/version      (c/version)
         :length               length
         :type                 "application/octet-stream"
         :sparkle/dsaSignature signature}]]]])))

(defn- generate-appcast! []
  (c/delete-file! appcast-file)
  (c/step (format "Generate appcast %s" appcast-file)
    (with-open [os (FileOutputStream. (File. appcast-file))
                w  (OutputStreamWriter. os StandardCharsets/UTF_8)]
      (xml/indent (appcast-xml) w))
    (c/assert-file-exists appcast-file)))

(defn- release-notes-body []
  (let [url (format "https://github.com/metabase/metabase/releases/tag/v%s" (c/version))]
    (try
      (letfn [(find-body [x]
                (when (sequential? x)
                  (let [[element {klass :class} & body] x]
                    (if (and (= element :div)
                             (= klass "markdown-body"))
                      x
                      (some find-body body)))))]
        (->> (tagsoup/parse url)
             find-body))
      (catch Throwable e
        (throw (ex-info (format "Error parsing release notes at %s: are you sure they exists?" url) {} e))))))

(defn- release-notes []
  [:html
   [:head [:title "Metabase Release Notes"]]
   [:body (release-notes-body)]])

(defn- generate-release-notes! []
  (c/delete-file! release-notes-file)
  (c/step (format "Generate release notes %s" release-notes-file)
    (let [notes (release-notes)]
      (with-open [w (io/writer release-notes-file)]
        (.write w (h/html notes))))))

(defn generate-sparkle-artifacts! []
  (c/step "Generate Sparkle artifacts"
    (create-zip-archive!)
    (generate-appcast!)
    (generate-release-notes!)
    (c/announce "Sparkle artifacts generated successfully.")))
