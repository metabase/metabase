(ns metabase-enterprise.custom-viz-plugin.js-validate-test
  "Tests for the headless GraalJS validation harness that exercises Metabot-generated
   custom visualization factories before they are persisted."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.js-validate :as js-validate]))

(set! *warn-on-reflection* true)

(defn- wrap
  "Wrap a bare factory expression the way the create tool's `plugin-bundle-js` does:
   assign it to `globalThis.__customVizPlugin__`."
  [factory-js]
  (str "globalThis.__customVizPlugin__ = (" factory-js ");"))

(defn- validate [factory-js]
  (js-validate/run-validation (wrap factory-js) (js-validate/generic-sample {})))

(def ^:private good-factory
  "function () {
     return {
       id: 'ok', getName: function () { return 'OK'; },
       checkRenderable: function (series) { if (!series.length) throw new Error('no series'); },
       settings: { label: { id: 'label', title: 'Label', widget: 'input' } },
       mount: function (container, initialProps) {
         var props = initialProps;
         function render() {
           container.innerHTML = '';
           var root = document.createElement('div');
           root.textContent = String(props.series[0].data.rows.length);
           container.appendChild(root);
         }
         render();
         return { update: function (p) { props = p; render(); }, unmount: function () { container.innerHTML = ''; } };
       }
     };
   }")

(deftest valid-factory-passes-test
  (testing "a well-formed factory passes validation"
    (is (= {:ok true :renderable-error nil} (validate good-factory)))))

(deftest validation-uses-metabot-inline-render-size-test
  (testing "validation exercises the first inline Metabot render size"
    (is (:ok (validate "function () {
                         return { id: 'size', getName: function () { return 'Size'; },
                           mount: function (container, props) {
                             if (props.width !== 864 || props.height !== 384) {
                               throw new Error('expected 864x384, got ' + props.width + 'x' + props.height);
                             }
                             return { update: function () {}, unmount: function () {} };
                           } };
                       }")))))

(deftest realistic-factories-pass-test
  (testing "an SVG bar chart that reads cols/rows, sizing, color scheme and wires onClick passes"
    (let [svg "function () {
                 var SVG = 'http://www.w3.org/2000/svg';
                 return { id: 'bars', getName: function () { return 'Bars'; },
                   mount: function (container, initialProps) {
                     var props = initialProps;
                     function render() {
                       while (container.firstChild) container.removeChild(container.firstChild);
                       var w = props.width || 400, h = props.height || 300;
                       var rows = props.series[0].data.rows;
                       var max = Math.max.apply(null, rows.map(function (r) { return Number(r[1]) || 0; }));
                       var svg = document.createElementNS(SVG, 'svg');
                       svg.setAttribute('width', w); svg.setAttribute('height', h);
                       rows.forEach(function (row, i) {
                         var rect = document.createElementNS(SVG, 'rect');
                         rect.setAttribute('height', max ? (Number(row[1]) / max) * h : 0);
                         rect.setAttribute('fill', props.colorScheme === 'dark' ? '#fff' : '#509ee3');
                         rect.addEventListener('click', function () { props.onClick({ value: row[1] }); });
                         svg.appendChild(rect);
                       });
                       container.appendChild(svg);
                     }
                     render();
                     return { update: function (p) { props = p; render(); },
                              unmount: function () { while (container.firstChild) container.removeChild(container.firstChild); } };
                   } };
               }"]
      (is (:ok (validate svg)))))
  (testing "a canvas chart that uses getContext('2d') and measureText passes"
    (let [canvas "function () {
                    return { id: 'c', getName: function () { return 'C'; },
                      mount: function (container, props) {
                        var canvas = document.createElement('canvas');
                        var ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#509ee3';
                        props.series[0].data.rows.forEach(function (r, i) { ctx.fillRect(i * 30, 0, 20, Number(r[1]) || 0); });
                        var m = ctx.measureText('hi');
                        var d = document.createElement('div'); d.style.width = m.width + 'px';
                        container.appendChild(canvas); container.appendChild(d);
                        return { update: function () {}, unmount: function () { container.innerHTML = ''; } };
                      } };
                  }"]
      (is (:ok (validate canvas)))))
  (testing "a factory that uses __METABASE_VIZ_API__.columnTypes and formatValue passes"
    (let [ct "function () {
                return { id: 'ct', getName: function () { return 'CT'; },
                  mount: function (container, props) {
                    var api = globalThis.__METABASE_VIZ_API__;
                    var cols = props.series[0].data.cols;
                    var idx = cols.findIndex(function (c) { return api.columnTypes.isNumeric(c); });
                    var total = props.series[0].data.rows.reduce(function (a, r) { return a + (Number(r[idx]) || 0); }, 0);
                    var el = document.createElement('div'); el.textContent = api.formatValue(total);
                    container.appendChild(el);
                    return { update: function () {}, unmount: function () { container.innerHTML = ''; } };
                  } };
              }"]
      (is (:ok (validate ct))))))

(deftest syntax-error-is-caught-test
  (testing "a syntax error in factory_js is reported with stage=syntax"
    (let [{:keys [ok stage error]} (validate "function () { return { mount: function (c, p) { var x = ; } }; }")]
      (is (false? ok))
      (is (= "syntax" stage))
      (is (re-find #"(?i)syntax" error)))))

(deftest non-function-is-caught-test
  (testing "a bundle whose __customVizPlugin__ is not a function fails at stage=factory"
    (let [result (js-validate/run-validation "globalThis.__customVizPlugin__ = { not: 'a function' };"
                                             (js-validate/generic-sample {}))]
      (is (false? (:ok result)))
      (is (= "factory" (:stage result))))))

(deftest factory-throw-is-caught-test
  (testing "a factory that throws when called fails at stage=factory-call"
    (let [{:keys [ok stage error]} (validate "function () { throw new Error('boom in factory'); }")]
      (is (false? ok))
      (is (= "factory-call" stage))
      (is (re-find #"boom in factory" error)))))

(deftest missing-mount-is-caught-test
  (testing "a definition without a mount function fails at stage=definition"
    (let [{:keys [ok stage error]} (validate "function () { return { id: 'x', getName: function () { return 'X'; } }; }")]
      (is (false? ok))
      (is (= "definition" stage))
      (is (re-find #"mount" error)))))

(deftest bad-widget-is-caught-test
  (testing "an unsupported setting widget fails at stage=settings and lists the allowed widgets"
    (let [{:keys [ok stage error]}
          (validate "function (p) { return { id: 'x', getName: function () { return 'X'; },
                       settings: { foo: { id: 'foo', title: 'Foo', widget: 'slider' } },
                       mount: function (c, q) { return { update: function () {}, unmount: function () {} }; } }; }")]
      (is (false? ok))
      (is (= "settings" stage))
      (is (re-find #"slider" error))
      (is (re-find #"segmentedControl" error)))))

(deftest mount-runtime-error-is-caught-test
  (testing "a runtime error thrown inside mount fails at stage=mount"
    (let [{:keys [ok stage error]}
          (validate "function () { return { id: 'x', getName: function () { return 'X'; },
                       mount: function (container, props) { return props.series[0].data.rows[0].nope.boom; } }; }")]
      (is (false? ok))
      (is (= "mount" stage))
      (is (re-find #"(?i)mount" error)))))

(deftest mount-handle-shape-is-checked-test
  (testing "mount must return an object with update and unmount"
    (let [{:keys [ok stage]}
          (validate "function () { return { id: 'x', getName: function () { return 'X'; },
                       mount: function (container, props) { var d = document.createElement('div'); container.appendChild(d); return null; } }; }")]
      (is (false? ok))
      (is (= "mount-handle" stage)))))

(deftest checkRenderable-throw-is-soft-test
  (testing "checkRenderable throwing on the sample data does not fail validation; it is surfaced softly"
    (let [{:keys [ok renderable-error]}
          (validate "function () { return { id: 'x', getName: function () { return 'X'; },
                       checkRenderable: function () { throw new Error('needs special data'); },
                       mount: function (c, p) { var d = document.createElement('div'); c.appendChild(d); return { update: function () {}, unmount: function () {} }; } }; }")]
      (is (true? ok))
      (is (re-find #"needs special data" renderable-error)))))
