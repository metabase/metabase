(ns metabase.util.fonts
  "font loading functionality."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.files :as u.files])
  (:import
   (java.net URI URL)
   (java.nio.file FileSystem Path)
   (java.util.regex Pattern)))

(set! *warn-on-reflection* true)

(def ^:private bundled-fonts-resource
  "Classpath directory the frontend build emits bundled fonts into. The build stamps a content hash
  into each filename, so files here are looked up by pattern rather than by exact name."
  "frontend_client/app/dist/fonts")

(defn bundled-fonts-available?
  "Whether the frontend build output the bundled font files come from is on the classpath. A packaged
  Metabase always carries it; a backend-only checkout does not."
  []
  (some? (io/resource bundled-fonts-resource)))

(def ^:private bundled-font-families
  "The font families Metabase ships, one per directory under `frontend/fonts`. The names live here
  rather than being read back from the build output so that the whitelabel setting validates the
  same way with or without a frontend build. `frontend/src/metabase/utils/fonts.ts` holds the
  matching front-end map, and [[metabase.util.fonts-test]] checks both against the build output."
  (sort-by u/lower-case-en
           ["Inter"
            "JetBrains Mono"
            "Lato"
            "Lora"
            "Merriweather"
            "Montserrat"
            "Noto Sans"
            "Open Sans"
            "Oswald"
            "PT Sans"
            "PT Serif"
            "Playfair Display"
            "Poppins"
            "Raleway"
            "Roboto"
            "Roboto Condensed"
            "Roboto Mono"
            "Roboto Slab"
            "Slabo 27px"
            "Source Sans Pro"
            "Ubuntu"]))

(defn available-fonts
  "Return an alphabetically sorted list of available fonts, as Strings."
  []
  bundled-font-families)

(defn available-font?
  "True if a font's 'Display String', `font`, is a valid font available on this system."
  [font]
  (boolean
   ((set (available-fonts)) font)))

(defn- font-dirname
  "Directory the build emits `font-name` into, e.g. \"PT Serif\" -> \"PT_Serif\"."
  [font-name]
  (str/replace font-name " " "_"))

(defn- filenames-by-directory
  "The files one level under each immediate subdirectory of `dir-path`, by subdirectory name. Every
  name is read here: a Path does not outlive the filesystem it came from."
  [^Path dir-path]
  (into {}
        (map (fn [^Path family-path]
               [(str (.getFileName family-path))
                (mapv #(str (.getFileName ^Path %)) (u.files/files-seq family-path))]))
        (u.files/files-seq dir-path)))

(defn- jar-holding
  "Filesystem path of the jar a `jar:file:/...app.jar!/...` resource lives in, or nil for a real file."
  ^String [^URL url]
  (let [path (.getFile url)]
    (when-let [separator (str/index-of path "!/")]
      (u.files/code-location->path (URI. (subs path 0 separator))))))

(defn- read-emitted-filenames
  "Filenames under `resource-dir`, as a map of family directory to the names of the files in it."
  [resource-dir]
  (when-let [url (io/resource resource-dir)]
    (if-let [jar (jar-holding url)]
      ;; Open the jar through a Path rather than the jar: URL. The URL route goes through NIO's
      ;; URI-keyed cache, which hands every caller one shared filesystem, so closing it here would
      ;; close it under anything else reading the same jar. [[u.files/nio-fs]] gives this its own.
      (with-open [^FileSystem fs (u.files/nio-fs jar)]
        (filenames-by-directory (.getPath fs (str "/" resource-dir) (u/varargs String))))
      (u.files/with-open-path-to-resource [dir-path resource-dir]
        (filenames-by-directory dir-path)))))

(def ^:private emitted-filenames
  "Read once, behind a delay. NIO keys jar filesystems by URI and hands every caller the same
  instance, so two threads listing this directory at once would have the first close it while the
  second is still reading. A delay lets exactly one thread do the read, and the rest wait for it."
  (delay (read-emitted-filenames bundled-fonts-resource)))

(defn find-hashed-file
  "Filename the build emitted for `stem`.`ext` of `font-name`, content hash included, or nil when the
  frontend has not been built. For example `(find-hashed-file \"Lato\" \"lato-v16-latin-700\" \"woff2\")`
  returns `\"lato-v16-latin-700.a1b2c3d4.woff2\"`."
  [font-name stem ext]
  (let [pattern (re-pattern (str (Pattern/quote stem) "\\.[a-f0-9]+\\." ext))]
    (some #(when (re-matches pattern %) %)
          (get @emitted-filenames (font-dirname font-name)))))

(defn hashed-font-url-path
  "Web path of a bundled font file, or nil when the frontend has not been built."
  [font-name stem ext]
  (when-let [filename (find-hashed-file font-name stem ext)]
    (str "/app/dist/fonts/" (font-dirname font-name) "/" filename)))
