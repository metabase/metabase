(ns dev.render-png
  "Improve feedback loop for dealing with png rendering code. Will create images using the rendering that underpins
  pulses and subscriptions and open those images without needing to send them to slack or email."
  (:require [clojure.java.io :as io]
            [clojure.java.shell :as sh]
            [clojure.string :as str]
            [hiccup.core :as h]
            [metabase.models.card :as card]
            [metabase.models.user :as user]
            [metabase.pulse :as pulse]
            [metabase.pulse.render :as pulse-render]
            [metabase.pulse.render.js-svg :as js-svg]
            [metabase.pulse.render.png :as png]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [toucan.db :as tdb])
  (:import org.fit.cssbox.misc.Base64Coder))

;; taken from https://github.com/aysylu/loom/blob/master/src/loom/io.clj
(defn- os
  "Returns :win, :mac, :unix, or nil"
  []
  (condp
      #(<= 0 (.indexOf ^String %2 ^String %1))
      (.toLowerCase (System/getProperty "os.name"))
    "win" :win
    "mac" :mac
    "nix" :unix
    "nux" :unix
    nil))

;; taken from https://github.com/aysylu/loom/blob/master/src/loom/io.clj
(defn- open
  "Opens the given file (a string, File, or file URI) in the default
  application for the current desktop environment. Returns nil"
  [f]
  (let [f (io/file f)]
    ;; There's an 'open' method in java.awt.Desktop but it hangs on Windows
    ;; using Clojure Box and turns the process into a GUI process on Max OS X.
    ;; Maybe it's ok for Linux?
    (condp = (os)
      :mac  (sh/sh "open" (str f))
      :win  (sh/sh "cmd" (str "/c start " (-> f .toURI .toURL str)))
      :unix (sh/sh "xdg-open" (str f)))
    nil))

(defn render-card-to-png
  "Given a card ID, renders the card to a png and opens it. Be aware that the png rendered on a dev machine may not
  match what's rendered on another system, like a docker container."
  [card-id]
  (let [{:keys [dataset_query] :as card} (tdb/select-one card/Card :id card-id)
        user                             (tdb/select-one user/User)
        query-results                    (binding [qp.perms/*card-id* nil]
                                           (qp/process-query-and-save-execution!
                                            (assoc dataset_query :async? false)
                                            {:executed-by (:id user)
                                             :context     :pulse
                                             :card-id     card-id}))
        png-bytes                        (pulse-render/render-pulse-card-to-png (pulse/defaulted-timezone card)
                                                                                card
                                                                                query-results
                                                                                1000)
        tmp-file                         (java.io.File/createTempFile "card-png" ".png")]
    (with-open [w (java.io.FileOutputStream. tmp-file)]
      (.write w ^bytes png-bytes))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

(defn open-png-bytes [bytes]
  (let [tmp-file (java.io.File/createTempFile "card-png" ".png")]
    (with-open [w (java.io.FileOutputStream. tmp-file)]
      (.write w ^bytes bytes))
    (.deleteOnExit tmp-file)
    (open tmp-file)))

(defn render-img-data-uri
  "Takes a PNG byte array and returns a Base64 encoded URI"
  [img-bytes]
  (str "data:image/png;base64," (String. (Base64Coder/encode img-bytes))))

(defn svg-image [kind]
  (let [line|bar-data [["2015-02-01T00:00:00-08:00" 443]
                       ["2015-03-01T00:00:00-08:00" 875]
                       ["2015-04-01T00:00:00-07:00" 483]
                       ["2015-05-01T00:00:00-07:00" 421]]
        donut-data    [["alpha" 32]
                       ["beta" 49]
                       ["gamma" 23]
                       ["delta" 67]]
        donut-colors {"alpha" "red"
                      "beta" "green"
                      "gamma" "blue"
                      "delta" "yellow"}]
    (case kind
      :line  (js-svg/timelineseries-line line|bar-data)
      :bar   (js-svg/timelineseries-bar line|bar-data)
      :donut (js-svg/categorical-donut donut-data donut-colors)
      (throw (ex-info (str "Invalid chart type: " kind "\n Valid choices are :line, :bar, :donut")
                      {})))))

(defn preview-html
  "Chart type is one of :line, :bar, :donut. Html is a string with a placeholder {{chart}} which will be replaced with
  the [:img {:src chart-placeholder}] and the resulting html will be opened."
  [{:keys [chart html-file html-inline]}]
  (let [chart-image (render-img-data-uri (svg-image chart))
        chart-html (h/html [:img {:src chart-image :style "display: block; width: 100%"}])
        html (cond html-file
                   (slurp html-file)
                   html-inline
                   (str "<html><body style=\"margin: 0; padding: 0; background-color: white;\">"
                        html-inline
                        "</body></html>"))
        html (h/html (str/replace html #"\{\{chart\}\}" chart-html))]
    (with-open [os (java.io.ByteArrayOutputStream.)]
      (let [image-bytes (do (#'png/render-to-png! html os 1000)
                            (.toByteArray os))]
        (open-png-bytes image-bytes)))))

(defn help []
  (println
   "
To render some html, call the function `preview-html`. This takes one argument, a map.
The keys in the map are `:chart` and either `:html-file` or `:html-inline`.
(preview-html {:chart :donut :html-inline some-html-to-render})
or
(preview-html {:chart :donut :html-file some-file-with-html})

This function will render the html and open an image.
Valid charts are `:donut`, `:line`, and `:bar`.

You can use {{chart}} in your html to indicate where the image of the chart should be embedded.
It will be <img src=data-uri-of-chart style=\"display: block; width: 100%\">

For instance
(preview-html {:chart :donut
               :html-inline \"<div><h1>behold the donut</h1>{{chart}}</div>\"})
"))

(comment
  (preview-html {:chart :donut :html-inline "
<div>
  {{chart}}
  <table>
    <tr><td style=\"color: #509EE3; font-size: 24px; font-weight: 700; padding-right: 16px;\">500</td>
        <td style=\"color: #7C8381; font-size: 24px; font-weight: 700;\">600</td>
    </tr>
    <tr><td style=\"color: #509EE3; font-size: 16px; font-weight: 700; padding-right: 16px;\">March</td>
        <td style=\"color: #7C8381; font-size: 16px;\">April</td>
    </tr>
  </table>
</div>"}))
