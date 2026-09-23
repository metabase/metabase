(ns mage.readable.server
  "A small local web server showing PRs, local changes or single files as readable TypeScript-ish diffs, with a
  toggle back to the raw Clojure diff."
  (:require
   [babashka.process :as process]
   [clojure.string :as str]
   [hiccup.util :as hiccup.util]
   [hiccup2.core :as h]
   [mage.readable.core :as readable]
   [mage.readable.diff :as diff]
   [mage.readable.git :as git]
   [mage.readable.highlight :as hl]
   [org.httpkit.server :as http])
  (:import
   (java.net URLDecoder URLEncoder)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Translation (cached) ---------------------------------------

(defonce ^:private cache (atom {}))

(def ^:private max-cache-entries 2000)

(defn- cached
  "Memoize `(f)` under `k` (keys hold the full source text, so there are no hash collisions). The cache is simply
  emptied when it gets large."
  [k f]
  (if (contains? @cache k)
    (get @cache k)
    (let [v (f)]
      (swap! cache (fn [c] (assoc (if (>= (count c) max-cache-entries) {} c) k v)))
      v)))

(defonce ^:private changes-cache (atom {}))

(defn- cached-changes
  "The file list for a PR/local view, reused for a minute so toggling views doesn't re-run git."
  [k f refresh?]
  (let [[at v] (get @changes-cache k)
        now    (System/currentTimeMillis)]
    (if (and v (not refresh?) (< (- now at) 60000))
      v
      (let [v (f)] (swap! changes-cache assoc k [now v]) v))))

(defn- translate
  "Readable text for Clojure `source`, or nil if it can't be translated."
  [source]
  (when source
    (cached [:translate source] #(try (readable/translate-string source) (catch Throwable _ nil)))))

(defn- plain-lines
  "HTML-escaped lines for files we don't highlight."
  [text]
  (map hl/escape (str/split-lines (or text ""))))

;;; ------------------------------------------------ Rendering --------------------------------------------------

(def ^:private context-lines 4)

(defn- collapse
  "Group diff rows into [:rows rows] and [:hidden rows] runs, hiding unchanged lines far from any change."
  [rows collapse?]
  (if-not collapse?
    [[:rows rows]]
    (let [changed (set (keep-indexed (fn [i r] (when (not= :ctx (:type r)) i)) rows))
          near?   (fn [i] (some #(<= (abs (- i %)) context-lines) changed))
          keep?   (vec (map-indexed (fn [i _] (boolean (near? i))) rows))]
      (->> (map vector rows keep?)
           (partition-by second)
           (map (fn [run]
                  (let [rs (mapv first run)]
                    (if (or (second (first run)) (< (count rs) 3)) [:rows rs] [:hidden rs]))))))))

(defn- row-html [{:keys [type old new]} html-line]
  [:tr {:class (name type)}
   [:td.ln (or old "")]
   [:td.ln (or new "")]
   [:td.sign (case type :add "+" :del "−" " ")]
   [:td.code (hiccup.util/raw-string (if (str/blank? html-line) "&#8203;" html-line))]])

(defn- file-rows
  "Diff rows plus per-row highlighted HTML for one file in the chosen view."
  [{:keys [old new path]} view]
  (let [clj?      (git/clojure-file? path)
        readable? (and (= view "readable") clj? (not (str/ends-with? path ".edn")))
        [old-t new-t ok?] (if readable?
                            (let [o (translate old) n (translate new)]
                              (if (and (or (nil? old) o) (or (nil? new) n)) [o n true] [old new false]))
                            [old new true])
        [lang hl-fn] (cond
                       (and readable? ok?) [:readable hl/readable-lines]
                       clj?                [:clojure hl/clojure-lines]
                       :else               [:plain plain-lines])
        hl-cached (fn [t] (cached [:hl lang t] #(vec (hl-fn (or t "")))))
        old-html  (hl-cached old-t)
        new-html  (hl-cached new-t)
        rows      (diff/diff-rows old-t new-t)]
    {:rows       rows
     :fallback?  (and readable? (not ok?))
     :html-for   (fn [{:keys [type old new]}]
                   (if (= type :del) (get old-html (dec old) "") (get new-html (dec new) "")))}))

(defn- file-section [idx file view collapse?]
  (let [{:keys [rows fallback? html-for]} (file-rows file view)
        {:keys [add del]} (diff/stats rows)]
    [:section.file {:id (str "f" idx)}
     [:h2 [:span.status {:class (name (:status file :modified))} (name (:status file :modified))]
      [:span.path (:path file)]
      (when (or (pos? add) (pos? del))
        [:span.counts [:span.add (str "+" add)] " " [:span.del (str "−" del)]])
      [:a.raw {:href (str "/file?path=" (URLEncoder/encode ^String (:path file) "UTF-8") "&view=" view)} "full file"]]
     (when fallback? [:p.note "This file couldn't be translated, so it's shown as Clojure."])
     (if (empty? rows)
       [:p.note "(empty)"]
       [:table.diff
        (for [[kind rs] (collapse rows collapse?)]
          (if (= kind :rows)
            [:tbody (for [r rs] (row-html r (html-for r)))]
            (list
             [:tbody [:tr.expander [:td {:colspan 4} [:button {:onclick "expand(this)"} (str "⋯ " (count rs) " unchanged lines")]]]]
             [:tbody.hidden (for [r rs] (row-html r (html-for r)))])))])]))

(def ^:private legend
  [["x |> f(%, 1)" "Pipeline (Clojure's -> / ->>): the value on the left goes where the % is."]
   ["x ?|> f(%)" "Same, but stops with null as soon as a value is null (some->)."]
   ["do { ...; value }" "A block used as an expression; its value is the last line."]
   ["using _ = withX(...)" "Setup (with-temp, settings, redefs, bindings...) that is undone when the enclosing block ends."]
   ["sql`SELECT ...`" "SQL generated from Toucan / HoneySQL. ${x} are values from the surrounding code."]
   ["clj`(...)`" "Clojure that isn't translated (macros and rare forms); read it as-is."]
   ["x == y" "Clojure = compares values deeply (maps, lists), not references."]
   ["if (x)" "Only null and false are falsy in Clojure; 0 and \"\" are truthy."]
   ["defineSetting(...)" "A setting. siteUrl() reads it, siteUrl(value) writes it."]
   ["f.implement(v, (args) => ...)" "An implementation of multimethod f, chosen when the dispatch value is v."]
   ["router.get(\"/:id\", (/* route params */ ...) => ...)" "An API endpoint (defendpoint); params are route, query and body."]
   ["platform({ clj: a, cljs: b })" "Different code on the JVM (clj) and in the browser (cljs)."]
   ["fooBar, isFoo, save" "Names are camelCased: foo-bar, foo?, save! in the Clojure source."]])

(def ^:private css "
:root { --bg:#ffffff; --fg:#1f2328; --muted:#656d76; --border:#d0d7de; --panel:#f6f8fa; --add:#e6ffec; --add-sign:#1a7f37;
  --del:#ffebe9; --del-sign:#cf222e; --accent:#0969da; --kw:#cf222e; --str:#0a3069; --comment:#6e7781; --num:#0550ae;
  --type:#953800; --fn:#8250df; --sql:#116329; --sqlkw:#0550ae; --interp:#953800; --raw-bg:#fff8c5; --pipe:#8250df; }
@media (prefers-color-scheme: dark) { :root:not([data-theme=\"light\"]) { --bg:#0d1117; --fg:#e6edf3; --muted:#8d96a0;
  --border:#30363d; --panel:#161b22; --add:#12261e; --add-sign:#3fb950; --del:#25171c; --del-sign:#f85149; --accent:#4493f8;
  --kw:#ff7b72; --str:#a5d6ff; --comment:#8b949e; --num:#79c0ff; --type:#ffa657; --fn:#d2a8ff; --sql:#7ee787;
  --sqlkw:#79c0ff; --interp:#ffa657; --raw-bg:#2d2a14; --pipe:#d2a8ff; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
header { position:sticky; top:0; z-index:5; display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:8px 16px;
  background:var(--panel); border-bottom:1px solid var(--border); }
header .brand { font-weight:600; color:var(--fg); text-decoration:none; margin-right:8px; }
header form { display:flex; gap:6px; }
header input { width:260px; padding:5px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--fg); }
button, .btn { padding:5px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--fg);
  cursor:pointer; text-decoration:none; font-size:13px; }
.toggle { display:inline-flex; border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-left:auto; }
.toggle a { padding:5px 12px; color:var(--fg); text-decoration:none; font-size:13px; }
.toggle a.on { background:var(--accent); color:#fff; }
.layout { display:flex; }
nav.files { width:300px; flex:none; position:sticky; top:49px; height:calc(100vh - 49px); overflow:auto; padding:12px;
  border-right:1px solid var(--border); font-size:12px; }
nav.files a { display:block; padding:3px 4px; color:var(--fg); text-decoration:none; overflow-wrap:anywhere; border-radius:4px; }
nav.files a:hover { background:var(--panel); }
nav.files .add { color:var(--add-sign); } nav.files .del { color:var(--del-sign); }
main { flex:1; min-width:0; padding:16px; }
h1 { font-size:18px; margin:0 0 12px; }
section.file { border:1px solid var(--border); border-radius:6px; margin-bottom:20px; }
section.file h2 { position:sticky; top:49px; z-index:2; margin:0; padding:8px 12px; font-size:13px; font-weight:600;
  background:var(--panel); border-bottom:1px solid var(--border); display:flex; gap:10px; align-items:center;
  border-radius:6px 6px 0 0; }
.status { font-size:11px; padding:1px 6px; border-radius:10px; border:1px solid var(--border); color:var(--muted); font-weight:500; }
.counts .add { color:var(--add-sign); } .counts .del { color:var(--del-sign); }
a.raw { margin-left:auto; font-weight:400; color:var(--accent); text-decoration:none; }
.note { color:var(--muted); padding:8px 12px; margin:0; }
table.diff { width:100%; border-collapse:collapse; font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
.diff td { padding:0 8px; vertical-align:top; }
.diff td.ln { width:1%; color:var(--muted); text-align:right; user-select:none; white-space:nowrap; }
.diff td.sign { width:1%; user-select:none; }
.diff td.code { white-space:pre-wrap; overflow-wrap:anywhere; }
.diff tr.add { background:var(--add); } .diff tr.add td.sign { color:var(--add-sign); }
.diff tr.del { background:var(--del); } .diff tr.del td.sign { color:var(--del-sign); }
.diff tbody.hidden { display:none; } .diff tbody.hidden.shown { display:table-row-group; }
.diff tr.expander td { background:var(--panel); padding:2px 8px; }
.diff tr.expander button { border:none; background:none; color:var(--accent); padding:2px; }
.hl-kw { color:var(--kw); } .hl-string { color:var(--str); } .hl-comment { color:var(--comment); font-style:italic; }
.hl-number { color:var(--num); } .hl-type { color:var(--type); } .hl-fn { color:var(--fn); } .hl-keyword { color:var(--num); }
.hl-sql { color:var(--sql); } .hl-sqlkw { color:var(--sqlkw); font-weight:600; } .hl-interp { color:var(--interp); }
.hl-raw { background:var(--raw-bg); } .hl-pipe { color:var(--pipe); font-weight:700; } .hl-op { color:var(--kw); }
dialog { max-width:760px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--fg); }
dialog table td { padding:4px 8px; vertical-align:top; } dialog code { white-space:nowrap; }
.picker input { width:100%; padding:8px; font-size:14px; margin-bottom:10px; border:1px solid var(--border); border-radius:6px;
  background:var(--bg); color:var(--fg); }
.picker a { display:block; padding:2px 4px; color:var(--fg); text-decoration:none; font:12.5px ui-monospace,monospace; }
.picker a:hover { background:var(--panel); }
.error { color:var(--del-sign); white-space:pre-wrap; }
@media (max-width: 800px) { nav.files { display:none; } header input { width:160px; } }
")

(def ^:private js "
function expand(btn){ var tb=btn.closest('tbody'); var n=tb.nextElementSibling;
  if(n && n.classList.contains('hidden')) n.classList.add('shown'); tb.remove(); }
function currentSection(){ var s=document.querySelectorAll('section.file'); for(var i=0;i<s.length;i++){ var r=s[i].getBoundingClientRect();
  if(r.bottom>60) return s[i].id; } return ''; }
function switchView(view){ var u=new URL(location.href); u.searchParams.set('view',view); u.hash=currentSection(); location.href=u.toString(); return false; }
document.addEventListener('keydown',function(e){ if(e.target.tagName==='INPUT'||e.metaKey||e.ctrlKey) return;
  if(e.key==='c'){ switchView(new URL(location.href).searchParams.get('view')==='clj'?'readable':'clj'); } });
function filterFiles(q){ q=q.toLowerCase(); document.querySelectorAll('.picker a').forEach(function(a){
  a.style.display = a.textContent.toLowerCase().indexOf(q)>=0 ? '' : 'none'; }); }
")

(defn- page [{:keys [title view]} & body]
  (str
   "<!DOCTYPE html>"
   (h/html
    [:html {:lang "en"}
     [:head
      [:meta {:charset "utf-8"}]
      [:meta {:name "viewport" :content "width=device-width, initial-scale=1"}]
      [:title (str title " · Readable Clojure")]
      [:style (hiccup.util/raw-string css)]]
     [:body
      [:header
       [:a.brand {:href "/"} "Readable Clojure"]
       [:form {:action "/pr" :method "get"}
        [:input {:name "pr" :placeholder "PR URL or number"}]
        [:button {:type "submit"} "Open PR"]]
       [:a.btn {:href "/local"} "Local changes"]
       [:a.btn {:href "/files"} "Browse files"]
       [:button {:onclick "document.getElementById('legend').showModal()"} "Legend"]
       (when view
         [:div.toggle {:title "Switch views (keyboard: c)"}
          [:a {:class (when (= view "readable") "on") :href "#" :onclick "return switchView('readable')"} "Readable"]
          [:a {:class (when (= view "clj") "on") :href "#" :onclick "return switchView('clj')"} "Clojure"]])]
      body
      [:dialog#legend
       [:h3 "How to read the readable view"]
       [:table (for [[code desc] legend] [:tr [:td [:code code]] [:td desc]])]
       [:form {:method "dialog"} [:button "Close"]]]
      [:script (hiccup.util/raw-string js)]]])))

(defn- changes-page [{:keys [title url files]} view]
  (let [files (vec (sort-by (juxt (comp not git/clojure-file? :path) :path) files))]
    (page {:title title :view view}
          [:div.layout
           [:nav.files
            (for [[i f] (map-indexed vector files)]
              [:a {:href (str "#f" i)} (:path f)])]
           [:main
            [:h1 (if url [:a {:href url} title] title)]
            (if (empty? files)
              [:p.note "No changed files."]
              (for [[i f] (map-indexed vector files)]
                (file-section i f view true)))]])))

(defn- file-page [path view]
  (let [path (or (git/repo-file path)
                 (throw (ex-info (str "Not a file in this repository: " path) {})))
        text (slurp path)]
    (page {:title path :view view}
          [:main (file-section 0 {:path path :status :file :old text :new text} view false)])))

(defn- files-page []
  (page {:title "Browse files"}
        [:main.picker
         [:h1 "Browse files"]
         [:input {:placeholder "Filter, e.g. collections/api" :oninput "filterFiles(this.value)" :autofocus true}]
         (for [p (git/tracked-clojure-files)]
           [:a {:href (str "/file?path=" (URLEncoder/encode ^String p "UTF-8"))} p])]))

(defn- error-page [e]
  (page {:title "Error"} [:main [:h1 "Something went wrong"] [:pre.error (ex-message e)]]))

;;; ------------------------------------------------ Routing ----------------------------------------------------

(defn- query-params [qs]
  (into {} (for [pair (str/split (or qs "") #"&")
                 :let [[k v] (str/split pair #"=" 2)]
                 :when (seq k)]
             [(URLDecoder/decode ^String k "UTF-8") (URLDecoder/decode ^String (or v "") "UTF-8")])))

(defn- html-response [body] {:status 200 :headers {"Content-Type" "text/html; charset=utf-8"} :body body})
(defn- redirect [loc] {:status 302 :headers {"Location" loc}})

(defn- handler* [start-path {:keys [uri query-string]}]
  (let [params (query-params query-string)
        view   (if (= "clj" (get params "view")) "clj" "readable")]
    (cond
      (= uri "/")                   (redirect start-path)
      (= uri "/pr")                 (if-let [n (git/parse-pr (get params "pr"))]
                                      (redirect (str "/pr/" n))
                                      (html-response (error-page (ex-info "That doesn't look like a PR URL or number." {}))))
      (str/starts-with? uri "/pr/") (let [n (parse-long (subs uri 4))]
                                      (html-response (changes-page (cached-changes [:pr n] #(git/pr-changes n) (get params "refresh")) view)))
      (= uri "/local")              (let [base (get params "base")]
                                      (html-response (changes-page (cached-changes [:local base] #(git/local-changes base) (get params "refresh")) view)))
      (= uri "/file")               (html-response (file-page (get params "path") view))
      (= uri "/files")              (html-response (files-page))
      :else                         {:status 404 :body "not found"})))

(defn with-big-stack
  "Run `f` on a thread with a large stack: translation recurses deeply through the interpreter, and http-kit's worker
  threads have small stacks."
  [f]
  (let [result (promise)
        t      (Thread. nil
                        ^Runnable (fn [] (deliver result (try [:ok (f)] (catch Throwable e [:error e]))))
                        "mage-readable"
                        (long (* 256 1024 1024)))]
    (.start t)
    (let [[status v] @result]
      (if (= status :ok) v (throw v)))))

(defn- handler [start-path]
  (fn [req]
    (try
      (with-big-stack #(handler* start-path req))
      (catch Throwable e
        {:status 500 :headers {"Content-Type" "text/html; charset=utf-8"}
         :body (error-page (ex-info (str (.getName (class e)) ": " (ex-message e)) {}))}))))

(defn start!
  "Start the server on `port`, open the browser at `start-path` unless `no-open?`, and block."
  [{:keys [port start-path no-open?]}]
  ;; localhost only: the server can show any file in the repo
  (http/run-server (handler start-path) {:ip "127.0.0.1" :port port})
  (let [url (str "http://localhost:" port start-path)]
    (println (str "Readable Clojure viewer running at " url "  (Ctrl-C to stop)"))
    (when-not no-open?
      (try (process/shell {:continue true} (if (str/includes? (System/getProperty "os.name") "Mac") "open" "xdg-open") url)
           (catch Exception _ nil))))
  @(promise))
