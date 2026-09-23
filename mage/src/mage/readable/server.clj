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
  "{:text readable-text, :rows [clojure-line per readable line]} for Clojure `source`, or nil if it can't be
  translated."
  [source]
  (when source
    (cached [:translate source] #(try (readable/translate-with-source-map source) (catch Throwable _ nil)))))

(defn- plain-lines
  "HTML-escaped lines for files we don't highlight."
  [text]
  (map hl/escape (str/split-lines (or text ""))))

;;; ------------------------------------------------ Threads -----------------------------------------------------

(def ^:private big-stack-bytes
  "Translation recurses deeply through the interpreter, and http-kit's worker threads have small stacks."
  (long (* 256 1024 1024)))

(defn parallel-map
  "Like `mapv`, but runs `f` on each item concurrently (at most one thread per CPU), on threads with large stacks.
  Rethrows the first error."
  [f coll]
  (let [sem     (java.util.concurrent.Semaphore. (.availableProcessors (Runtime/getRuntime)))
        results (mapv (fn [item]
                        (let [result (promise)]
                          (.start (Thread. nil
                                           ^Runnable (fn []
                                                       (.acquire sem)
                                                       (try
                                                         (deliver result [:ok (f item)])
                                                         (catch Throwable e (deliver result [:error e]))
                                                         (finally (.release sem))))
                                           "mage-readable"
                                           big-stack-bytes))
                          result))
                      coll)]
    (mapv (fn [result] (let [[status v] @result] (if (= status :ok) v (throw v)))) results)))

(defn with-big-stack
  "Run `f` on a thread with a large stack and return its result."
  [f]
  (first (parallel-map (fn [_] (f)) [nil])))

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

(defn- row-html
  "One diff row. `data-n`/`data-o` hold the Clojure source line on the new/old side, in both views, so toggling a
  file between views can scroll to the same source line; `id` is a linkable anchor (`#f3-n57`)."
  [{:keys [type old new old-src new-src]} html-line anchor-id]
  [:tr (cond-> {:class (name type)}
         new-src   (assoc :data-n new-src)
         old-src   (assoc :data-o old-src)
         anchor-id (assoc :id anchor-id))
   [:td.ln (or old "")]
   [:td.ln (or new "")]
   [:td.sign (case type :add "+" :del "−" " ")]
   [:td.code (hiccup.util/raw-string (if (str/blank? html-line) "&#8203;" html-line))]])

(defn- readable-file? [path]
  (and (git/clojure-file? path) (not (str/ends-with? path ".edn"))))

(defn- file-rows
  "Diff rows (with the Clojure source line of each side) plus per-row highlighted HTML for one file in `view`."
  [{:keys [old new path]} view]
  (let [clj?      (git/clojure-file? path)
        readable? (and (= view "readable") (readable-file? path))
        o         (when readable? (translate old))
        n         (when readable? (translate new))
        ok?       (and readable? (or (nil? old) o) (or (nil? new) n))
        [old-t new-t] (if ok? [(:text o) (:text n)] [old new])
        ;; readable line -> Clojure line via the source map; in the Clojure view they're the same line
        src-line  (fn [translated line] (if ok? (get (:rows translated) (dec line)) line))
        [lang hl-fn] (cond
                       ok?   [:readable hl/readable-lines]
                       clj?  [:clojure hl/clojure-lines]
                       :else [:plain plain-lines])
        hl-cached (fn [t] (cached [:hl lang t] #(vec (hl-fn (or t "")))))
        old-html  (hl-cached old-t)
        new-html  (hl-cached new-t)
        rows      (mapv (fn [r]
                          (cond-> r
                            (:old r) (assoc :old-src (src-line o (:old r)))
                            (:new r) (assoc :new-src (src-line n (:new r)))))
                        (diff/diff-rows old-t new-t))]
    {:rows       rows
     :fallback?  (and readable? (not ok?))
     :html-for   (fn [{:keys [type old new]}]
                   (if (= type :del) (get old-html (dec old) "") (get new-html (dec new) "")))}))

(declare clojure-file-body)

(defn- not-shown-note
  "Why a file's contents aren't shown (only Clojure is), or nil for Clojure files."
  [path]
  (cond
    (git/clojure-file? path)    nil
    (git/typescript-file? path) "You know how TypeScript works."
    :else                       "Not clojure"))

(defn- file-body
  "The part of a file's section that changes when it's toggled between views."
  [idx file view collapse?]
  (if-let [note (not-shown-note (:path file))]
    [:div.file-body [:p.note note]]
    (clojure-file-body idx file view collapse?)))

(defn- clojure-file-body
  "Diff table for a Clojure file in `view`."
  [idx file view collapse?]
  (let [{:keys [rows fallback? html-for]} (file-rows file view)
        seen      (volatile! #{})
        anchor-id (fn [{:keys [new-src old-src]}]
                    (let [id (cond new-src (str "f" idx "-n" new-src)
                                   old-src (str "f" idx "-o" old-src))]
                      (when (and id (not (@seen id)))
                        (vswap! seen conj id)
                        id)))
        row       (fn [r] (row-html r (html-for r) (anchor-id r)))]
    [:div.file-body
     (when fallback? [:p.note "This file couldn't be translated, so it's shown as Clojure."])
     (if (empty? rows)
       [:p.note "(empty)"]
       [:table.diff
        (for [[kind rs] (collapse rows collapse?)]
          (if (= kind :rows)
            [:tbody (doall (map row rs))]
            (list
             [:tbody [:tr.expander [:td {:colspan 4} [:button {:onclick "expand(this)"} (str "⋯ " (count rs) " unchanged lines")]]]]
             [:tbody.hidden (doall (map row rs))])))])]))

(defn- file-section [idx file view collapse?]
  (let [{:keys [add del]} (if (not-shown-note (:path file)) {:add 0 :del 0} (diff/stats (diff/diff-rows (:old file) (:new file))))]
    [:section.file {:id (str "f" idx) :data-index idx :data-view view}
     [:h2 [:span.status {:class (name (:status file :modified))} (name (:status file :modified))]
      [:span.path (:path file)]
      (when (or (pos? add) (pos? del))
        [:span.counts [:span.add (str "+" add)] " " [:span.del (str "−" del)]])
      [:span.spacer]
      (when (readable-file? (:path file))
        [:span.toggle {:title "Switch this file between views (keyboard: c)"}
         (for [[v label] [["readable" "Readable"] ["clj" "Clojure"]]]
           [:button {:type "button" :data-view v :class (when (= v view) "on") :onclick (str "toggleFile(this,'" v "')")}
            label])])
      (when-not (or (= :file (:status file)) (not-shown-note (:path file)))
        [:a.raw {:href (str "/file?path=" (URLEncoder/encode ^String (:path file) "UTF-8") "&view=" view)} "full file"])]
     (file-body idx file view collapse?)]))

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
.toggle { display:inline-flex; border:1px solid var(--border); border-radius:6px; overflow:hidden; }
.toggle button { padding:2px 10px; border:none; border-radius:0; font-size:12px; font-weight:500; }
.toggle button.on { background:var(--accent); color:#fff; }
.spacer { margin-left:auto; }
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
a.raw { font-weight:400; color:var(--accent); text-decoration:none; }
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
function reveal(row){ var hb=row.closest('tbody.hidden'); if(hb && !hb.classList.contains('shown')){
  var ex=hb.previousElementSibling; if(ex && ex.querySelector('.expander')) ex.remove(); hb.classList.add('shown'); } }
function headerBottom(sec){ return document.querySelector('header').offsetHeight + sec.querySelector('h2').offsetHeight; }
function anchorRow(sec){ var top=headerBottom(sec), rows=sec.querySelectorAll('tr[data-n],tr[data-o]');
  for(var i=0;i<rows.length;i++){ var r=rows[i]; if(r.offsetParent && r.getBoundingClientRect().bottom>top) return r; } return null; }
function findRow(sec, side, src){ var best=null, bestSrc=-1, first=null;
  sec.querySelectorAll('tr[data-'+side+']').forEach(function(r){ var s=+r.getAttribute('data-'+side);
    if(!first) first=r; if(s<=src && s>bestSrc){ best=r; bestSrc=s; } });
  return best||first; }
async function toggleFile(btn, view){
  var sec=btn.closest('section.file'); if(sec.dataset.view===view) return;
  var a=anchorRow(sec), side=null, src=null, offset=null;
  if(a){ side=a.hasAttribute('data-n')?'n':'o'; src=+a.getAttribute('data-'+side); offset=a.getBoundingClientRect().top; }
  var u=new URL(location.href); u.searchParams.delete('refresh'); u.searchParams.delete('view');
  var res=await fetch('/fragment?i='+sec.dataset.index+'&view='+view+'&src='+encodeURIComponent(u.pathname+u.search));
  sec.querySelector('.file-body').outerHTML=await res.text();
  sec.dataset.view=view;
  sec.querySelectorAll('.toggle button').forEach(function(b){ b.classList.toggle('on', b.dataset.view===view); });
  if(a){ var t=findRow(sec, side, src); if(t){ reveal(t); window.scrollBy(0, t.getBoundingClientRect().top-offset); } } }
function currentSection(){ var s=document.querySelectorAll('section.file'); for(var i=0;i<s.length;i++){
  if(s[i].getBoundingClientRect().bottom>80) return s[i]; } return null; }
document.addEventListener('keydown',function(e){ if(e.target.tagName==='INPUT'||e.metaKey||e.ctrlKey||e.altKey) return;
  if(e.key==='c'){ var sec=currentSection(); var b=sec && sec.querySelector('.toggle button:not(.on)'); if(b) b.click(); } });
window.addEventListener('load',function(){ if(location.hash.length>1){ var t=document.getElementById(location.hash.slice(1));
  if(t && t.tagName==='TR'){ reveal(t); t.scrollIntoView(); window.scrollBy(0,-120); } } });
function filterFiles(q){ q=q.toLowerCase(); document.querySelectorAll('.picker a').forEach(function(a){
  a.style.display = a.textContent.toLowerCase().indexOf(q)>=0 ? '' : 'none'; }); }
")

(defn- page [{:keys [title]} & body]
  (str
   "<!DOCTYPE html>"
   (h/html
    [:html {:lang "en"}
     [:head
      [:meta {:charset "utf-8"}]
      [:meta {:name "viewport" :content "width=device-width, initial-scale=1"}]
      [:title (str title " · Readable Clojure")]
      [:link {:rel "icon" :href "data:,"}]
      [:style (hiccup.util/raw-string css)]]
     [:body
      [:header
       [:a.brand {:href "/"} "Readable Clojure"]
       [:form {:action "/open" :method "get"}
        [:input {:name "q" :placeholder "PR number, PR URL, or branch"}]
        [:button {:type "submit"} "Open"]]
       [:a.btn {:href "/local"} "Local changes"]
       [:a.btn {:href "/files"} "Browse files"]
       [:button {:onclick "document.getElementById('legend').showModal()"} "Legend"]]
      body
      [:dialog#legend
       [:h3 "How to read the readable view"]
       [:table (for [[code desc] legend] [:tr [:td [:code code]] [:td desc]])]
       [:form {:method "dialog"} [:button "Close"]]]
      [:script (hiccup.util/raw-string js)]]])))

(defn- sort-files [files]
  (vec (sort-by (juxt (comp not git/clojure-file? :path) :path) files)))

(defn- changes-page [{:keys [title url files]} view]
  (page {:title title}
        [:div.layout
         [:nav.files
          (for [[i f] (map-indexed vector files)]
            [:a {:href (str "#f" i)} (:path f)])]
         [:main
          [:h1 (if url [:a {:href url} title] title)]
          (if (empty? files)
            [:p.note "No changed files."]
            ;; files are independent, so translate/diff/highlight them concurrently
            ;; (a seq, not a vector: hiccup would read a vector as an element)
            (seq (parallel-map (fn [[i f]] (file-section i f view true)) (map-indexed vector files))))]]))

(defn- file-page [{:keys [title files]} view]
  (page {:title title}
        [:main (file-section 0 (first files) view false)]))

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

(defn- page-data
  "The files shown by the page at `uri`/`params` (PR, branch, local changes or a single file), in display order."
  [uri params]
  (let [refresh? (get params "refresh")
        changes  (fn [k f] (update (cached-changes k f refresh?) :files sort-files))]
    (cond
      (str/starts-with? uri "/pr/") (let [n (parse-long (subs uri 4))]
                                      (changes [:pr n] #(git/pr-changes n)))
      (= uri "/branch")             (let [nm (get params "name") base (get params "base")]
                                      (changes [:branch nm base] #(git/branch-changes nm base)))
      (= uri "/local")              (let [base (get params "base")]
                                      (changes [:local base] #(git/local-changes base)))
      (= uri "/file")               (let [path (or (git/repo-file (get params "path"))
                                                   (throw (ex-info (str "Not a file in this repository: " (get params "path")) {})))
                                          text (slurp path)]
                                      {:title path :single? true
                                       :files [{:path path :status :file :old text :new text}]}))))

(defn- fragment
  "One file's body in `view`, for toggling a single file without reloading the page."
  [params view]
  (let [src    (java.net.URI. (get params "src" "/"))
        data   (page-data (.getPath src) (query-params (.getRawQuery src)))
        idx    (parse-long (get params "i" "0"))
        file   (or (get (:files data) idx) (throw (ex-info "No such file on that page." {})))]
    (str (h/html (file-body idx file view (not (:single? data)))))))

(defn- handler* [start-path {:keys [uri query-string]}]
  (let [params (query-params query-string)
        view   (if (= "clj" (get params "view")) "clj" "readable")]
    (cond
      (= uri "/")                   (redirect start-path)
      (= uri "/open")               (let [q (str/trim (get params "q" ""))]
                                      (cond
                                        (git/parse-pr q)       (redirect (str "/pr/" (git/parse-pr q)))
                                        (git/resolve-branch q) (redirect (str "/branch?name=" (URLEncoder/encode q "UTF-8")))
                                        :else                  (html-response (error-page (ex-info (str "\"" q "\" isn't a PR number, a PR URL, or a branch in this repository.") {})))))
      (= uri "/pr")                 (redirect (str "/open?q=" (URLEncoder/encode ^String (get params "pr" "") "UTF-8")))
      (= uri "/fragment")           (html-response (fragment params view))
      (= uri "/file")               (html-response (file-page (page-data uri params) view))
      (#{"/branch" "/local"} uri)   (html-response (changes-page (page-data uri params) view))
      (str/starts-with? uri "/pr/") (html-response (changes-page (page-data uri params) view))
      (= uri "/files")              (html-response (files-page))
      :else                         {:status 404 :body "not found"})))

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
