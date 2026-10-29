/*! For license information please see useberry-script.js.LICENSE.txt */
var useberryLive;
(() => {
  var e = {
      168(e, t, n) {
        var r;
        !(function (o, i, a, s) {
          "use strict";
          var l,
            u = ["", "webkit", "Moz", "MS", "ms", "o"],
            c = i.createElement("div"),
            d = Math.round,
            h = Math.abs,
            p = Date.now;
          function f(e, t, n) {
            return setTimeout(S(e, n), t);
          }
          function m(e, t, n) {
            return !!Array.isArray(e) && (v(e, n[t], n), !0);
          }
          function v(e, t, n) {
            var r;
            if (e)
              if (e.forEach) e.forEach(t, n);
              else if (e.length !== s)
                for (r = 0; r < e.length; ) (t.call(n, e[r], r, e), r++);
              else for (r in e) e.hasOwnProperty(r) && t.call(n, e[r], r, e);
          }
          function y(e, t, n) {
            var r = "DEPRECATED METHOD: " + t + "\n" + n + " AT \n";
            return function () {
              var t = new Error("get-stack-trace"),
                n =
                  t && t.stack
                    ? t.stack
                        .replace(/^[^\(]+?[\n$]/gm, "")
                        .replace(/^\s+at\s+/gm, "")
                        .replace(/^Object.<anonymous>\s*\(/gm, "{anonymous}()@")
                    : "Unknown Stack Trace",
                i = o.console && (o.console.warn || o.console.log);
              return (i && i.call(o.console, r, n), e.apply(this, arguments));
            };
          }
          l =
            "function" != typeof Object.assign
              ? function (e) {
                  if (e === s || null === e)
                    throw new TypeError(
                      "Cannot convert undefined or null to object",
                    );
                  for (var t = Object(e), n = 1; n < arguments.length; n++) {
                    var r = arguments[n];
                    if (r !== s && null !== r)
                      for (var o in r) r.hasOwnProperty(o) && (t[o] = r[o]);
                  }
                  return t;
                }
              : Object.assign;
          var g = y(
              function (e, t, n) {
                for (var r = Object.keys(t), o = 0; o < r.length; )
                  ((!n || (n && e[r[o]] === s)) && (e[r[o]] = t[r[o]]), o++);
                return e;
              },
              "extend",
              "Use `assign`.",
            ),
            b = y(
              function (e, t) {
                return g(e, t, !0);
              },
              "merge",
              "Use `assign`.",
            );
          function T(e, t, n) {
            var r,
              o = t.prototype;
            (((r = e.prototype = Object.create(o)).constructor = e),
              (r._super = o),
              n && l(r, n));
          }
          function S(e, t) {
            return function () {
              return e.apply(t, arguments);
            };
          }
          function E(e, t) {
            return "function" == typeof e ? e.apply((t && t[0]) || s, t) : e;
          }
          function C(e, t) {
            return e === s ? t : e;
          }
          function k(e, t, n) {
            v(_(t), function (t) {
              e.addEventListener(t, n, !1);
            });
          }
          function w(e, t, n) {
            v(_(t), function (t) {
              e.removeEventListener(t, n, !1);
            });
          }
          function I(e, t) {
            for (; e; ) {
              if (e == t) return !0;
              e = e.parentNode;
            }
            return !1;
          }
          function x(e, t) {
            return e.indexOf(t) > -1;
          }
          function _(e) {
            return e.trim().split(/\s+/g);
          }
          function N(e, t, n) {
            if (e.indexOf && !n) return e.indexOf(t);
            for (var r = 0; r < e.length; ) {
              if ((n && e[r][n] == t) || (!n && e[r] === t)) return r;
              r++;
            }
            return -1;
          }
          function M(e) {
            return Array.prototype.slice.call(e, 0);
          }
          function O(e, t, n) {
            for (var r = [], o = [], i = 0; i < e.length; ) {
              var a = t ? e[i][t] : e[i];
              (N(o, a) < 0 && r.push(e[i]), (o[i] = a), i++);
            }
            return (
              n &&
                (r = t
                  ? r.sort(function (e, n) {
                      return e[t] > n[t];
                    })
                  : r.sort()),
              r
            );
          }
          function R(e, t) {
            for (
              var n, r, o = t[0].toUpperCase() + t.slice(1), i = 0;
              i < u.length;
            ) {
              if ((r = (n = u[i]) ? n + o : t) in e) return r;
              i++;
            }
            return s;
          }
          var D = 1;
          function A(e) {
            var t = e.ownerDocument || e;
            return t.defaultView || t.parentWindow || o;
          }
          var L = "ontouchstart" in o,
            F = R(o, "PointerEvent") !== s,
            P =
              L &&
              /mobile|tablet|ip(ad|hone|od)|android/i.test(navigator.userAgent),
            U = "touch",
            z = "mouse",
            B = ["x", "y"],
            q = ["clientX", "clientY"];
          function Y(e, t) {
            var n = this;
            ((this.manager = e),
              (this.callback = t),
              (this.element = e.element),
              (this.target = e.options.inputTarget),
              (this.domHandler = function (t) {
                E(e.options.enable, [e]) && n.handler(t);
              }),
              this.init());
          }
          function H(e, t, n) {
            var r = n.pointers.length,
              o = n.changedPointers.length,
              i = 1 & t && r - o === 0,
              a = 12 & t && r - o === 0;
            ((n.isFirst = !!i),
              (n.isFinal = !!a),
              i && (e.session = {}),
              (n.eventType = t),
              (function (e, t) {
                var n = e.session,
                  r = t.pointers,
                  o = r.length;
                (n.firstInput || (n.firstInput = W(t)),
                  o > 1 && !n.firstMultiple
                    ? (n.firstMultiple = W(t))
                    : 1 === o && (n.firstMultiple = !1));
                var i = n.firstInput,
                  a = n.firstMultiple,
                  l = a ? a.center : i.center,
                  u = (t.center = V(r));
                ((t.timeStamp = p()),
                  (t.deltaTime = t.timeStamp - i.timeStamp),
                  (t.angle = K(l, u)),
                  (t.distance = j(l, u)),
                  (function (e, t) {
                    var n = t.center,
                      r = e.offsetDelta || {},
                      o = e.prevDelta || {},
                      i = e.prevInput || {};
                    ((1 !== t.eventType && 4 !== i.eventType) ||
                      ((o = e.prevDelta =
                        { x: i.deltaX || 0, y: i.deltaY || 0 }),
                      (r = e.offsetDelta = { x: n.x, y: n.y })),
                      (t.deltaX = o.x + (n.x - r.x)),
                      (t.deltaY = o.y + (n.y - r.y)));
                  })(n, t),
                  (t.offsetDirection = G(t.deltaX, t.deltaY)));
                var c,
                  d,
                  f = X(t.deltaTime, t.deltaX, t.deltaY);
                ((t.overallVelocityX = f.x),
                  (t.overallVelocityY = f.y),
                  (t.overallVelocity = h(f.x) > h(f.y) ? f.x : f.y),
                  (t.scale = a
                    ? ((c = a.pointers),
                      j((d = r)[0], d[1], q) / j(c[0], c[1], q))
                    : 1),
                  (t.rotation = a
                    ? (function (e, t) {
                        return K(t[1], t[0], q) + K(e[1], e[0], q);
                      })(a.pointers, r)
                    : 0),
                  (t.maxPointers = n.prevInput
                    ? t.pointers.length > n.prevInput.maxPointers
                      ? t.pointers.length
                      : n.prevInput.maxPointers
                    : t.pointers.length),
                  (function (e, t) {
                    var n,
                      r,
                      o,
                      i,
                      a = e.lastInterval || t,
                      l = t.timeStamp - a.timeStamp;
                    if (8 != t.eventType && (l > 25 || a.velocity === s)) {
                      var u = t.deltaX - a.deltaX,
                        c = t.deltaY - a.deltaY,
                        d = X(l, u, c);
                      ((r = d.x),
                        (o = d.y),
                        (n = h(d.x) > h(d.y) ? d.x : d.y),
                        (i = G(u, c)),
                        (e.lastInterval = t));
                    } else
                      ((n = a.velocity),
                        (r = a.velocityX),
                        (o = a.velocityY),
                        (i = a.direction));
                    ((t.velocity = n),
                      (t.velocityX = r),
                      (t.velocityY = o),
                      (t.direction = i));
                  })(n, t));
                var m = e.element;
                (I(t.srcEvent.target, m) && (m = t.srcEvent.target),
                  (t.target = m));
              })(e, n),
              e.emit("hammer.input", n),
              e.recognize(n),
              (e.session.prevInput = n));
          }
          function W(e) {
            for (var t = [], n = 0; n < e.pointers.length; )
              ((t[n] = {
                clientX: d(e.pointers[n].clientX),
                clientY: d(e.pointers[n].clientY),
              }),
                n++);
            return {
              timeStamp: p(),
              pointers: t,
              center: V(t),
              deltaX: e.deltaX,
              deltaY: e.deltaY,
            };
          }
          function V(e) {
            var t = e.length;
            if (1 === t) return { x: d(e[0].clientX), y: d(e[0].clientY) };
            for (var n = 0, r = 0, o = 0; o < t; )
              ((n += e[o].clientX), (r += e[o].clientY), o++);
            return { x: d(n / t), y: d(r / t) };
          }
          function X(e, t, n) {
            return { x: t / e || 0, y: n / e || 0 };
          }
          function G(e, t) {
            return e === t
              ? 1
              : h(e) >= h(t)
                ? e < 0
                  ? 2
                  : 4
                : t < 0
                  ? 8
                  : 16;
          }
          function j(e, t, n) {
            n || (n = B);
            var r = t[n[0]] - e[n[0]],
              o = t[n[1]] - e[n[1]];
            return Math.sqrt(r * r + o * o);
          }
          function K(e, t, n) {
            n || (n = B);
            var r = t[n[0]] - e[n[0]],
              o = t[n[1]] - e[n[1]];
            return (180 * Math.atan2(o, r)) / Math.PI;
          }
          Y.prototype = {
            handler: function () {},
            init: function () {
              (this.evEl && k(this.element, this.evEl, this.domHandler),
                this.evTarget && k(this.target, this.evTarget, this.domHandler),
                this.evWin && k(A(this.element), this.evWin, this.domHandler));
            },
            destroy: function () {
              (this.evEl && w(this.element, this.evEl, this.domHandler),
                this.evTarget && w(this.target, this.evTarget, this.domHandler),
                this.evWin && w(A(this.element), this.evWin, this.domHandler));
            },
          };
          var $ = { mousedown: 1, mousemove: 2, mouseup: 4 };
          function Z() {
            ((this.evEl = "mousedown"),
              (this.evWin = "mousemove mouseup"),
              (this.pressed = !1),
              Y.apply(this, arguments));
          }
          T(Z, Y, {
            handler: function (e) {
              var t = $[e.type];
              (1 & t && 0 === e.button && (this.pressed = !0),
                2 & t && 1 !== e.which && (t = 4),
                this.pressed &&
                  (4 & t && (this.pressed = !1),
                  this.callback(this.manager, t, {
                    pointers: [e],
                    changedPointers: [e],
                    pointerType: z,
                    srcEvent: e,
                  })));
            },
          });
          var J = {
              pointerdown: 1,
              pointermove: 2,
              pointerup: 4,
              pointercancel: 8,
              pointerout: 8,
            },
            Q = { 2: U, 3: "pen", 4: z, 5: "kinect" },
            ee = "pointerdown",
            te = "pointermove pointerup pointercancel";
          function ne() {
            ((this.evEl = ee),
              (this.evWin = te),
              Y.apply(this, arguments),
              (this.store = this.manager.session.pointerEvents = []));
          }
          (o.MSPointerEvent &&
            !o.PointerEvent &&
            ((ee = "MSPointerDown"),
            (te = "MSPointerMove MSPointerUp MSPointerCancel")),
            T(ne, Y, {
              handler: function (e) {
                var t = this.store,
                  n = !1,
                  r = e.type.toLowerCase().replace("ms", ""),
                  o = J[r],
                  i = Q[e.pointerType] || e.pointerType,
                  a = i == U,
                  s = N(t, e.pointerId, "pointerId");
                (1 & o && (0 === e.button || a)
                  ? s < 0 && (t.push(e), (s = t.length - 1))
                  : 12 & o && (n = !0),
                  s < 0 ||
                    ((t[s] = e),
                    this.callback(this.manager, o, {
                      pointers: t,
                      changedPointers: [e],
                      pointerType: i,
                      srcEvent: e,
                    }),
                    n && t.splice(s, 1)));
              },
            }));
          var re = { touchstart: 1, touchmove: 2, touchend: 4, touchcancel: 8 };
          function oe() {
            ((this.evTarget = "touchstart"),
              (this.evWin = "touchstart touchmove touchend touchcancel"),
              (this.started = !1),
              Y.apply(this, arguments));
          }
          function ie(e, t) {
            var n = M(e.touches),
              r = M(e.changedTouches);
            return (12 & t && (n = O(n.concat(r), "identifier", !0)), [n, r]);
          }
          T(oe, Y, {
            handler: function (e) {
              var t = re[e.type];
              if ((1 === t && (this.started = !0), this.started)) {
                var n = ie.call(this, e, t);
                (12 & t &&
                  n[0].length - n[1].length === 0 &&
                  (this.started = !1),
                  this.callback(this.manager, t, {
                    pointers: n[0],
                    changedPointers: n[1],
                    pointerType: U,
                    srcEvent: e,
                  }));
              }
            },
          });
          var ae = { touchstart: 1, touchmove: 2, touchend: 4, touchcancel: 8 };
          function se() {
            ((this.evTarget = "touchstart touchmove touchend touchcancel"),
              (this.targetIds = {}),
              Y.apply(this, arguments));
          }
          function le(e, t) {
            var n = M(e.touches),
              r = this.targetIds;
            if (3 & t && 1 === n.length)
              return ((r[n[0].identifier] = !0), [n, n]);
            var o,
              i,
              a = M(e.changedTouches),
              s = [],
              l = this.target;
            if (
              ((i = n.filter(function (e) {
                return I(e.target, l);
              })),
              1 === t)
            )
              for (o = 0; o < i.length; ) ((r[i[o].identifier] = !0), o++);
            for (o = 0; o < a.length; )
              (r[a[o].identifier] && s.push(a[o]),
                12 & t && delete r[a[o].identifier],
                o++);
            return s.length ? [O(i.concat(s), "identifier", !0), s] : void 0;
          }
          function ue() {
            Y.apply(this, arguments);
            var e = S(this.handler, this);
            ((this.touch = new se(this.manager, e)),
              (this.mouse = new Z(this.manager, e)),
              (this.primaryTouch = null),
              (this.lastTouches = []));
          }
          function ce(e, t) {
            1 & e
              ? ((this.primaryTouch = t.changedPointers[0].identifier),
                de.call(this, t))
              : 12 & e && de.call(this, t);
          }
          function de(e) {
            var t = e.changedPointers[0];
            if (t.identifier === this.primaryTouch) {
              var n = { x: t.clientX, y: t.clientY };
              this.lastTouches.push(n);
              var r = this.lastTouches;
              setTimeout(function () {
                var e = r.indexOf(n);
                e > -1 && r.splice(e, 1);
              }, 2500);
            }
          }
          function he(e) {
            for (
              var t = e.srcEvent.clientX, n = e.srcEvent.clientY, r = 0;
              r < this.lastTouches.length;
              r++
            ) {
              var o = this.lastTouches[r],
                i = Math.abs(t - o.x),
                a = Math.abs(n - o.y);
              if (i <= 25 && a <= 25) return !0;
            }
            return !1;
          }
          (T(se, Y, {
            handler: function (e) {
              var t = ae[e.type],
                n = le.call(this, e, t);
              n &&
                this.callback(this.manager, t, {
                  pointers: n[0],
                  changedPointers: n[1],
                  pointerType: U,
                  srcEvent: e,
                });
            },
          }),
            T(ue, Y, {
              handler: function (e, t, n) {
                var r = n.pointerType == U,
                  o = n.pointerType == z;
                if (
                  !(
                    o &&
                    n.sourceCapabilities &&
                    n.sourceCapabilities.firesTouchEvents
                  )
                ) {
                  if (r) ce.call(this, t, n);
                  else if (o && he.call(this, n)) return;
                  this.callback(e, t, n);
                }
              },
              destroy: function () {
                (this.touch.destroy(), this.mouse.destroy());
              },
            }));
          var pe = R(c.style, "touchAction"),
            fe = pe !== s,
            me = "compute",
            ve = "auto",
            ye = "manipulation",
            ge = "none",
            be = "pan-x",
            Te = "pan-y",
            Se = (function () {
              if (!fe) return !1;
              var e = {},
                t = o.CSS && o.CSS.supports;
              return (
                [
                  "auto",
                  "manipulation",
                  "pan-y",
                  "pan-x",
                  "pan-x pan-y",
                  "none",
                ].forEach(function (n) {
                  e[n] = !t || o.CSS.supports("touch-action", n);
                }),
                e
              );
            })();
          function Ee(e, t) {
            ((this.manager = e), this.set(t));
          }
          Ee.prototype = {
            set: function (e) {
              (e == me && (e = this.compute()),
                fe &&
                  this.manager.element.style &&
                  Se[e] &&
                  (this.manager.element.style[pe] = e),
                (this.actions = e.toLowerCase().trim()));
            },
            update: function () {
              this.set(this.manager.options.touchAction);
            },
            compute: function () {
              var e = [];
              return (
                v(this.manager.recognizers, function (t) {
                  E(t.options.enable, [t]) &&
                    (e = e.concat(t.getTouchAction()));
                }),
                (function (e) {
                  if (x(e, ge)) return ge;
                  var t = x(e, be),
                    n = x(e, Te);
                  return t && n
                    ? ge
                    : t || n
                      ? t
                        ? be
                        : Te
                      : x(e, ye)
                        ? ye
                        : ve;
                })(e.join(" "))
              );
            },
            preventDefaults: function (e) {
              var t = e.srcEvent,
                n = e.offsetDirection;
              if (this.manager.session.prevented) t.preventDefault();
              else {
                var r = this.actions,
                  o = x(r, ge) && !Se[ge],
                  i = x(r, Te) && !Se[Te],
                  a = x(r, be) && !Se[be];
                if (o) {
                  var s = 1 === e.pointers.length,
                    l = e.distance < 2,
                    u = e.deltaTime < 250;
                  if (s && l && u) return;
                }
                if (!a || !i)
                  return o || (i && 6 & n) || (a && 24 & n)
                    ? this.preventSrc(t)
                    : void 0;
              }
            },
            preventSrc: function (e) {
              ((this.manager.session.prevented = !0), e.preventDefault());
            },
          };
          var Ce = 32;
          function ke(e) {
            ((this.options = l({}, this.defaults, e || {})),
              (this.id = D++),
              (this.manager = null),
              (this.options.enable = C(this.options.enable, !0)),
              (this.state = 1),
              (this.simultaneous = {}),
              (this.requireFail = []));
          }
          function we(e) {
            return 16 & e
              ? "cancel"
              : 8 & e
                ? "end"
                : 4 & e
                  ? "move"
                  : 2 & e
                    ? "start"
                    : "";
          }
          function Ie(e) {
            return 16 == e
              ? "down"
              : 8 == e
                ? "up"
                : 2 == e
                  ? "left"
                  : 4 == e
                    ? "right"
                    : "";
          }
          function xe(e, t) {
            var n = t.manager;
            return n ? n.get(e) : e;
          }
          function _e() {
            ke.apply(this, arguments);
          }
          function Ne() {
            (_e.apply(this, arguments), (this.pX = null), (this.pY = null));
          }
          function Me() {
            _e.apply(this, arguments);
          }
          function Oe() {
            (ke.apply(this, arguments),
              (this._timer = null),
              (this._input = null));
          }
          function Re() {
            _e.apply(this, arguments);
          }
          function De() {
            _e.apply(this, arguments);
          }
          function Ae() {
            (ke.apply(this, arguments),
              (this.pTime = !1),
              (this.pCenter = !1),
              (this._timer = null),
              (this._input = null),
              (this.count = 0));
          }
          function Le(e, t) {
            return (
              ((t = t || {}).recognizers = C(
                t.recognizers,
                Le.defaults.preset,
              )),
              new Fe(e, t)
            );
          }
          function Fe(e, t) {
            ((this.options = l({}, Le.defaults, t || {})),
              (this.options.inputTarget = this.options.inputTarget || e),
              (this.handlers = {}),
              (this.session = {}),
              (this.recognizers = []),
              (this.oldCssProps = {}),
              (this.element = e),
              (this.input = new (
                this.options.inputClass || (F ? ne : P ? se : L ? ue : Z)
              )(this, H)),
              (this.touchAction = new Ee(this, this.options.touchAction)),
              Pe(this, !0),
              v(
                this.options.recognizers,
                function (e) {
                  var t = this.add(new e[0](e[1]));
                  (e[2] && t.recognizeWith(e[2]),
                    e[3] && t.requireFailure(e[3]));
                },
                this,
              ));
          }
          function Pe(e, t) {
            var n,
              r = e.element;
            r.style &&
              (v(e.options.cssProps, function (o, i) {
                ((n = R(r.style, i)),
                  t
                    ? ((e.oldCssProps[n] = r.style[n]), (r.style[n] = o))
                    : (r.style[n] = e.oldCssProps[n] || ""));
              }),
              t || (e.oldCssProps = {}));
          }
          ((ke.prototype = {
            defaults: {},
            set: function (e) {
              return (
                l(this.options, e),
                this.manager && this.manager.touchAction.update(),
                this
              );
            },
            recognizeWith: function (e) {
              if (m(e, "recognizeWith", this)) return this;
              var t = this.simultaneous;
              return (
                t[(e = xe(e, this)).id] ||
                  ((t[e.id] = e), e.recognizeWith(this)),
                this
              );
            },
            dropRecognizeWith: function (e) {
              return (
                m(e, "dropRecognizeWith", this) ||
                  ((e = xe(e, this)), delete this.simultaneous[e.id]),
                this
              );
            },
            requireFailure: function (e) {
              if (m(e, "requireFailure", this)) return this;
              var t = this.requireFail;
              return (
                -1 === N(t, (e = xe(e, this))) &&
                  (t.push(e), e.requireFailure(this)),
                this
              );
            },
            dropRequireFailure: function (e) {
              if (m(e, "dropRequireFailure", this)) return this;
              e = xe(e, this);
              var t = N(this.requireFail, e);
              return (t > -1 && this.requireFail.splice(t, 1), this);
            },
            hasRequireFailures: function () {
              return this.requireFail.length > 0;
            },
            canRecognizeWith: function (e) {
              return !!this.simultaneous[e.id];
            },
            emit: function (e) {
              var t = this,
                n = this.state;
              function r(n) {
                t.manager.emit(n, e);
              }
              (n < 8 && r(t.options.event + we(n)),
                r(t.options.event),
                e.additionalEvent && r(e.additionalEvent),
                n >= 8 && r(t.options.event + we(n)));
            },
            tryEmit: function (e) {
              if (this.canEmit()) return this.emit(e);
              this.state = Ce;
            },
            canEmit: function () {
              for (var e = 0; e < this.requireFail.length; ) {
                if (!(33 & this.requireFail[e].state)) return !1;
                e++;
              }
              return !0;
            },
            recognize: function (e) {
              var t = l({}, e);
              if (!E(this.options.enable, [this, t]))
                return (this.reset(), void (this.state = Ce));
              (56 & this.state && (this.state = 1),
                (this.state = this.process(t)),
                30 & this.state && this.tryEmit(t));
            },
            process: function (e) {},
            getTouchAction: function () {},
            reset: function () {},
          }),
            T(_e, ke, {
              defaults: { pointers: 1 },
              attrTest: function (e) {
                var t = this.options.pointers;
                return 0 === t || e.pointers.length === t;
              },
              process: function (e) {
                var t = this.state,
                  n = e.eventType,
                  r = 6 & t,
                  o = this.attrTest(e);
                return r && (8 & n || !o)
                  ? 16 | t
                  : r || o
                    ? 4 & n
                      ? 8 | t
                      : 2 & t
                        ? 4 | t
                        : 2
                    : Ce;
              },
            }),
            T(Ne, _e, {
              defaults: {
                event: "pan",
                threshold: 10,
                pointers: 1,
                direction: 30,
              },
              getTouchAction: function () {
                var e = this.options.direction,
                  t = [];
                return (6 & e && t.push(Te), 24 & e && t.push(be), t);
              },
              directionTest: function (e) {
                var t = this.options,
                  n = !0,
                  r = e.distance,
                  o = e.direction,
                  i = e.deltaX,
                  a = e.deltaY;
                return (
                  o & t.direction ||
                    (6 & t.direction
                      ? ((o = 0 === i ? 1 : i < 0 ? 2 : 4),
                        (n = i != this.pX),
                        (r = Math.abs(e.deltaX)))
                      : ((o = 0 === a ? 1 : a < 0 ? 8 : 16),
                        (n = a != this.pY),
                        (r = Math.abs(e.deltaY)))),
                  (e.direction = o),
                  n && r > t.threshold && o & t.direction
                );
              },
              attrTest: function (e) {
                return (
                  _e.prototype.attrTest.call(this, e) &&
                  (2 & this.state ||
                    (!(2 & this.state) && this.directionTest(e)))
                );
              },
              emit: function (e) {
                ((this.pX = e.deltaX), (this.pY = e.deltaY));
                var t = Ie(e.direction);
                (t && (e.additionalEvent = this.options.event + t),
                  this._super.emit.call(this, e));
              },
            }),
            T(Me, _e, {
              defaults: { event: "pinch", threshold: 0, pointers: 2 },
              getTouchAction: function () {
                return [ge];
              },
              attrTest: function (e) {
                return (
                  this._super.attrTest.call(this, e) &&
                  (Math.abs(e.scale - 1) > this.options.threshold ||
                    2 & this.state)
                );
              },
              emit: function (e) {
                if (1 !== e.scale) {
                  var t = e.scale < 1 ? "in" : "out";
                  e.additionalEvent = this.options.event + t;
                }
                this._super.emit.call(this, e);
              },
            }),
            T(Oe, ke, {
              defaults: {
                event: "press",
                pointers: 1,
                time: 251,
                threshold: 9,
              },
              getTouchAction: function () {
                return [ve];
              },
              process: function (e) {
                var t = this.options,
                  n = e.pointers.length === t.pointers,
                  r = e.distance < t.threshold,
                  o = e.deltaTime > t.time;
                if (((this._input = e), !r || !n || (12 & e.eventType && !o)))
                  this.reset();
                else if (1 & e.eventType)
                  (this.reset(),
                    (this._timer = f(
                      function () {
                        ((this.state = 8), this.tryEmit());
                      },
                      t.time,
                      this,
                    )));
                else if (4 & e.eventType) return 8;
                return Ce;
              },
              reset: function () {
                clearTimeout(this._timer);
              },
              emit: function (e) {
                8 === this.state &&
                  (e && 4 & e.eventType
                    ? this.manager.emit(this.options.event + "up", e)
                    : ((this._input.timeStamp = p()),
                      this.manager.emit(this.options.event, this._input)));
              },
            }),
            T(Re, _e, {
              defaults: { event: "rotate", threshold: 0, pointers: 2 },
              getTouchAction: function () {
                return [ge];
              },
              attrTest: function (e) {
                return (
                  this._super.attrTest.call(this, e) &&
                  (Math.abs(e.rotation) > this.options.threshold ||
                    2 & this.state)
                );
              },
            }),
            T(De, _e, {
              defaults: {
                event: "swipe",
                threshold: 10,
                velocity: 0.3,
                direction: 30,
                pointers: 1,
              },
              getTouchAction: function () {
                return Ne.prototype.getTouchAction.call(this);
              },
              attrTest: function (e) {
                var t,
                  n = this.options.direction;
                return (
                  30 & n
                    ? (t = e.overallVelocity)
                    : 6 & n
                      ? (t = e.overallVelocityX)
                      : 24 & n && (t = e.overallVelocityY),
                  this._super.attrTest.call(this, e) &&
                    n & e.offsetDirection &&
                    e.distance > this.options.threshold &&
                    e.maxPointers == this.options.pointers &&
                    h(t) > this.options.velocity &&
                    4 & e.eventType
                );
              },
              emit: function (e) {
                var t = Ie(e.offsetDirection);
                (t && this.manager.emit(this.options.event + t, e),
                  this.manager.emit(this.options.event, e));
              },
            }),
            T(Ae, ke, {
              defaults: {
                event: "tap",
                pointers: 1,
                taps: 1,
                interval: 300,
                time: 250,
                threshold: 9,
                posThreshold: 10,
              },
              getTouchAction: function () {
                return [ye];
              },
              process: function (e) {
                var t = this.options,
                  n = e.pointers.length === t.pointers,
                  r = e.distance < t.threshold,
                  o = e.deltaTime < t.time;
                if ((this.reset(), 1 & e.eventType && 0 === this.count))
                  return this.failTimeout();
                if (r && o && n) {
                  if (4 != e.eventType) return this.failTimeout();
                  var i = !this.pTime || e.timeStamp - this.pTime < t.interval,
                    a =
                      !this.pCenter ||
                      j(this.pCenter, e.center) < t.posThreshold;
                  if (
                    ((this.pTime = e.timeStamp),
                    (this.pCenter = e.center),
                    a && i ? (this.count += 1) : (this.count = 1),
                    (this._input = e),
                    0 === this.count % t.taps)
                  )
                    return this.hasRequireFailures()
                      ? ((this._timer = f(
                          function () {
                            ((this.state = 8), this.tryEmit());
                          },
                          t.interval,
                          this,
                        )),
                        2)
                      : 8;
                }
                return Ce;
              },
              failTimeout: function () {
                return (
                  (this._timer = f(
                    function () {
                      this.state = Ce;
                    },
                    this.options.interval,
                    this,
                  )),
                  Ce
                );
              },
              reset: function () {
                clearTimeout(this._timer);
              },
              emit: function () {
                8 == this.state &&
                  ((this._input.tapCount = this.count),
                  this.manager.emit(this.options.event, this._input));
              },
            }),
            (Le.VERSION = "2.0.7"),
            (Le.defaults = {
              domEvents: !1,
              touchAction: me,
              enable: !0,
              inputTarget: null,
              inputClass: null,
              preset: [
                [Re, { enable: !1 }],
                [Me, { enable: !1 }, ["rotate"]],
                [De, { direction: 6 }],
                [Ne, { direction: 6 }, ["swipe"]],
                [Ae],
                [Ae, { event: "doubletap", taps: 2 }, ["tap"]],
                [Oe],
              ],
              cssProps: {
                userSelect: "none",
                touchSelect: "none",
                touchCallout: "none",
                contentZooming: "none",
                userDrag: "none",
                tapHighlightColor: "rgba(0,0,0,0)",
              },
            }),
            (Fe.prototype = {
              set: function (e) {
                return (
                  l(this.options, e),
                  e.touchAction && this.touchAction.update(),
                  e.inputTarget &&
                    (this.input.destroy(),
                    (this.input.target = e.inputTarget),
                    this.input.init()),
                  this
                );
              },
              stop: function (e) {
                this.session.stopped = e ? 2 : 1;
              },
              recognize: function (e) {
                var t = this.session;
                if (!t.stopped) {
                  var n;
                  this.touchAction.preventDefaults(e);
                  var r = this.recognizers,
                    o = t.curRecognizer;
                  (!o || (o && 8 & o.state)) && (o = t.curRecognizer = null);
                  for (var i = 0; i < r.length; )
                    ((n = r[i]),
                      2 === t.stopped || (o && n != o && !n.canRecognizeWith(o))
                        ? n.reset()
                        : n.recognize(e),
                      !o && 14 & n.state && (o = t.curRecognizer = n),
                      i++);
                }
              },
              get: function (e) {
                if (e instanceof ke) return e;
                for (var t = this.recognizers, n = 0; n < t.length; n++)
                  if (t[n].options.event == e) return t[n];
                return null;
              },
              add: function (e) {
                if (m(e, "add", this)) return this;
                var t = this.get(e.options.event);
                return (
                  t && this.remove(t),
                  this.recognizers.push(e),
                  (e.manager = this),
                  this.touchAction.update(),
                  e
                );
              },
              remove: function (e) {
                if (m(e, "remove", this)) return this;
                if ((e = this.get(e))) {
                  var t = this.recognizers,
                    n = N(t, e);
                  -1 !== n && (t.splice(n, 1), this.touchAction.update());
                }
                return this;
              },
              on: function (e, t) {
                if (e !== s && t !== s) {
                  var n = this.handlers;
                  return (
                    v(_(e), function (e) {
                      ((n[e] = n[e] || []), n[e].push(t));
                    }),
                    this
                  );
                }
              },
              off: function (e, t) {
                if (e !== s) {
                  var n = this.handlers;
                  return (
                    v(_(e), function (e) {
                      t ? n[e] && n[e].splice(N(n[e], t), 1) : delete n[e];
                    }),
                    this
                  );
                }
              },
              emit: function (e, t) {
                this.options.domEvents &&
                  (function (e, t) {
                    var n = i.createEvent("Event");
                    (n.initEvent(e, !0, !0),
                      (n.gesture = t),
                      t.target.dispatchEvent(n));
                  })(e, t);
                var n = this.handlers[e] && this.handlers[e].slice();
                if (n && n.length) {
                  ((t.type = e),
                    (t.preventDefault = function () {
                      t.srcEvent.preventDefault();
                    }));
                  for (var r = 0; r < n.length; ) (n[r](t), r++);
                }
              },
              destroy: function () {
                (this.element && Pe(this, !1),
                  (this.handlers = {}),
                  (this.session = {}),
                  this.input.destroy(),
                  (this.element = null));
              },
            }),
            l(Le, {
              INPUT_START: 1,
              INPUT_MOVE: 2,
              INPUT_END: 4,
              INPUT_CANCEL: 8,
              STATE_POSSIBLE: 1,
              STATE_BEGAN: 2,
              STATE_CHANGED: 4,
              STATE_ENDED: 8,
              STATE_RECOGNIZED: 8,
              STATE_CANCELLED: 16,
              STATE_FAILED: Ce,
              DIRECTION_NONE: 1,
              DIRECTION_LEFT: 2,
              DIRECTION_RIGHT: 4,
              DIRECTION_UP: 8,
              DIRECTION_DOWN: 16,
              DIRECTION_HORIZONTAL: 6,
              DIRECTION_VERTICAL: 24,
              DIRECTION_ALL: 30,
              Manager: Fe,
              Input: Y,
              TouchAction: Ee,
              TouchInput: se,
              MouseInput: Z,
              PointerEventInput: ne,
              TouchMouseInput: ue,
              SingleTouchInput: oe,
              Recognizer: ke,
              AttrRecognizer: _e,
              Tap: Ae,
              Pan: Ne,
              Swipe: De,
              Pinch: Me,
              Rotate: Re,
              Press: Oe,
              on: k,
              off: w,
              each: v,
              merge: b,
              extend: g,
              assign: l,
              inherit: T,
              bindFn: S,
              prefixed: R,
            }),
            ((void 0 !== o
              ? o
              : "undefined" != typeof self
                ? self
                : {}
            ).Hammer = Le),
            (r = function () {
              return Le;
            }.call(t, n, t, e)) === s || (e.exports = r));
        })(window, document);
      },
      914(e, t, n) {
        var r;
        ((e = n.nmd(e)),
          (function () {
            var o = (e && e.exports, "object" == typeof n.g && n.g);
            o.global !== o && o.window;
            var i = function (e) {
              this.message = e;
            };
            (i.prototype = new Error()).name = "InvalidCharacterError";
            var a = function (e) {
                throw new i(e);
              },
              s =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
              l = /[\t\n\f\r ]/g,
              u = {
                encode: function (e) {
                  ((e = String(e)),
                    /[^\0-\xFF]/.test(e) &&
                      a(
                        "The string to be encoded contains characters outside of the Latin1 range.",
                      ));
                  for (
                    var t,
                      n,
                      r,
                      o,
                      i = e.length % 3,
                      l = "",
                      u = -1,
                      c = e.length - i;
                    ++u < c;
                  )
                    ((t = e.charCodeAt(u) << 16),
                      (n = e.charCodeAt(++u) << 8),
                      (r = e.charCodeAt(++u)),
                      (l +=
                        s.charAt(((o = t + n + r) >> 18) & 63) +
                        s.charAt((o >> 12) & 63) +
                        s.charAt((o >> 6) & 63) +
                        s.charAt(63 & o)));
                  return (
                    2 == i
                      ? ((t = e.charCodeAt(u) << 8),
                        (n = e.charCodeAt(++u)),
                        (l +=
                          s.charAt((o = t + n) >> 10) +
                          s.charAt((o >> 4) & 63) +
                          s.charAt((o << 2) & 63) +
                          "="))
                      : 1 == i &&
                        ((o = e.charCodeAt(u)),
                        (l +=
                          s.charAt(o >> 2) + s.charAt((o << 4) & 63) + "==")),
                    l
                  );
                },
                decode: function (e) {
                  var t = (e = String(e).replace(l, "")).length;
                  (t % 4 == 0 && (t = (e = e.replace(/==?$/, "")).length),
                    (t % 4 == 1 || /[^+a-zA-Z0-9/]/.test(e)) &&
                      a(
                        "Invalid character: the string to be decoded is not correctly encoded.",
                      ));
                  for (var n, r, o = 0, i = "", u = -1; ++u < t; )
                    ((r = s.indexOf(e.charAt(u))),
                      (n = o % 4 ? 64 * n + r : r),
                      o++ % 4 &&
                        (i += String.fromCharCode(
                          255 & (n >> ((-2 * o) & 6)),
                        )));
                  return i;
                },
                version: "1.0.0",
              };
            void 0 ===
              (r = function () {
                return u;
              }.call(t, n, t, e)) || (e.exports = r);
          })());
      },
    },
    t = {};
  function n(r) {
    var o = t[r];
    if (void 0 !== o) return o.exports;
    var i = (t[r] = { id: r, loaded: !1, exports: {} });
    return (e[r].call(i.exports, i, i.exports, n), (i.loaded = !0), i.exports);
  }
  ((n.n = (e) => {
    var t = e && e.__esModule ? () => e.default : () => e;
    return (n.d(t, { a: t }), t);
  }),
    (n.d = (e, t) => {
      for (var r in t)
        n.o(t, r) &&
          !n.o(e, r) &&
          Object.defineProperty(e, r, { enumerable: !0, get: t[r] });
    }),
    (n.g = (function () {
      if ("object" == typeof globalThis) return globalThis;
      try {
        return this || new Function("return this")();
      } catch (e) {
        if ("object" == typeof window) return window;
      }
    })()),
    (n.o = (e, t) => Object.prototype.hasOwnProperty.call(e, t)),
    (n.nmd = (e) => ((e.paths = []), e.children || (e.children = []), e)),
    (() => {
      "use strict";
      var e,
        t = n(914),
        r = n.n(t);
      let o, i;
      function a(t, n) {
        if (t.nodeType !== Node.ELEMENT_NODE)
          throw new Error(
            "Can't generate CSS selector for non-element node type.",
          );
        if ("html" === t.tagName.toLowerCase()) return "html";
        const r = {
          root: document.body,
          idName: (e) => !0,
          className: (e) => !0,
          tagName: (e) => !0,
          attr: (e, t) => !1,
          seedMinLength: 1,
          optimizedMinLength: 2,
          threshold: 1e3,
          maxNumberOfTries: 1e4,
        };
        ((o = Object.assign(Object.assign({}, r), n)),
          (i = (function (e, t) {
            return e.nodeType === Node.DOCUMENT_NODE
              ? e
              : e === t.root
                ? e.ownerDocument
                : e;
          })(o.root, r)));
        let a = s(t, e.All, () => s(t, e.Two, () => s(t, e.One)));
        if (a) {
          const e = C(k(a, t));
          return (e.length > 0 && (a = e[0]), u(a));
        }
        throw new Error("Selector was not found.");
      }
      function s(t, n, r) {
        let i = null,
          a = [],
          s = t,
          u = 0;
        for (; s && s !== o.root.parentElement; ) {
          let t = T(h(s)) || T(...p(s)) || T(...f(s)) || T(m(s)) || [v()];
          const c = y(s);
          if (n === e.All) c && (t = t.concat(t.filter(b).map((e) => g(e, c))));
          else if (n === e.Two)
            ((t = t.slice(0, 1)),
              c && (t = t.concat(t.filter(b).map((e) => g(e, c)))));
          else if (n === e.One) {
            const [e] = (t = t.slice(0, 1));
            c && b(e) && (t = [g(e, c)]);
          }
          for (let e of t) e.level = u;
          if ((a.push(t), a.length >= o.seedMinLength && ((i = l(a, r)), i)))
            break;
          ((s = s.parentElement), u++);
        }
        return (i || (i = l(a, r)), i);
      }
      function l(e, t) {
        const n = C(E(e));
        if (n.length > o.threshold) return t ? t() : null;
        for (let e of n) if (d(e)) return e;
        return null;
      }
      function u(e) {
        let t = e[0],
          n = t.name;
        for (let r = 1; r < e.length; r++) {
          const o = e[r].level || 0;
          ((n =
            t.level === o - 1 ? `${e[r].name} > ${n}` : `${e[r].name} ${n}`),
            (t = e[r]));
        }
        return n;
      }
      function c(e) {
        return e.map((e) => e.penalty).reduce((e, t) => e + t, 0);
      }
      function d(e) {
        switch (i.querySelectorAll(u(e)).length) {
          case 0:
            throw new Error(
              `Can't select any node with this selector: ${u(e)}`,
            );
          case 1:
            return !0;
          default:
            return !1;
        }
      }
      function h(e) {
        const t = e.getAttribute("id");
        return t && o.idName(t)
          ? { name: "#" + M(t, { isIdentifier: !0 }), penalty: 0 }
          : null;
      }
      function p(e) {
        const t = Array.from(e.attributes).filter((e) =>
          o.attr(e.name, e.value),
        );
        return t.map((e) => ({
          name:
            "[" + M(e.name, { isIdentifier: !0 }) + '="' + M(e.value) + '"]',
          penalty: 0.5,
        }));
      }
      function f(e) {
        return Array.from(e.classList)
          .filter(o.className)
          .map((e) => ({ name: "." + M(e, { isIdentifier: !0 }), penalty: 1 }));
      }
      function m(e) {
        const t = e.tagName.toLowerCase();
        return o.tagName(t) ? { name: t, penalty: 2 } : null;
      }
      function v() {
        return { name: "*", penalty: 3 };
      }
      function y(e) {
        const t = e.parentNode;
        if (!t) return null;
        let n = t.firstChild;
        if (!n) return null;
        let r = 0;
        for (; n && (n.nodeType === Node.ELEMENT_NODE && r++, n !== e); )
          n = n.nextSibling;
        return r;
      }
      function g(e, t) {
        return { name: e.name + `:nth-child(${t})`, penalty: e.penalty + 1 };
      }
      function b(e) {
        return "html" !== e.name && !e.name.startsWith("#");
      }
      function T(...e) {
        const t = e.filter(S);
        return t.length > 0 ? t : null;
      }
      function S(e) {
        return null != e;
      }
      function* E(e, t = []) {
        if (e.length > 0)
          for (let n of e[0]) yield* E(e.slice(1, e.length), t.concat(n));
        else yield t;
      }
      function C(e) {
        return Array.from(e).sort((e, t) => c(e) - c(t));
      }
      function* k(e, t, n = { counter: 0, visited: new Map() }) {
        if (e.length > 2 && e.length > o.optimizedMinLength)
          for (let r = 1; r < e.length - 1; r++) {
            if (n.counter > o.maxNumberOfTries) return;
            n.counter += 1;
            const i = [...e];
            i.splice(r, 1);
            const a = u(i);
            if (n.visited.has(a)) return;
            d(i) &&
              w(i, t) &&
              (yield i, n.visited.set(a, !0), yield* k(i, t, n));
          }
      }
      function w(e, t) {
        return i.querySelector(u(e)) === t;
      }
      !(function (e) {
        ((e[(e.All = 0)] = "All"),
          (e[(e.Two = 1)] = "Two"),
          (e[(e.One = 2)] = "One"));
      })(e || (e = {}));
      const I = /[ -,\.\/:-@\[-\^`\{-~]/,
        x = /[ -,\.\/:-@\[\]\^`\{-~]/,
        _ = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g,
        N = {
          escapeEverything: !1,
          isIdentifier: !1,
          quotes: "single",
          wrap: !1,
        };
      function M(e, t = {}) {
        const n = Object.assign(Object.assign({}, N), t);
        "single" != n.quotes && "double" != n.quotes && (n.quotes = "single");
        const r = "double" == n.quotes ? '"' : "'",
          o = n.isIdentifier,
          i = e.charAt(0);
        let a = "",
          s = 0;
        const l = e.length;
        for (; s < l; ) {
          const t = e.charAt(s++);
          let i,
            u = t.charCodeAt(0);
          if (u < 32 || u > 126) {
            if (u >= 55296 && u <= 56319 && s < l) {
              const t = e.charCodeAt(s++);
              56320 == (64512 & t)
                ? (u = ((1023 & u) << 10) + (1023 & t) + 65536)
                : s--;
            }
            i = "\\" + u.toString(16).toUpperCase() + " ";
          } else
            i = n.escapeEverything
              ? I.test(t)
                ? "\\" + t
                : "\\" + u.toString(16).toUpperCase() + " "
              : /[\t\n\f\r\x0B]/.test(t)
                ? "\\" + u.toString(16).toUpperCase() + " "
                : "\\" == t ||
                    (!o && (('"' == t && r == t) || ("'" == t && r == t))) ||
                    (o && x.test(t))
                  ? "\\" + t
                  : t;
          a += i;
        }
        return (
          o &&
            (/^-[-\d]/.test(a)
              ? (a = "\\-" + a.slice(1))
              : /\d/.test(i) && (a = "\\3" + i + " " + a.slice(1))),
          (a = a.replace(_, function (e, t, n) {
            return t && t.length % 2 ? e : (t || "") + n;
          })),
          !o && n.wrap ? r + a + r : a
        );
      }
      var O = n(168),
        R = n.n(O),
        D = (function () {
          var e,
            t = function () {
              return (
                (t =
                  Object.assign ||
                  function (e) {
                    for (var t, n = 1, r = arguments.length; n < r; n++)
                      for (var o in (t = arguments[n]))
                        Object.prototype.hasOwnProperty.call(t, o) &&
                          (e[o] = t[o]);
                    return e;
                  }),
                t.apply(this, arguments)
              );
            };
          function n(e) {
            var t = "function" == typeof Symbol && Symbol.iterator,
              n = t && e[t],
              r = 0;
            if (n) return n.call(e);
            if (e && "number" == typeof e.length)
              return {
                next: function () {
                  return (
                    e && r >= e.length && (e = void 0),
                    { value: e && e[r++], done: !e }
                  );
                },
              };
            throw new TypeError(
              t ? "Object is not iterable." : "Symbol.iterator is not defined.",
            );
          }
          function r(e, t) {
            var n = "function" == typeof Symbol && e[Symbol.iterator];
            if (!n) return e;
            var r,
              o,
              i = n.call(e),
              a = [];
            try {
              for (; (void 0 === t || t-- > 0) && !(r = i.next()).done; )
                a.push(r.value);
            } catch (e) {
              o = { error: e };
            } finally {
              try {
                r && !r.done && (n = i.return) && n.call(i);
              } finally {
                if (o) throw o.error;
              }
            }
            return a;
          }
          function o() {
            for (var e = [], t = 0; t < arguments.length; t++)
              e = e.concat(r(arguments[t]));
            return e;
          }
          function i(e) {
            var t,
              n = null === (t = e) || void 0 === t ? void 0 : t.host;
            return Boolean(n && n.shadowRoot && n.shadowRoot === e);
          }
          function a(e) {
            var t = e.maskInputOptions,
              n = e.tagName,
              r = e.type,
              o = e.value,
              i = e.maskInputFn,
              a = o || "";
            return (
              (t[n.toLowerCase()] || t[r]) &&
                (a = i ? i(a) : "*".repeat(a.length)),
              a
            );
          }
          !(function (e) {
            ((e[(e.Document = 0)] = "Document"),
              (e[(e.DocumentType = 1)] = "DocumentType"),
              (e[(e.Element = 2)] = "Element"),
              (e[(e.Text = 3)] = "Text"),
              (e[(e.CDATA = 4)] = "CDATA"),
              (e[(e.Comment = 5)] = "Comment"));
          })(e || (e = {}));
          var s = 1,
            l = RegExp("[^a-z0-9-_:]");
          function u(e) {
            try {
              var t = e.rules || e.cssRules;
              return t ? Array.from(t).map(c).join("") : null;
            } catch (e) {
              return null;
            }
          }
          function c(e) {
            return (function (e) {
              return "styleSheet" in e;
            })(e)
              ? u(e.styleSheet) || ""
              : e.cssText;
          }
          var d = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm,
            h = /^(?!www\.|(?:http|ftp)s?:\/\/|[A-Za-z]:\\|\/\/|#).*/,
            p = /^(data:)([^,]*),(.*)/i;
          function f(e, t) {
            return (e || "").replace(d, function (e, n, r, o, i, a) {
              var s,
                l = r || i || a,
                u = n || o || "";
              if (!l) return e;
              if (!h.test(l)) return "url(" + u + l + u + ")";
              if (p.test(l)) return "url(" + u + l + u + ")";
              if ("/" === l[0])
                return (
                  "url(" +
                  u +
                  (((s = t).indexOf("//") > -1
                    ? s.split("/").slice(0, 3).join("/")
                    : s.split("/")[0]
                  ).split("?")[0] +
                    l) +
                  u +
                  ")"
                );
              var c = t.split("/"),
                d = l.split("/");
              c.pop();
              for (var f = 0, m = d; f < m.length; f++) {
                var v = m[f];
                "." !== v && (".." === v ? c.pop() : c.push(v));
              }
              return "url(" + u + c.join("/") + u + ")";
            });
          }
          var m,
            v,
            y,
            g,
            b,
            T = /^[^ \t\n\r\u000c]+/,
            S = /^[, \t\n\r\u000c]+/;
          function E(e, t) {
            if (!t || "" === t.trim()) return t;
            var n = e.createElement("a");
            return ((n.href = t), n.href);
          }
          function C() {
            var e = document.createElement("a");
            return ((e.href = ""), e.href);
          }
          function k(e, t, n, r) {
            return "src" === n || (("href" === n || "xlink:href" === n) && r)
              ? E(e, r)
              : "background" !== n ||
                  !r ||
                  ("table" !== t && "td" !== t && "th" !== t)
                ? "srcset" === n && r
                  ? (function (e, t) {
                      if ("" === t.trim()) return t;
                      var n = 0;
                      function r(e) {
                        var r,
                          o = e.exec(t.substring(n));
                        return o ? ((r = o[0]), (n += r.length), r) : "";
                      }
                      for (var o = []; r(S), !(n >= t.length); ) {
                        var i = r(T);
                        if ("," === i.slice(-1))
                          ((i = E(e, i.substring(0, i.length - 1))), o.push(i));
                        else {
                          var a = "";
                          i = E(e, i);
                          for (var s = !1; ; ) {
                            var l = t.charAt(n);
                            if ("" === l) {
                              o.push((i + a).trim());
                              break;
                            }
                            if (s) ")" === l && (s = !1);
                            else {
                              if ("," === l) {
                                ((n += 1), o.push((i + a).trim()));
                                break;
                              }
                              "(" === l && (s = !0);
                            }
                            ((a += l), (n += 1));
                          }
                        }
                      }
                      return o.join(", ");
                    })(e, r)
                  : "style" === n && r
                    ? f(r, C())
                    : r
                : E(e, r);
          }
          function w(e, t, n) {
            if (!e) return !1;
            if (e.nodeType === e.ELEMENT_NODE) {
              if ("string" == typeof t) {
                if (e.classList.contains(t)) return !0;
              } else
                e.classList.forEach(function (e) {
                  if (t.test(e)) return !0;
                });
              return !(!n || !e.matches(n)) || w(e.parentNode, t, n);
            }
            return (e.nodeType, e.TEXT_NODE, w(e.parentNode, t, n));
          }
          function I(e) {
            return void 0 === e ? "" : e.toLowerCase();
          }
          function x(t, n) {
            var r,
              o = n.doc,
              c = n.map,
              d = n.blockClass,
              h = n.blockSelector,
              p = n.maskTextClass,
              m = n.maskTextSelector,
              v = n.skipChild,
              y = void 0 !== v && v,
              g = n.inlineStylesheet,
              b = void 0 === g || g,
              T = n.maskInputOptions,
              S = void 0 === T ? {} : T,
              E = n.maskTextFn,
              _ = n.maskInputFn,
              N = n.slimDOMOptions,
              M = n.recordCanvas,
              O = void 0 !== M && M,
              R = n.onSerialize,
              D = n.onIframeLoad,
              A = n.iframeLoadTimeout,
              L = void 0 === A ? 5e3 : A,
              F = n.keepIframeSrcFn,
              P =
                void 0 === F
                  ? function () {
                      return !1;
                    }
                  : F,
              U = n.preserveWhiteSpace,
              z = void 0 === U || U,
              B = (function (t, n) {
                var r,
                  o,
                  i = n.doc,
                  s = n.blockClass,
                  c = n.blockSelector,
                  d = n.maskTextClass,
                  h = n.maskTextSelector,
                  p = n.inlineStylesheet,
                  m = n.maskInputOptions,
                  v = void 0 === m ? {} : m,
                  y = n.maskTextFn,
                  g = n.maskInputFn,
                  b = n.recordCanvas,
                  T = n.keepIframeSrcFn;
                if (i.__sn) {
                  var S = i.__sn.id;
                  r = 1 === S ? void 0 : S;
                }
                switch (t.nodeType) {
                  case t.DOCUMENT_NODE:
                    return { type: e.Document, childNodes: [], rootId: r };
                  case t.DOCUMENT_TYPE_NODE:
                    return {
                      type: e.DocumentType,
                      name: t.name,
                      publicId: t.publicId,
                      systemId: t.systemId,
                      rootId: r,
                    };
                  case t.ELEMENT_NODE:
                    for (
                      var E = (function (e, t, n) {
                          if ("string" == typeof t) {
                            if (e.classList.contains(t)) return !0;
                          } else
                            for (var r = 0; r < e.classList.length; r++) {
                              var o = e.classList[r];
                              if (t.test(o)) return !0;
                            }
                          return !!n && e.matches(n);
                        })(t, s, c),
                        I = (function (e) {
                          if (e instanceof HTMLFormElement) return "form";
                          var t = e.tagName.toLowerCase().trim();
                          return l.test(t) ? "div" : t;
                        })(t),
                        x = {},
                        _ = 0,
                        N = Array.from(t.attributes);
                      _ < N.length;
                      _++
                    ) {
                      var M = N[_],
                        O = M.name,
                        R = M.value;
                      x[O] = k(i, I, O, R);
                    }
                    if ("link" === I && p) {
                      var D,
                        A = Array.from(i.styleSheets).find(function (e) {
                          return e.href === t.href;
                        });
                      (D = u(A)) &&
                        (delete x.rel,
                        delete x.href,
                        (x._cssText = f(D, A.href)));
                    }
                    if (
                      ("style" === I &&
                        t.sheet &&
                        !(t.innerText || t.textContent || "").trim().length &&
                        (D = u(t.sheet)) &&
                        (x._cssText = f(D, C())),
                      ("input" !== I && "textarea" !== I && "select" !== I) ||
                        ((R = t.value),
                        "radio" !== x.type &&
                        "checkbox" !== x.type &&
                        "submit" !== x.type &&
                        "button" !== x.type &&
                        R
                          ? (x.value = a({
                              type: x.type,
                              tagName: I,
                              value: R,
                              maskInputOptions: v,
                              maskInputFn: g,
                            }))
                          : t.checked && (x.checked = t.checked)),
                      "option" === I &&
                        (t.selected ? (x.selected = !0) : delete x.selected),
                      "canvas" === I && b && (x.rr_dataURL = t.toDataURL()),
                      ("audio" !== I && "video" !== I) ||
                        ((x.rr_mediaState = t.paused ? "paused" : "played"),
                        (x.rr_mediaCurrentTime = t.currentTime)),
                      t.scrollLeft && (x.rr_scrollLeft = t.scrollLeft),
                      t.scrollTop && (x.rr_scrollTop = t.scrollTop),
                      E)
                    ) {
                      var L = t.getBoundingClientRect(),
                        F = L.width,
                        P = L.height;
                      x = {
                        class: x.class,
                        rr_width: F + "px",
                        rr_height: P + "px",
                      };
                    }
                    return (
                      "iframe" !== I || T(x.src) || delete x.src,
                      {
                        type: e.Element,
                        tagName: I,
                        attributes: x,
                        childNodes: [],
                        isSVG:
                          ((o = t),
                          "svg" === o.tagName ||
                            o instanceof SVGElement ||
                            void 0),
                        needBlock: E,
                        rootId: r,
                      }
                    );
                  case t.TEXT_NODE:
                    var U = t.parentNode && t.parentNode.tagName,
                      z = t.textContent,
                      B = "STYLE" === U || void 0,
                      q = "SCRIPT" === U || void 0;
                    return (
                      B && z && (z = f(z, C())),
                      q && (z = "SCRIPT_PLACEHOLDER"),
                      !B &&
                        !q &&
                        w(t, d, h) &&
                        z &&
                        (z = y ? y(z) : z.replace(/[\S]/g, "*")),
                      {
                        type: e.Text,
                        textContent: z || "",
                        isStyle: B,
                        rootId: r,
                      }
                    );
                  case t.CDATA_SECTION_NODE:
                    return { type: e.CDATA, textContent: "", rootId: r };
                  case t.COMMENT_NODE:
                    return {
                      type: e.Comment,
                      textContent: t.textContent || "",
                      rootId: r,
                    };
                  default:
                    return !1;
                }
              })(t, {
                doc: o,
                blockClass: d,
                blockSelector: h,
                maskTextClass: p,
                maskTextSelector: m,
                inlineStylesheet: b,
                maskInputOptions: S,
                maskTextFn: E,
                maskInputFn: _,
                recordCanvas: O,
                keepIframeSrcFn: P,
              });
            if (!B) return (console.warn(t, "not serialized"), null);
            r =
              "__sn" in t
                ? t.__sn.id
                : !(function (t, n) {
                      if (n.comment && t.type === e.Comment) return !0;
                      if (t.type === e.Element) {
                        if (
                          n.script &&
                          ("script" === t.tagName ||
                            ("link" === t.tagName &&
                              "preload" === t.attributes.rel &&
                              "script" === t.attributes.as) ||
                            ("link" === t.tagName &&
                              "prefetch" === t.attributes.rel &&
                              "string" == typeof t.attributes.href &&
                              t.attributes.href.endsWith(".js")))
                        )
                          return !0;
                        if (
                          n.headFavicon &&
                          (("link" === t.tagName &&
                            "shortcut icon" === t.attributes.rel) ||
                            ("meta" === t.tagName &&
                              (I(t.attributes.name).match(
                                /^msapplication-tile(image|color)$/,
                              ) ||
                                "application-name" === I(t.attributes.name) ||
                                "icon" === I(t.attributes.rel) ||
                                "apple-touch-icon" === I(t.attributes.rel) ||
                                "shortcut icon" === I(t.attributes.rel))))
                        )
                          return !0;
                        if ("meta" === t.tagName) {
                          if (
                            n.headMetaDescKeywords &&
                            I(t.attributes.name).match(/^description|keywords$/)
                          )
                            return !0;
                          if (
                            n.headMetaSocial &&
                            (I(t.attributes.property).match(
                              /^(og|twitter|fb):/,
                            ) ||
                              I(t.attributes.name).match(/^(og|twitter):/) ||
                              "pinterest" === I(t.attributes.name))
                          )
                            return !0;
                          if (
                            n.headMetaRobots &&
                            ("robots" === I(t.attributes.name) ||
                              "googlebot" === I(t.attributes.name) ||
                              "bingbot" === I(t.attributes.name))
                          )
                            return !0;
                          if (
                            n.headMetaHttpEquiv &&
                            void 0 !== t.attributes["http-equiv"]
                          )
                            return !0;
                          if (
                            n.headMetaAuthorship &&
                            ("author" === I(t.attributes.name) ||
                              "generator" === I(t.attributes.name) ||
                              "framework" === I(t.attributes.name) ||
                              "publisher" === I(t.attributes.name) ||
                              "progid" === I(t.attributes.name) ||
                              I(t.attributes.property).match(/^article:/) ||
                              I(t.attributes.property).match(/^product:/))
                          )
                            return !0;
                          if (
                            n.headMetaVerification &&
                            ("google-site-verification" ===
                              I(t.attributes.name) ||
                              "yandex-verification" === I(t.attributes.name) ||
                              "csrf-token" === I(t.attributes.name) ||
                              "p:domain_verify" === I(t.attributes.name) ||
                              "verify-v1" === I(t.attributes.name) ||
                              "verification" === I(t.attributes.name) ||
                              "shopify-checkout-api-token" ===
                                I(t.attributes.name))
                          )
                            return !0;
                        }
                      }
                      return !1;
                    })(B, N) &&
                    (z ||
                      B.type !== e.Text ||
                      B.isStyle ||
                      B.textContent.replace(/^\s+|\s+$/gm, "").length)
                  ? s++
                  : -2;
            var q = Object.assign(B, { id: r });
            if (((t.__sn = q), -2 === r)) return null;
            ((c[r] = t), R && R(t));
            var Y = !y;
            if (
              (q.type === e.Element &&
                ((Y = Y && !q.needBlock), delete q.needBlock),
              (q.type === e.Document || q.type === e.Element) && Y)
            ) {
              N.headWhitespace &&
                B.type === e.Element &&
                "head" === B.tagName &&
                (z = !1);
              for (
                var H = {
                    doc: o,
                    map: c,
                    blockClass: d,
                    blockSelector: h,
                    maskTextClass: p,
                    maskTextSelector: m,
                    skipChild: y,
                    inlineStylesheet: b,
                    maskInputOptions: S,
                    maskTextFn: E,
                    maskInputFn: _,
                    slimDOMOptions: N,
                    recordCanvas: O,
                    preserveWhiteSpace: z,
                    onSerialize: R,
                    onIframeLoad: D,
                    iframeLoadTimeout: L,
                    keepIframeSrcFn: P,
                  },
                  W = 0,
                  V = Array.from(t.childNodes);
                W < V.length;
                W++
              )
                (j = x(V[W], H)) && q.childNodes.push(j);
              if (
                (function (e) {
                  return e.nodeType === e.ELEMENT_NODE;
                })(t) &&
                t.shadowRoot
              ) {
                q.isShadowHost = !0;
                for (
                  var X = 0, G = Array.from(t.shadowRoot.childNodes);
                  X < G.length;
                  X++
                ) {
                  var j;
                  (j = x(G[X], H)) && ((j.isShadow = !0), q.childNodes.push(j));
                }
              }
            }
            return (
              t.parentNode && i(t.parentNode) && (q.isShadow = !0),
              q.type === e.Element &&
                "iframe" === q.tagName &&
                (function (e, t, n) {
                  var r = e.contentWindow;
                  if (r) {
                    var o,
                      i = !1;
                    try {
                      o = r.document.readyState;
                    } catch (e) {
                      return;
                    }
                    if ("complete" === o) {
                      var a = "about:blank";
                      r.location.href === a && e.src !== a && "" !== e.src
                        ? e.addEventListener("load", t)
                        : setTimeout(t, 0);
                    } else {
                      var s = setTimeout(function () {
                        i || (t(), (i = !0));
                      }, n);
                      e.addEventListener("load", function () {
                        (clearTimeout(s), (i = !0), t());
                      });
                    }
                  }
                })(
                  t,
                  function () {
                    var e = t.contentDocument;
                    if (e && D) {
                      var n = x(e, {
                        doc: e,
                        map: c,
                        blockClass: d,
                        blockSelector: h,
                        maskTextClass: p,
                        maskTextSelector: m,
                        skipChild: !1,
                        inlineStylesheet: b,
                        maskInputOptions: S,
                        maskTextFn: E,
                        maskInputFn: _,
                        slimDOMOptions: N,
                        recordCanvas: O,
                        preserveWhiteSpace: z,
                        onSerialize: R,
                        onIframeLoad: D,
                        iframeLoadTimeout: L,
                        keepIframeSrcFn: P,
                      });
                      n && D(t, n);
                    }
                  },
                  L,
                ),
              q
            );
          }
          function _(e, t, n) {
            void 0 === n && (n = document);
            var r = { capture: !0, passive: !0 };
            return (
              n.addEventListener(e, t, r),
              function () {
                return n.removeEventListener(e, t, r);
              }
            );
          }
          (!(function (e) {
            ((e[(e.DomContentLoaded = 0)] = "DomContentLoaded"),
              (e[(e.Load = 1)] = "Load"),
              (e[(e.FullSnapshot = 2)] = "FullSnapshot"),
              (e[(e.IncrementalSnapshot = 3)] = "IncrementalSnapshot"),
              (e[(e.Meta = 4)] = "Meta"),
              (e[(e.Custom = 5)] = "Custom"),
              (e[(e.Plugin = 6)] = "Plugin"));
          })(m || (m = {})),
            (function (e) {
              ((e[(e.Mutation = 0)] = "Mutation"),
                (e[(e.MouseMove = 1)] = "MouseMove"),
                (e[(e.MouseInteraction = 2)] = "MouseInteraction"),
                (e[(e.Scroll = 3)] = "Scroll"),
                (e[(e.ViewportResize = 4)] = "ViewportResize"),
                (e[(e.Input = 5)] = "Input"),
                (e[(e.TouchMove = 6)] = "TouchMove"),
                (e[(e.MediaInteraction = 7)] = "MediaInteraction"),
                (e[(e.StyleSheetRule = 8)] = "StyleSheetRule"),
                (e[(e.CanvasMutation = 9)] = "CanvasMutation"),
                (e[(e.Font = 10)] = "Font"),
                (e[(e.Log = 11)] = "Log"),
                (e[(e.Drag = 12)] = "Drag"),
                (e[(e.StyleDeclaration = 13)] = "StyleDeclaration"));
            })(v || (v = {})),
            (function (e) {
              ((e[(e.MouseUp = 0)] = "MouseUp"),
                (e[(e.MouseDown = 1)] = "MouseDown"),
                (e[(e.Click = 2)] = "Click"),
                (e[(e.ContextMenu = 3)] = "ContextMenu"),
                (e[(e.DblClick = 4)] = "DblClick"),
                (e[(e.Focus = 5)] = "Focus"),
                (e[(e.Blur = 6)] = "Blur"),
                (e[(e.TouchStart = 7)] = "TouchStart"),
                (e[(e.TouchMove_Departed = 8)] = "TouchMove_Departed"),
                (e[(e.TouchEnd = 9)] = "TouchEnd"),
                (e[(e.TouchCancel = 10)] = "TouchCancel"));
            })(y || (y = {})),
            (function (e) {
              ((e[(e.Play = 0)] = "Play"),
                (e[(e.Pause = 1)] = "Pause"),
                (e[(e.Seeked = 2)] = "Seeked"));
            })(g || (g = {})),
            (function (e) {
              ((e.Start = "start"),
                (e.Pause = "pause"),
                (e.Resume = "resume"),
                (e.Resize = "resize"),
                (e.Finish = "finish"),
                (e.FullsnapshotRebuilded = "fullsnapshot-rebuilded"),
                (e.LoadStylesheetStart = "load-stylesheet-start"),
                (e.LoadStylesheetEnd = "load-stylesheet-end"),
                (e.SkipStart = "skip-start"),
                (e.SkipEnd = "skip-end"),
                (e.MouseInteraction = "mouse-interaction"),
                (e.EventCast = "event-cast"),
                (e.CustomEvent = "custom-event"),
                (e.Flush = "flush"),
                (e.StateChange = "state-change"),
                (e.PlayBack = "play-back"));
            })(b || (b = {})));
          var N =
              "Please stop import mirror directly. Instead of that,\r\nnow you can use replayer.getMirror() to access the mirror instance of a replayer,\r\nor you can use record.mirror to access the mirror instance during recording.",
            M = {
              map: {},
              getId: function () {
                return (console.error(N), -1);
              },
              getNode: function () {
                return (console.error(N), null);
              },
              removeNodeFromMap: function () {
                console.error(N);
              },
              has: function () {
                return (console.error(N), !1);
              },
              reset: function () {
                console.error(N);
              },
            };
          function O(e, t, n) {
            void 0 === n && (n = {});
            var r = null,
              o = 0;
            return function (i) {
              var a = Date.now();
              o || !1 !== n.leading || (o = a);
              var s = t - (a - o),
                l = this,
                u = arguments;
              s <= 0 || s > t
                ? (r && (clearTimeout(r), (r = null)), (o = a), e.apply(l, u))
                : r ||
                  !1 === n.trailing ||
                  (r = setTimeout(function () {
                    ((o = !1 === n.leading ? 0 : Date.now()),
                      (r = null),
                      e.apply(l, u));
                  }, s));
            };
          }
          function R(e, t, n, r, o) {
            void 0 === o && (o = window);
            var i = o.Object.getOwnPropertyDescriptor(e, t);
            return (
              o.Object.defineProperty(
                e,
                t,
                r
                  ? n
                  : {
                      set: function (e) {
                        var t = this;
                        (setTimeout(function () {
                          n.set.call(t, e);
                        }, 0),
                          i && i.set && i.set.call(this, e));
                      },
                    },
              ),
              function () {
                return R(e, t, i || {}, !0);
              }
            );
          }
          function D(e, t, n) {
            try {
              if (!(t in e)) return function () {};
              var r = e[t],
                o = n(r);
              return (
                "function" == typeof o &&
                  ((o.prototype = o.prototype || {}),
                  Object.defineProperties(o, {
                    __rrweb_original__: { enumerable: !1, value: r },
                  })),
                (e[t] = o),
                function () {
                  e[t] = r;
                }
              );
            } catch (e) {
              return function () {};
            }
          }
          function A() {
            return (
              window.innerHeight ||
              (document.documentElement &&
                document.documentElement.clientHeight) ||
              (document.body && document.body.clientHeight)
            );
          }
          function L() {
            return (
              window.innerWidth ||
              (document.documentElement &&
                document.documentElement.clientWidth) ||
              (document.body && document.body.clientWidth)
            );
          }
          function F(e, t) {
            if (!e) return !1;
            if (e.nodeType === e.ELEMENT_NODE) {
              var n = !1;
              return (
                "string" == typeof t
                  ? (n = e.classList.contains(t))
                  : e.classList.forEach(function (e) {
                      t.test(e) && (n = !0);
                    }),
                n || F(e.parentNode, t)
              );
            }
            return (e.nodeType, e.TEXT_NODE, F(e.parentNode, t));
          }
          function P(e) {
            return "__sn" in e && -2 === e.__sn.id;
          }
          function U(e, t) {
            if (i(e)) return !1;
            var n = t.getId(e);
            return (
              !t.has(n) ||
              ((!e.parentNode || e.parentNode.nodeType !== e.DOCUMENT_NODE) &&
                (!e.parentNode || U(e.parentNode, t)))
            );
          }
          function z(e) {
            return Boolean(e.changedTouches);
          }
          function B(t) {
            return (
              "__sn" in t &&
              t.__sn.type === e.Element &&
              "iframe" === t.__sn.tagName
            );
          }
          function q(e) {
            var t;
            return Boolean(
              null === (t = e) || void 0 === t ? void 0 : t.shadowRoot,
            );
          }
          function Y(e) {
            return "__ln" in e;
          }
          "undefined" != typeof window &&
            window.Proxy &&
            window.Reflect &&
            (M = new Proxy(M, {
              get: function (e, t, n) {
                return ("map" === t && console.error(N), Reflect.get(e, t, n));
              },
            }));
          var H = (function () {
              function e() {
                ((this.length = 0), (this.head = null));
              }
              return (
                (e.prototype.get = function (e) {
                  if (e >= this.length)
                    throw new Error("Position outside of list range");
                  for (var t = this.head, n = 0; n < e; n++)
                    t = (null == t ? void 0 : t.next) || null;
                  return t;
                }),
                (e.prototype.addNode = function (e) {
                  var t = { value: e, previous: null, next: null };
                  if (
                    ((e.__ln = t), e.previousSibling && Y(e.previousSibling))
                  ) {
                    var n = e.previousSibling.__ln.next;
                    ((t.next = n),
                      (t.previous = e.previousSibling.__ln),
                      (e.previousSibling.__ln.next = t),
                      n && (n.previous = t));
                  } else
                    e.nextSibling &&
                    Y(e.nextSibling) &&
                    e.nextSibling.__ln.previous
                      ? ((n = e.nextSibling.__ln.previous),
                        (t.previous = n),
                        (t.next = e.nextSibling.__ln),
                        (e.nextSibling.__ln.previous = t),
                        n && (n.next = t))
                      : (this.head && (this.head.previous = t),
                        (t.next = this.head),
                        (this.head = t));
                  this.length++;
                }),
                (e.prototype.removeNode = function (e) {
                  var t = e.__ln;
                  this.head &&
                    (t.previous
                      ? ((t.previous.next = t.next),
                        t.next && (t.next.previous = t.previous))
                      : ((this.head = t.next),
                        this.head && (this.head.previous = null)),
                    e.__ln && delete e.__ln,
                    this.length--);
                }),
                e
              );
            })(),
            W = function (e, t) {
              return e + "@" + t;
            };
          function V(e) {
            return "__sn" in e;
          }
          var X = (function () {
            function e() {
              var e = this;
              ((this.frozen = !1),
                (this.locked = !1),
                (this.texts = []),
                (this.attributes = []),
                (this.removes = []),
                (this.mapRemoves = []),
                (this.movedMap = {}),
                (this.addedSet = new Set()),
                (this.movedSet = new Set()),
                (this.droppedSet = new Set()),
                (this.processMutations = function (t) {
                  (t.forEach(e.processMutation), e.emit());
                }),
                (this.emit = function () {
                  var t, r, o, a;
                  if (!e.frozen && !e.locked) {
                    for (
                      var s = [],
                        l = new H(),
                        u = function (t) {
                          for (var n = t, r = -2; -2 === r; )
                            r = (n = n && n.nextSibling) && e.mirror.getId(n);
                          return r;
                        },
                        c = function (t) {
                          var n,
                            r = t.getRootNode
                              ? null === (n = t.getRootNode()) || void 0 === n
                                ? void 0
                                : n.host
                              : null,
                            o = !(
                              e.doc.contains(t) ||
                              (r instanceof Node && e.doc.contains(r))
                            );
                          if (t.parentNode && !o) {
                            var a = i(t.parentNode)
                                ? e.mirror.getId(r)
                                : e.mirror.getId(t.parentNode),
                              c = u(t);
                            if (-1 === a || -1 === c) return l.addNode(t);
                            var d = x(t, {
                              doc: e.doc,
                              map: e.mirror.map,
                              blockClass: e.blockClass,
                              blockSelector: e.blockSelector,
                              maskTextClass: e.maskTextClass,
                              maskTextSelector: e.maskTextSelector,
                              skipChild: !0,
                              inlineStylesheet: e.inlineStylesheet,
                              maskInputOptions: e.maskInputOptions,
                              maskTextFn: e.maskTextFn,
                              maskInputFn: e.maskInputFn,
                              slimDOMOptions: e.slimDOMOptions,
                              recordCanvas: e.recordCanvas,
                              onSerialize: function (n) {
                                (B(n) && e.iframeManager.addIframe(n),
                                  q(t) &&
                                    e.shadowDomManager.addShadowRoot(
                                      t.shadowRoot,
                                      document,
                                    ));
                              },
                              onIframeLoad: function (t, n) {
                                e.iframeManager.attachIframe(t, n);
                              },
                            });
                            d && s.push({ parentId: a, nextId: c, node: d });
                          }
                        };
                      e.mapRemoves.length;
                    )
                      e.mirror.removeNodeFromMap(e.mapRemoves.shift());
                    try {
                      for (
                        var d = n(e.movedSet), h = d.next();
                        !h.done;
                        h = d.next()
                      ) {
                        var p = h.value;
                        (j(e.removes, p, e.mirror) &&
                          !e.movedSet.has(p.parentNode)) ||
                          c(p);
                      }
                    } catch (e) {
                      t = { error: e };
                    } finally {
                      try {
                        h && !h.done && (r = d.return) && r.call(d);
                      } finally {
                        if (t) throw t.error;
                      }
                    }
                    try {
                      for (
                        var f = n(e.addedSet), m = f.next();
                        !m.done;
                        m = f.next()
                      )
                        ((p = m.value),
                          K(e.droppedSet, p) || j(e.removes, p, e.mirror)
                            ? K(e.movedSet, p)
                              ? c(p)
                              : e.droppedSet.add(p)
                            : c(p));
                    } catch (e) {
                      o = { error: e };
                    } finally {
                      try {
                        m && !m.done && (a = f.return) && a.call(f);
                      } finally {
                        if (o) throw o.error;
                      }
                    }
                    for (var v = null; l.length; ) {
                      var y = null;
                      if (v) {
                        var g = e.mirror.getId(v.value.parentNode),
                          b = u(v.value);
                        -1 !== g && -1 !== b && (y = v);
                      }
                      if (!y)
                        for (var T = l.length - 1; T >= 0; T--) {
                          var S = l.get(T);
                          if (
                            S &&
                            ((g = e.mirror.getId(S.value.parentNode)),
                            (b = u(S.value)),
                            -1 !== g && -1 !== b)
                          ) {
                            y = S;
                            break;
                          }
                        }
                      if (!y) {
                        for (; l.head; ) l.removeNode(l.head.value);
                        break;
                      }
                      ((v = y.previous), l.removeNode(y.value), c(y.value));
                    }
                    var E = {
                      texts: e.texts
                        .map(function (t) {
                          return { id: e.mirror.getId(t.node), value: t.value };
                        })
                        .filter(function (t) {
                          return e.mirror.has(t.id);
                        }),
                      attributes: e.attributes
                        .map(function (t) {
                          return {
                            id: e.mirror.getId(t.node),
                            attributes: t.attributes,
                          };
                        })
                        .filter(function (t) {
                          return e.mirror.has(t.id);
                        }),
                      removes: e.removes,
                      adds: s,
                    };
                    (E.texts.length ||
                      E.attributes.length ||
                      E.removes.length ||
                      E.adds.length) &&
                      ((e.texts = []),
                      (e.attributes = []),
                      (e.removes = []),
                      (e.addedSet = new Set()),
                      (e.movedSet = new Set()),
                      (e.droppedSet = new Set()),
                      (e.movedMap = {}),
                      e.emissionCallback(E));
                  }
                }),
                (this.processMutation = function (t) {
                  var r, o, s, l;
                  if (!P(t.target))
                    switch (t.type) {
                      case "characterData":
                        var u = t.target.textContent;
                        F(t.target, e.blockClass) ||
                          u === t.oldValue ||
                          e.texts.push({
                            value:
                              w(
                                t.target,
                                e.maskTextClass,
                                e.maskTextSelector,
                              ) && u
                                ? e.maskTextFn
                                  ? e.maskTextFn(u)
                                  : u.replace(/[\S]/g, "*")
                                : u,
                            node: t.target,
                          });
                        break;
                      case "attributes":
                        var c = t.target;
                        if (
                          ((u = t.target.getAttribute(t.attributeName)),
                          "value" === t.attributeName &&
                            (u = a({
                              maskInputOptions: e.maskInputOptions,
                              tagName: t.target.tagName,
                              type: t.target.getAttribute("type"),
                              value: u,
                              maskInputFn: e.maskInputFn,
                            })),
                          F(t.target, e.blockClass) || u === t.oldValue)
                        )
                          return;
                        var d = e.attributes.find(function (e) {
                          return e.node === t.target;
                        });
                        if (
                          (d ||
                            ((d = { node: t.target, attributes: {} }),
                            e.attributes.push(d)),
                          "style" === t.attributeName)
                        ) {
                          var h = e.doc.createElement("span");
                          (t.oldValue && h.setAttribute("style", t.oldValue),
                            (void 0 !== d.attributes.style &&
                              null !== d.attributes.style) ||
                              (d.attributes.style = {}));
                          var p = d.attributes.style;
                          try {
                            for (
                              var f = n(Array.from(c.style)), m = f.next();
                              !m.done;
                              m = f.next()
                            ) {
                              var v = m.value,
                                y = c.style.getPropertyValue(v),
                                g = c.style.getPropertyPriority(v);
                              (y === h.style.getPropertyValue(v) &&
                                g === h.style.getPropertyPriority(v)) ||
                                (p[v] = "" === g ? y : [y, g]);
                            }
                          } catch (e) {
                            r = { error: e };
                          } finally {
                            try {
                              m && !m.done && (o = f.return) && o.call(f);
                            } finally {
                              if (r) throw r.error;
                            }
                          }
                          try {
                            for (
                              var b = n(Array.from(h.style)), T = b.next();
                              !T.done;
                              T = b.next()
                            )
                              ((v = T.value),
                                ("" !== c.style.getPropertyValue(v) &&
                                  c.style.getPropertyValue(v)) ||
                                  (p[v] = !1));
                          } catch (e) {
                            s = { error: e };
                          } finally {
                            try {
                              T && !T.done && (l = b.return) && l.call(b);
                            } finally {
                              if (s) throw s.error;
                            }
                          }
                        } else
                          d.attributes[t.attributeName] = k(
                            e.doc,
                            t.target.tagName,
                            t.attributeName,
                            u,
                          );
                        break;
                      case "childList":
                        (t.addedNodes.forEach(function (n) {
                          return e.genAdds(n, t.target);
                        }),
                          t.removedNodes.forEach(function (n) {
                            var r = e.mirror.getId(n),
                              o = i(t.target)
                                ? e.mirror.getId(t.target.host)
                                : e.mirror.getId(t.target);
                            F(t.target, e.blockClass) ||
                              P(n) ||
                              (e.addedSet.has(n)
                                ? (G(e.addedSet, n), e.droppedSet.add(n))
                                : (e.addedSet.has(t.target) && -1 === r) ||
                                  U(t.target, e.mirror) ||
                                  (e.movedSet.has(n) && e.movedMap[W(r, o)]
                                    ? G(e.movedSet, n)
                                    : e.removes.push({
                                        parentId: o,
                                        id: r,
                                        isShadow: !!i(t.target) || void 0,
                                      })),
                              e.mapRemoves.push(n));
                          }));
                    }
                }),
                (this.genAdds = function (t, n) {
                  if (!n || !F(n, e.blockClass)) {
                    if (V(t)) {
                      if (P(t)) return;
                      e.movedSet.add(t);
                      var r = null;
                      (n && V(n) && (r = n.__sn.id),
                        r && (e.movedMap[W(t.__sn.id, r)] = !0));
                    } else (e.addedSet.add(t), e.droppedSet.delete(t));
                    F(t, e.blockClass) ||
                      t.childNodes.forEach(function (t) {
                        return e.genAdds(t);
                      });
                  }
                }));
            }
            return (
              (e.prototype.init = function (
                e,
                t,
                n,
                r,
                o,
                i,
                a,
                s,
                l,
                u,
                c,
                d,
                h,
                p,
                f,
              ) {
                ((this.blockClass = t),
                  (this.blockSelector = n),
                  (this.maskTextClass = r),
                  (this.maskTextSelector = o),
                  (this.inlineStylesheet = i),
                  (this.maskInputOptions = a),
                  (this.maskTextFn = s),
                  (this.maskInputFn = l),
                  (this.recordCanvas = u),
                  (this.slimDOMOptions = c),
                  (this.emissionCallback = e),
                  (this.doc = d),
                  (this.mirror = h),
                  (this.iframeManager = p),
                  (this.shadowDomManager = f));
              }),
              (e.prototype.freeze = function () {
                this.frozen = !0;
              }),
              (e.prototype.unfreeze = function () {
                ((this.frozen = !1), this.emit());
              }),
              (e.prototype.isFrozen = function () {
                return this.frozen;
              }),
              (e.prototype.lock = function () {
                this.locked = !0;
              }),
              (e.prototype.unlock = function () {
                ((this.locked = !1), this.emit());
              }),
              e
            );
          })();
          function G(e, t) {
            (e.delete(t),
              t.childNodes.forEach(function (t) {
                return G(e, t);
              }));
          }
          function j(e, t, n) {
            var r = t.parentNode;
            if (!r) return !1;
            var o = n.getId(r);
            return (
              !!e.some(function (e) {
                return e.id === o;
              }) || j(e, r, n)
            );
          }
          function K(e, t) {
            var n = t.parentNode;
            return !!n && (!!e.has(n) || K(e, n));
          }
          var $ = [],
            Z = "undefined" != typeof CSSGroupingRule,
            J = "undefined" != typeof CSSMediaRule,
            Q = "undefined" != typeof CSSSupportsRule,
            ee = "undefined" != typeof CSSConditionRule;
          function te(e) {
            try {
              if ("composedPath" in e) {
                var t = e.composedPath();
                if (t.length) return t[0];
              } else if ("path" in e && e.path.length) return e.path[0];
              return e.target;
            } catch (t) {
              return e.target;
            }
          }
          function ne(e, t, n, r, o, i, a, s, l, u, c, d, h, p, f, m) {
            var v,
              y,
              g,
              b = new X();
            ($.push(b), b.init(e, n, r, o, i, a, s, l, u, c, d, t, h, p, f));
            var T = window.MutationObserver || window.__rrMutationObserver,
              S =
                null ===
                  (g =
                    null ===
                      (y =
                        null === (v = window) || void 0 === v
                          ? void 0
                          : v.Zone) || void 0 === y
                      ? void 0
                      : y.__symbol__) || void 0 === g
                  ? void 0
                  : g.call(y, "MutationObserver");
            S && window[S] && (T = window[S]);
            var E = new T(b.processMutations.bind(b));
            return (
              E.observe(m, {
                attributes: !0,
                attributeOldValue: !0,
                characterData: !0,
                characterDataOldValue: !0,
                childList: !0,
                subtree: !0,
              }),
              E
            );
          }
          function re(e, t, n, r, o) {
            var i = O(function (o) {
              var i = te(o);
              if (i && !F(i, r)) {
                var a = n.getId(i);
                if (i === t) {
                  var s = t.scrollingElement || t.documentElement;
                  e({ id: a, x: s.scrollLeft, y: s.scrollTop });
                } else e({ id: a, x: i.scrollLeft, y: i.scrollTop });
              }
            }, o.scroll || 100);
            return _("scroll", i, t);
          }
          function oe(e, n) {
            var r = t({}, e);
            return (n || delete r.userTriggered, r);
          }
          var ie = ["INPUT", "TEXTAREA", "SELECT"],
            ae = new WeakMap();
          function se(e) {
            return (function (e, t) {
              if (
                (Z && e.parentRule instanceof CSSGroupingRule) ||
                (J && e.parentRule instanceof CSSMediaRule) ||
                (Q && e.parentRule instanceof CSSSupportsRule) ||
                (ee && e.parentRule instanceof CSSConditionRule)
              ) {
                var n = Array.from(e.parentRule.cssRules).indexOf(e);
                t.unshift(n);
              } else
                ((n = Array.from(e.parentStyleSheet.cssRules).indexOf(e)),
                  t.unshift(n));
              return t;
            })(e, []);
          }
          function le(e, i) {
            var s, l;
            void 0 === i && (i = {});
            var u = e.doc.defaultView;
            if (!u) return function () {};
            !(function (e, t) {
              var n = e.mutationCb,
                r = e.mousemoveCb,
                i = e.mouseInteractionCb,
                a = e.scrollCb,
                s = e.viewportResizeCb,
                l = e.inputCb,
                u = e.mediaInteractionCb,
                c = e.styleSheetRuleCb,
                d = e.styleDeclarationCb,
                h = e.canvasMutationCb,
                p = e.fontCb;
              ((e.mutationCb = function () {
                for (var e = [], r = 0; r < arguments.length; r++)
                  e[r] = arguments[r];
                (t.mutation && t.mutation.apply(t, o(e)),
                  n.apply(void 0, o(e)));
              }),
                (e.mousemoveCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.mousemove && t.mousemove.apply(t, o(e)),
                    r.apply(void 0, o(e)));
                }),
                (e.mouseInteractionCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.mouseInteraction && t.mouseInteraction.apply(t, o(e)),
                    i.apply(void 0, o(e)));
                }),
                (e.scrollCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.scroll && t.scroll.apply(t, o(e)), a.apply(void 0, o(e)));
                }),
                (e.viewportResizeCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.viewportResize && t.viewportResize.apply(t, o(e)),
                    s.apply(void 0, o(e)));
                }),
                (e.inputCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.input && t.input.apply(t, o(e)), l.apply(void 0, o(e)));
                }),
                (e.mediaInteractionCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.mediaInteaction && t.mediaInteaction.apply(t, o(e)),
                    u.apply(void 0, o(e)));
                }),
                (e.styleSheetRuleCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.styleSheetRule && t.styleSheetRule.apply(t, o(e)),
                    c.apply(void 0, o(e)));
                }),
                (e.styleDeclarationCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.styleDeclaration && t.styleDeclaration.apply(t, o(e)),
                    d.apply(void 0, o(e)));
                }),
                (e.canvasMutationCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.canvasMutation && t.canvasMutation.apply(t, o(e)),
                    h.apply(void 0, o(e)));
                }),
                (e.fontCb = function () {
                  for (var e = [], n = 0; n < arguments.length; n++)
                    e[n] = arguments[n];
                  (t.font && t.font.apply(t, o(e)), p.apply(void 0, o(e)));
                }));
            })(e, i);
            var c,
              d,
              h,
              p = ne(
                e.mutationCb,
                e.doc,
                e.blockClass,
                e.blockSelector,
                e.maskTextClass,
                e.maskTextSelector,
                e.inlineStylesheet,
                e.maskInputOptions,
                e.maskTextFn,
                e.maskInputFn,
                e.recordCanvas,
                e.slimDOMOptions,
                e.mirror,
                e.iframeManager,
                e.shadowDomManager,
                e.doc,
              ),
              f = (function (e, t, n, r) {
                if (!1 === t.mousemove) return function () {};
                var o,
                  i = "number" == typeof t.mousemove ? t.mousemove : 50,
                  a =
                    "number" == typeof t.mousemoveCallback
                      ? t.mousemoveCallback
                      : 500,
                  s = [],
                  l = O(function (t) {
                    var n = Date.now() - o;
                    (e(
                      s.map(function (e) {
                        return ((e.timeOffset -= n), e);
                      }),
                      t,
                    ),
                      (s = []),
                      (o = null));
                  }, a),
                  u = O(
                    function (e) {
                      var t = te(e),
                        n = z(e) ? e.changedTouches[0] : e,
                        i = n.clientX,
                        a = n.clientY;
                      (o || (o = Date.now()),
                        s.push({
                          x: i,
                          y: a,
                          id: r.getId(t),
                          timeOffset: Date.now() - o,
                        }),
                        l(
                          "undefined" != typeof DragEvent &&
                            e instanceof DragEvent
                            ? v.Drag
                            : e instanceof MouseEvent
                              ? v.MouseMove
                              : v.TouchMove,
                        ));
                    },
                    i,
                    { trailing: !1 },
                  ),
                  c = [
                    _("mousemove", u, n),
                    _("touchmove", u, n),
                    _("drag", u, n),
                  ];
                return function () {
                  c.forEach(function (e) {
                    return e();
                  });
                };
              })(e.mousemoveCb, e.sampling, e.doc, e.mirror),
              m = (function (e, t, n, r, o) {
                if (!1 === o.mouseInteraction) return function () {};
                var i =
                    !0 === o.mouseInteraction || void 0 === o.mouseInteraction
                      ? {}
                      : o.mouseInteraction,
                  a = [];
                return (
                  Object.keys(y)
                    .filter(function (e) {
                      return (
                        Number.isNaN(Number(e)) &&
                        !e.endsWith("_Departed") &&
                        !1 !== i[e]
                      );
                    })
                    .forEach(function (o) {
                      var i = o.toLowerCase(),
                        s = (function (t) {
                          return function (o) {
                            var i = te(o);
                            if (!F(i, r)) {
                              var a = z(o) ? o.changedTouches[0] : o;
                              if (a) {
                                var s = n.getId(i),
                                  l = a.clientX,
                                  u = a.clientY;
                                e({ type: y[t], id: s, x: l, y: u });
                              }
                            }
                          };
                        })(o);
                      a.push(_(i, s, t));
                    }),
                  function () {
                    a.forEach(function (e) {
                      return e();
                    });
                  }
                );
              })(
                e.mouseInteractionCb,
                e.doc,
                e.mirror,
                e.blockClass,
                e.sampling,
              ),
              g = re(e.scrollCb, e.doc, e.mirror, e.blockClass, e.sampling),
              b =
                ((c = e.viewportResizeCb),
                (d = -1),
                (h = -1),
                _(
                  "resize",
                  O(function () {
                    var e = A(),
                      t = L();
                    (d === e && h === t) ||
                      (c({ width: Number(t), height: Number(e) }),
                      (d = e),
                      (h = t));
                  }, 200),
                  window,
                )),
              T = (function (e, n, r, i, s, l, u, c, d) {
                function h(e) {
                  var t = te(e),
                    r = e.isTrusted;
                  if (
                    t &&
                    t.tagName &&
                    !(ie.indexOf(t.tagName) < 0) &&
                    !F(t, i)
                  ) {
                    var o = t.type;
                    if (!t.classList.contains(s)) {
                      var c = t.value,
                        h = !1;
                      ("radio" === o || "checkbox" === o
                        ? (h = t.checked)
                        : (l[t.tagName.toLowerCase()] || l[o]) &&
                          (c = a({
                            maskInputOptions: l,
                            tagName: t.tagName,
                            type: o,
                            value: c,
                            maskInputFn: u,
                          })),
                        p(
                          t,
                          oe({ text: c, isChecked: h, userTriggered: r }, d),
                        ));
                      var f = t.name;
                      "radio" === o &&
                        f &&
                        h &&
                        n
                          .querySelectorAll(
                            'input[type="radio"][name="' + f + '"]',
                          )
                          .forEach(function (e) {
                            e !== t &&
                              p(
                                e,
                                oe(
                                  {
                                    text: e.value,
                                    isChecked: !h,
                                    userTriggered: !1,
                                  },
                                  d,
                                ),
                              );
                          });
                    }
                  }
                }
                function p(n, o) {
                  var i = ae.get(n);
                  if (!i || i.text !== o.text || i.isChecked !== o.isChecked) {
                    ae.set(n, o);
                    var a = r.getId(n);
                    e(t(t({}, o), { id: a }));
                  }
                }
                var f = (
                    "last" === c.input ? ["change"] : ["input", "change"]
                  ).map(function (e) {
                    return _(e, h, n);
                  }),
                  m = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value",
                  ),
                  v = [
                    [HTMLInputElement.prototype, "value"],
                    [HTMLInputElement.prototype, "checked"],
                    [HTMLSelectElement.prototype, "value"],
                    [HTMLTextAreaElement.prototype, "value"],
                    [HTMLSelectElement.prototype, "selectedIndex"],
                  ];
                return (
                  m &&
                    m.set &&
                    f.push.apply(
                      f,
                      o(
                        v.map(function (e) {
                          return R(e[0], e[1], {
                            set: function () {
                              h({ target: this });
                            },
                          });
                        }),
                      ),
                    ),
                  function () {
                    f.forEach(function (e) {
                      return e();
                    });
                  }
                );
              })(
                e.inputCb,
                e.doc,
                e.mirror,
                e.blockClass,
                e.ignoreClass,
                e.maskInputOptions,
                e.maskInputFn,
                e.sampling,
                e.userTriggeredOnInput,
              ),
              S = (function (e, t, n) {
                var r = function (r) {
                    return function (o) {
                      var i = te(o);
                      i &&
                        !F(i, t) &&
                        e({
                          type: r,
                          id: n.getId(i),
                          currentTime: i.currentTime,
                        });
                    };
                  },
                  o = [_("play", r(0)), _("pause", r(1)), _("seeked", r(2))];
                return function () {
                  o.forEach(function (e) {
                    return e();
                  });
                };
              })(e.mediaInteractionCb, e.blockClass, e.mirror),
              E = (function (e, t, n) {
                var i = t.CSSStyleSheet.prototype.insertRule;
                t.CSSStyleSheet.prototype.insertRule = function (t, r) {
                  var o = n.getId(this.ownerNode);
                  return (
                    -1 !== o && e({ id: o, adds: [{ rule: t, index: r }] }),
                    i.apply(this, arguments)
                  );
                };
                var a = t.CSSStyleSheet.prototype.deleteRule;
                t.CSSStyleSheet.prototype.deleteRule = function (t) {
                  var r = n.getId(this.ownerNode);
                  return (
                    -1 !== r && e({ id: r, removes: [{ index: t }] }),
                    a.apply(this, arguments)
                  );
                };
                var s = {};
                Z
                  ? (s.CSSGroupingRule = t.CSSGroupingRule)
                  : (J && (s.CSSMediaRule = t.CSSMediaRule),
                    ee && (s.CSSConditionRule = t.CSSConditionRule),
                    Q && (s.CSSSupportsRule = t.CSSSupportsRule));
                var l = {};
                return (
                  Object.entries(s).forEach(function (t) {
                    var i = r(t, 2),
                      a = i[0],
                      s = i[1];
                    ((l[a] = {
                      insertRule: s.prototype.insertRule,
                      deleteRule: s.prototype.deleteRule,
                    }),
                      (s.prototype.insertRule = function (t, r) {
                        var i = n.getId(this.parentStyleSheet.ownerNode);
                        return (
                          -1 !== i &&
                            e({
                              id: i,
                              adds: [{ rule: t, index: o(se(this), [r || 0]) }],
                            }),
                          l[a].insertRule.apply(this, arguments)
                        );
                      }),
                      (s.prototype.deleteRule = function (t) {
                        var r = n.getId(this.parentStyleSheet.ownerNode);
                        return (
                          -1 !== r &&
                            e({
                              id: r,
                              removes: [{ index: o(se(this), [t]) }],
                            }),
                          l[a].deleteRule.apply(this, arguments)
                        );
                      }));
                  }),
                  function () {
                    ((t.CSSStyleSheet.prototype.insertRule = i),
                      (t.CSSStyleSheet.prototype.deleteRule = a),
                      Object.entries(s).forEach(function (e) {
                        var t = r(e, 2),
                          n = t[0],
                          o = t[1];
                        ((o.prototype.insertRule = l[n].insertRule),
                          (o.prototype.deleteRule = l[n].deleteRule));
                      }));
                  }
                );
              })(e.styleSheetRuleCb, u, e.mirror),
              C = (function (e, t, n) {
                var r = t.CSSStyleDeclaration.prototype.setProperty;
                t.CSSStyleDeclaration.prototype.setProperty = function (
                  t,
                  o,
                  i,
                ) {
                  var a,
                    s,
                    l = n.getId(
                      null ===
                        (s =
                          null === (a = this.parentRule) || void 0 === a
                            ? void 0
                            : a.parentStyleSheet) || void 0 === s
                        ? void 0
                        : s.ownerNode,
                    );
                  return (
                    -1 !== l &&
                      e({
                        id: l,
                        set: { property: t, value: o, priority: i },
                        index: se(this.parentRule),
                      }),
                    r.apply(this, arguments)
                  );
                };
                var o = t.CSSStyleDeclaration.prototype.removeProperty;
                return (
                  (t.CSSStyleDeclaration.prototype.removeProperty = function (
                    t,
                  ) {
                    var r,
                      i,
                      a = n.getId(
                        null ===
                          (i =
                            null === (r = this.parentRule) || void 0 === r
                              ? void 0
                              : r.parentStyleSheet) || void 0 === i
                          ? void 0
                          : i.ownerNode,
                      );
                    return (
                      -1 !== a &&
                        e({
                          id: a,
                          remove: { property: t },
                          index: se(this.parentRule),
                        }),
                      o.apply(this, arguments)
                    );
                  }),
                  function () {
                    ((t.CSSStyleDeclaration.prototype.setProperty = r),
                      (t.CSSStyleDeclaration.prototype.removeProperty = o));
                  }
                );
              })(e.styleDeclarationCb, u, e.mirror),
              k = e.recordCanvas
                ? (function (e, t, r, i) {
                    var a,
                      s,
                      l = Object.getOwnPropertyNames(
                        t.CanvasRenderingContext2D.prototype,
                      ),
                      u = [],
                      c = function (n) {
                        try {
                          if (
                            "function" !=
                            typeof t.CanvasRenderingContext2D.prototype[n]
                          )
                            return "continue";
                          var a = D(
                            t.CanvasRenderingContext2D.prototype,
                            n,
                            function (t) {
                              return function () {
                                for (
                                  var a = this, s = [], l = 0;
                                  l < arguments.length;
                                  l++
                                )
                                  s[l] = arguments[l];
                                return (
                                  F(this.canvas, r) ||
                                    setTimeout(function () {
                                      var t = o(s);
                                      if (
                                        "drawImage" === n &&
                                        t[0] &&
                                        t[0] instanceof HTMLCanvasElement
                                      ) {
                                        var r = t[0],
                                          l = r.getContext("2d"),
                                          u =
                                            null == l
                                              ? void 0
                                              : l.getImageData(
                                                  0,
                                                  0,
                                                  r.width,
                                                  r.height,
                                                ),
                                          c = null == u ? void 0 : u.data;
                                        t[0] = JSON.stringify(c);
                                      }
                                      e({
                                        id: i.getId(a.canvas),
                                        property: n,
                                        args: t,
                                      });
                                    }, 0),
                                  t.apply(this, s)
                                );
                              };
                            },
                          );
                          u.push(a);
                        } catch (r) {
                          var s = R(t.CanvasRenderingContext2D.prototype, n, {
                            set: function (t) {
                              e({
                                id: i.getId(this.canvas),
                                property: n,
                                args: [t],
                                setter: !0,
                              });
                            },
                          });
                          u.push(s);
                        }
                      };
                    try {
                      for (var d = n(l), h = d.next(); !h.done; h = d.next())
                        c(h.value);
                    } catch (e) {
                      a = { error: e };
                    } finally {
                      try {
                        h && !h.done && (s = d.return) && s.call(d);
                      } finally {
                        if (a) throw a.error;
                      }
                    }
                    return function () {
                      u.forEach(function (e) {
                        return e();
                      });
                    };
                  })(e.canvasMutationCb, u, e.blockClass, e.mirror)
                : function () {},
              w = e.collectFonts
                ? (function (e, t) {
                    var n = t.defaultView;
                    if (!n) return function () {};
                    var r = [],
                      o = new WeakMap(),
                      i = n.FontFace;
                    n.FontFace = function (e, t, n) {
                      var r = new i(e, t, n);
                      return (
                        o.set(r, {
                          family: e,
                          buffer: "string" != typeof t,
                          descriptors: n,
                          fontSource:
                            "string" == typeof t
                              ? t
                              : JSON.stringify(Array.from(new Uint8Array(t))),
                        }),
                        r
                      );
                    };
                    var a = D(t.fonts, "add", function (t) {
                      return function (n) {
                        return (
                          setTimeout(function () {
                            var t = o.get(n);
                            t && (e(t), o.delete(n));
                          }, 0),
                          t.apply(this, [n])
                        );
                      };
                    });
                    return (
                      r.push(function () {
                        n.FontFace = i;
                      }),
                      r.push(a),
                      function () {
                        r.forEach(function (e) {
                          return e();
                        });
                      }
                    );
                  })(e.fontCb, e.doc)
                : function () {},
              I = [];
            try {
              for (var x = n(e.plugins), N = x.next(); !N.done; N = x.next()) {
                var M = N.value;
                I.push(M.observer(M.callback, u, M.options));
              }
            } catch (e) {
              s = { error: e };
            } finally {
              try {
                N && !N.done && (l = x.return) && l.call(x);
              } finally {
                if (s) throw s.error;
              }
            }
            return function () {
              (p.disconnect(),
                f(),
                m(),
                g(),
                b(),
                T(),
                S(),
                E(),
                C(),
                k(),
                w(),
                I.forEach(function (e) {
                  return e();
                }));
            };
          }
          var ue,
            ce,
            de = (function () {
              function e(e) {
                ((this.iframes = new WeakMap()),
                  (this.mutationCb = e.mutationCb));
              }
              return (
                (e.prototype.addIframe = function (e) {
                  this.iframes.set(e, !0);
                }),
                (e.prototype.addLoadListener = function (e) {
                  this.loadListener = e;
                }),
                (e.prototype.attachIframe = function (e, t) {
                  var n;
                  (this.mutationCb({
                    adds: [{ parentId: e.__sn.id, nextId: null, node: t }],
                    removes: [],
                    texts: [],
                    attributes: [],
                    isAttachIframe: !0,
                  }),
                    null === (n = this.loadListener) ||
                      void 0 === n ||
                      n.call(this, e));
                }),
                e
              );
            })(),
            he = (function () {
              function e(e) {
                ((this.mutationCb = e.mutationCb),
                  (this.scrollCb = e.scrollCb),
                  (this.bypassOptions = e.bypassOptions),
                  (this.mirror = e.mirror));
              }
              return (
                (e.prototype.addShadowRoot = function (e, t) {
                  (ne(
                    this.mutationCb,
                    t,
                    this.bypassOptions.blockClass,
                    this.bypassOptions.blockSelector,
                    this.bypassOptions.maskTextClass,
                    this.bypassOptions.maskTextSelector,
                    this.bypassOptions.inlineStylesheet,
                    this.bypassOptions.maskInputOptions,
                    this.bypassOptions.maskTextFn,
                    this.bypassOptions.maskInputFn,
                    this.bypassOptions.recordCanvas,
                    this.bypassOptions.slimDOMOptions,
                    this.mirror,
                    this.bypassOptions.iframeManager,
                    this,
                    e,
                  ),
                    re(
                      this.scrollCb,
                      e,
                      this.mirror,
                      this.bypassOptions.blockClass,
                      this.bypassOptions.sampling,
                    ));
                }),
                e
              );
            })();
          function pe(e) {
            return t(t({}, e), { timestamp: Date.now() });
          }
          var fe = {
            map: {},
            getId: function (e) {
              return e && e.__sn ? e.__sn.id : -1;
            },
            getNode: function (e) {
              return this.map[e] || null;
            },
            removeNodeFromMap: function (e) {
              var t = this,
                n = e.__sn && e.__sn.id;
              (delete this.map[n],
                e.childNodes &&
                  e.childNodes.forEach(function (e) {
                    return t.removeNodeFromMap(e);
                  }));
            },
            has: function (e) {
              return this.map.hasOwnProperty(e);
            },
            reset: function () {
              this.map = {};
            },
          };
          function me(e) {
            void 0 === e && (e = {});
            var n = e.emit,
              o = e.checkoutEveryNms,
              i = e.checkoutEveryNth,
              a = e.blockClass,
              s = void 0 === a ? "rr-block" : a,
              l = e.blockSelector,
              u = void 0 === l ? null : l,
              c = e.ignoreClass,
              d = void 0 === c ? "rr-ignore" : c,
              h = e.maskTextClass,
              p = void 0 === h ? "rr-mask" : h,
              f = e.maskTextSelector,
              y = void 0 === f ? null : f,
              g = e.inlineStylesheet,
              b = void 0 === g || g,
              T = e.maskAllInputs,
              S = e.maskInputOptions,
              E = e.slimDOMOptions,
              C = e.maskInputFn,
              k = e.maskTextFn,
              w = e.hooks,
              I = e.packFn,
              N = e.sampling,
              M = void 0 === N ? {} : N,
              O = e.mousemoveWait,
              R = e.recordCanvas,
              D = void 0 !== R && R,
              F = e.userTriggeredOnInput,
              P = void 0 !== F && F,
              U = e.collectFonts,
              z = void 0 !== U && U,
              Y = e.plugins,
              H = e.keepIframeSrcFn,
              W =
                void 0 === H
                  ? function () {
                      return !1;
                    }
                  : H;
            if (!n) throw new Error("emit function is required");
            void 0 !== O && void 0 === M.mousemove && (M.mousemove = O);
            var V,
              X,
              G =
                !0 === T
                  ? {
                      color: !0,
                      date: !0,
                      "datetime-local": !0,
                      email: !0,
                      month: !0,
                      number: !0,
                      range: !0,
                      search: !0,
                      tel: !0,
                      text: !0,
                      time: !0,
                      url: !0,
                      week: !0,
                      textarea: !0,
                      select: !0,
                      password: !0,
                    }
                  : void 0 !== S
                    ? S
                    : { password: !0 },
              j =
                !0 === E || "all" === E
                  ? {
                      script: !0,
                      comment: !0,
                      headFavicon: !0,
                      headWhitespace: !0,
                      headMetaSocial: !0,
                      headMetaRobots: !0,
                      headMetaHttpEquiv: !0,
                      headMetaVerification: !0,
                      headMetaAuthorship: "all" === E,
                      headMetaDescKeywords: "all" === E,
                    }
                  : E || {};
            (void 0 === V && (V = window),
              "NodeList" in V &&
                !V.NodeList.prototype.forEach &&
                (V.NodeList.prototype.forEach = Array.prototype.forEach),
              "DOMTokenList" in V &&
                !V.DOMTokenList.prototype.forEach &&
                (V.DOMTokenList.prototype.forEach = Array.prototype.forEach),
              Node.prototype.contains ||
                (Node.prototype.contains = function (e) {
                  if (!(0 in arguments))
                    throw new TypeError("1 argument is required");
                  do {
                    if (this === e) return !0;
                  } while ((e = e && e.parentNode));
                  return !1;
                }));
            var K = 0;
            ue = function (e, t) {
              var r;
              if (
                (!(null === (r = $[0]) || void 0 === r
                  ? void 0
                  : r.isFrozen()) ||
                  e.type === m.FullSnapshot ||
                  (e.type === m.IncrementalSnapshot &&
                    e.data.source === v.Mutation) ||
                  $.forEach(function (e) {
                    return e.unfreeze();
                  }),
                n(I ? I(e) : e, t),
                e.type === m.FullSnapshot)
              )
                ((X = e), (K = 0));
              else if (e.type === m.IncrementalSnapshot) {
                if (e.data.source === v.Mutation && e.data.isAttachIframe)
                  return;
                K++;
                var a = i && K >= i,
                  s = o && e.timestamp - X.timestamp > o;
                (a || s) && ce(!0);
              }
            };
            var Z = function (e) {
                ue(
                  pe({
                    type: m.IncrementalSnapshot,
                    data: t({ source: v.Mutation }, e),
                  }),
                );
              },
              J = function (e) {
                return ue(
                  pe({
                    type: m.IncrementalSnapshot,
                    data: t({ source: v.Scroll }, e),
                  }),
                );
              },
              Q = new de({ mutationCb: Z }),
              ee = new he({
                mutationCb: Z,
                scrollCb: J,
                bypassOptions: {
                  blockClass: s,
                  blockSelector: u,
                  maskTextClass: p,
                  maskTextSelector: y,
                  inlineStylesheet: b,
                  maskInputOptions: G,
                  maskTextFn: k,
                  maskInputFn: C,
                  recordCanvas: D,
                  sampling: M,
                  slimDOMOptions: j,
                  iframeManager: Q,
                },
                mirror: fe,
              });
            ce = function (e) {
              var t, n, o, i;
              (void 0 === e && (e = !1),
                ue(
                  pe({
                    type: m.Meta,
                    data: {
                      href: window.location.href,
                      width: L(),
                      height: A(),
                    },
                  }),
                  e,
                ),
                $.forEach(function (e) {
                  return e.lock();
                }));
              var a = r(
                  (function (e, t) {
                    var n = t || {},
                      r = n.blockClass,
                      o = n.blockSelector,
                      i = n.maskTextClass,
                      a = n.maskTextSelector,
                      s = n.inlineStylesheet,
                      l = n.recordCanvas,
                      u = n.maskAllInputs,
                      c = void 0 !== u && u,
                      d = n.slimDOM,
                      h = void 0 !== d && d,
                      p = n.keepIframeSrcFn,
                      f = {};
                    return [
                      x(e, {
                        doc: e,
                        map: f,
                        blockClass: void 0 === r ? "rr-block" : r,
                        blockSelector: void 0 === o ? null : o,
                        maskTextClass: void 0 === i ? "rr-mask" : i,
                        maskTextSelector: void 0 === a ? null : a,
                        skipChild: !1,
                        inlineStylesheet: void 0 === s || s,
                        maskInputOptions:
                          !0 === c
                            ? {
                                color: !0,
                                date: !0,
                                "datetime-local": !0,
                                email: !0,
                                month: !0,
                                number: !0,
                                range: !0,
                                search: !0,
                                tel: !0,
                                text: !0,
                                time: !0,
                                url: !0,
                                week: !0,
                                textarea: !0,
                                select: !0,
                                password: !0,
                              }
                            : !1 === c
                              ? { password: !0 }
                              : c,
                        maskTextFn: n.maskTextFn,
                        maskInputFn: n.maskInputFn,
                        slimDOMOptions:
                          !0 === h || "all" === h
                            ? {
                                script: !0,
                                comment: !0,
                                headFavicon: !0,
                                headWhitespace: !0,
                                headMetaDescKeywords: "all" === h,
                                headMetaSocial: !0,
                                headMetaRobots: !0,
                                headMetaHttpEquiv: !0,
                                headMetaAuthorship: !0,
                                headMetaVerification: !0,
                              }
                            : !1 === h
                              ? {}
                              : h,
                        recordCanvas: void 0 !== l && l,
                        preserveWhiteSpace: n.preserveWhiteSpace,
                        onSerialize: n.onSerialize,
                        onIframeLoad: n.onIframeLoad,
                        iframeLoadTimeout: n.iframeLoadTimeout,
                        keepIframeSrcFn:
                          void 0 === p
                            ? function () {
                                return !1;
                              }
                            : p,
                      }),
                      f,
                    ];
                  })(document, {
                    blockClass: s,
                    blockSelector: u,
                    maskTextClass: p,
                    maskTextSelector: y,
                    inlineStylesheet: b,
                    maskAllInputs: G,
                    maskTextFn: k,
                    slimDOM: j,
                    recordCanvas: D,
                    onSerialize: function (e) {
                      (B(e) && Q.addIframe(e),
                        q(e) && ee.addShadowRoot(e.shadowRoot, document));
                    },
                    onIframeLoad: function (e, t) {
                      Q.attachIframe(e, t);
                    },
                    keepIframeSrcFn: W,
                  }),
                  2,
                ),
                l = a[0],
                c = a[1];
              if (!l) return console.warn("Failed to snapshot the document");
              ((fe.map = c),
                ue(
                  pe({
                    type: m.FullSnapshot,
                    data: {
                      node: l,
                      initialOffset: {
                        left:
                          void 0 !== window.pageXOffset
                            ? window.pageXOffset
                            : (null === document || void 0 === document
                                ? void 0
                                : document.documentElement.scrollLeft) ||
                              (null ===
                                (n =
                                  null ===
                                    (t =
                                      null === document || void 0 === document
                                        ? void 0
                                        : document.body) || void 0 === t
                                    ? void 0
                                    : t.parentElement) || void 0 === n
                                ? void 0
                                : n.scrollLeft) ||
                              (null === document || void 0 === document
                                ? void 0
                                : document.body.scrollLeft) ||
                              0,
                        top:
                          void 0 !== window.pageYOffset
                            ? window.pageYOffset
                            : (null === document || void 0 === document
                                ? void 0
                                : document.documentElement.scrollTop) ||
                              (null ===
                                (i =
                                  null ===
                                    (o =
                                      null === document || void 0 === document
                                        ? void 0
                                        : document.body) || void 0 === o
                                    ? void 0
                                    : o.parentElement) || void 0 === i
                                ? void 0
                                : i.scrollTop) ||
                              (null === document || void 0 === document
                                ? void 0
                                : document.body.scrollTop) ||
                              0,
                      },
                    },
                  }),
                ),
                $.forEach(function (e) {
                  return e.unlock();
                }));
            };
            try {
              var te = [];
              te.push(
                _("DOMContentLoaded", function () {
                  ue(pe({ type: m.DomContentLoaded, data: {} }));
                }),
              );
              var ne = function (e) {
                return le(
                  {
                    mutationCb: Z,
                    mousemoveCb: function (e, t) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: { source: t, positions: e },
                        }),
                      );
                    },
                    mouseInteractionCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.MouseInteraction }, e),
                        }),
                      );
                    },
                    scrollCb: J,
                    viewportResizeCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.ViewportResize }, e),
                        }),
                      );
                    },
                    inputCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.Input }, e),
                        }),
                      );
                    },
                    mediaInteractionCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.MediaInteraction }, e),
                        }),
                      );
                    },
                    styleSheetRuleCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.StyleSheetRule }, e),
                        }),
                      );
                    },
                    styleDeclarationCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.StyleDeclaration }, e),
                        }),
                      );
                    },
                    canvasMutationCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.CanvasMutation }, e),
                        }),
                      );
                    },
                    fontCb: function (e) {
                      return ue(
                        pe({
                          type: m.IncrementalSnapshot,
                          data: t({ source: v.Font }, e),
                        }),
                      );
                    },
                    blockClass: s,
                    ignoreClass: d,
                    maskTextClass: p,
                    maskTextSelector: y,
                    maskInputOptions: G,
                    inlineStylesheet: b,
                    sampling: M,
                    recordCanvas: D,
                    userTriggeredOnInput: P,
                    collectFonts: z,
                    doc: e,
                    maskInputFn: C,
                    maskTextFn: k,
                    blockSelector: u,
                    slimDOMOptions: j,
                    mirror: fe,
                    iframeManager: Q,
                    shadowDomManager: ee,
                    plugins:
                      (null == Y
                        ? void 0
                        : Y.map(function (e) {
                            return {
                              observer: e.observer,
                              options: e.options,
                              callback: function (t) {
                                return ue(
                                  pe({
                                    type: m.Plugin,
                                    data: { plugin: e.name, payload: t },
                                  }),
                                );
                              },
                            };
                          })) || [],
                  },
                  w,
                );
              };
              Q.addLoadListener(function (e) {
                te.push(ne(e.contentDocument));
              });
              var re = function () {
                (ce(), te.push(ne(document)));
              };
              return (
                "interactive" === document.readyState ||
                "complete" === document.readyState
                  ? re()
                  : te.push(
                      _(
                        "load",
                        function () {
                          (ue(pe({ type: m.Load, data: {} })), re());
                        },
                        window,
                      ),
                    ),
                function () {
                  te.forEach(function (e) {
                    return e();
                  });
                }
              );
            } catch (e) {
              console.warn(e);
            }
          }
          return (
            (me.addCustomEvent = function (e, t) {
              if (!ue)
                throw new Error(
                  "please add custom event after start recording",
                );
              ue(pe({ type: m.Custom, data: { tag: e, payload: t } }));
            }),
            (me.freezePage = function () {
              $.forEach(function (e) {
                return e.freeze();
              });
            }),
            (me.takeFullSnapshot = function (e) {
              if (!ce)
                throw new Error(
                  "please take full snapshot after start recording",
                );
              ce(e);
            }),
            (me.mirror = fe),
            me
          );
        })();
      const A = D;
      (!(function () {
        let e = document.getElementsByTagName("title").length
            ? document.getElementsByTagName("title")[0].innerHTML
            : "Screen",
          t = new URL(window.location.href),
          n = t.protocol + "//" + t.hostname + t.pathname + t.search + t.hash;
        parent &&
          parent.postMessage &&
          (parent.postMessage({ type: "PROTOTYPE_LOADED" }, "*"),
          parent.postMessage({ type: "NAVIGATION", url: n, title: e }, "*"));
      })(),
        window.addEventListener("message", (e) => {
          if (
            "http://localhost:8000" === e.origin ||
            e.origin.endsWith("useberry.com")
          ) {
            if ("START_USEBERRY_MAGIC" == e.data.type) {
              new L().start();
              let e = new URL(window.location.href),
                t =
                  e.protocol +
                  "//" +
                  e.hostname +
                  e.pathname +
                  e.search +
                  e.hash;
              parent &&
                parent.postMessage &&
                parent.postMessage({ type: "UB_MAGIC_READY", url: t }, "*");
            }
            "USEBERRY_PING" == e.data.type &&
              parent &&
              parent.postMessage &&
              parent.postMessage({ type: "USEBERRY_PONG" }, "*");
          }
        }));
      class L {
        constructor() {
          ((this.useberryTimeout = null),
            (this.triggerData = []),
            (this.originUrl = ""),
            (this.hostUrl = ""),
            (this.keyTenabled = !1),
            (this.handleKeyPressed = this.monitorKeysPressed.bind(this)),
            (this.handleKeyReleased = this.monitorKeysReleased.bind(this)),
            (this.handleMouseOver = this.mouseOverEvent.bind(this)),
            (this.handleScrollListener = this.scrollEvent.bind(this)));
        }
        start() {
          (window.addEventListener("message", (e) => {
            if (
              "http://localhost:8000" === e.origin ||
              e.origin.endsWith("useberry.com")
            ) {
              if ("UB_SHOW_USEBERRY_CLICKMAPS" == e.data.type) {
                if (
                  (this.clearUseberryInteractiveClick(),
                  this.userberryTimeout &&
                    (clearTimeout(this.userberryTimeout),
                    (this.userberryTimeout = null)),
                  !e.data.useberryData)
                )
                  return;
                var t = JSON.parse(e.data.useberryData);
                this.createUseberryClickMaps(t);
              }
              if (
                ("UB_START_USEBERRY_RECORDING" == e.data.type &&
                  A({
                    emit(e) {
                      var t = { type: "CAPTURE_EVENT" };
                      ((t.body = e),
                        parent &&
                          parent.postMessage &&
                          parent.postMessage(t, "*"));
                    },
                    sampling: { mousemove: 50, mousemoveCallback: 70 },
                    maskAllInputs: !0,
                  }),
                "UB_START_TRIGGER_EVENT" == e.data.type &&
                  (window.addEventListener("keyup", this.handleKeyReleased),
                  window.addEventListener("keydown", this.handleKeyPressed)),
                "UB_STOP_TRIGGER_EVENT" == e.data.type &&
                  (this.scrollEvent(),
                  window.removeEventListener("keyup", this.handleKeyReleased),
                  window.removeEventListener("keydown", this.handleKeyPressed),
                  window.removeEventListener(
                    "scroll",
                    this.handleScrollListener,
                  )),
                "UB_SENDING_TRIGGER_DATA" == e.data.type &&
                  ((this.triggerData = e.data.triggerData),
                  this.attachListenersToTriggers()),
                "UB_START_CLICK_CAPTURE" == e.data.type && this.attachHammer(),
                "UB_SHOW_CURRENT_TRIGGER" == e.data.type)
              ) {
                if (
                  e.data.trigger.currentUrl !==
                  this.formatUrl(this.depatternizeUrl(document.location.href))
                )
                  return;
                if (e.data.trigger.applyToAll) {
                  let t = document.querySelectorAll(e.data.trigger.applyToAll);
                  if (0 == t.length) return;
                  t.forEach((e) => {
                    this.drawHoverBox(e, !0);
                  });
                } else {
                  let t = r().decode(e.data.trigger.selector),
                    n = document.querySelector(t);
                  this.drawHoverBox(n, !0);
                }
                window.addEventListener("scroll", this.handleScrollListener);
              }
              if (
                ("UB_KEY_T_PRESSED" == e.data.type && this.startTriggerEvents(),
                "UB_KEY_T_RELEASED" == e.data.type && this.stopTriggerEvents(),
                "UB_TRIGGER_APPLY_ALL_SELECTOR" == e.data.type)
              ) {
                this.scrollEvent();
                let t = document.querySelectorAll(e.data.selector);
                if (0 == t.length) return;
                (t.forEach((e) => {
                  this.drawHoverBox(e, !0);
                }),
                  window.addEventListener("scroll", this.handleScrollListener));
              }
            }
          }),
            this.startObserver());
        }
        monitorKeysPressed(e) {
          "KeyT" == e.code &&
            (this.sendMessage({ type: "UB_KEY_T_PRESSED_CHILD" }),
            this.startTriggerEvents());
        }
        monitorKeysReleased(e) {
          "KeyT" == e.code &&
            (this.sendMessage({ type: "UB_KEY_T_RELEASED_CHILD" }),
            this.stopTriggerEvents());
        }
        startTriggerEvents() {
          this.keyTenabled ||
            ((this.keyTenabled = !0),
            window.addEventListener("mouseover", this.handleMouseOver),
            window.addEventListener("scroll", this.handleScrollListener),
            this.startTriggerEvents());
        }
        stopTriggerEvents() {
          ((this.keyTenabled = !1),
            this.scrollEvent(),
            window.removeEventListener("mouseover", this.handleMouseOver),
            window.removeEventListener("scroll", this.handleScrollListener));
        }
        startObserver() {
          var e = document.location.href,
            t = document.querySelector("body");
          new MutationObserver((t) => {
            t.forEach((t) => {
              ("childList" === t.type && this.processAnchorTags(),
                (("childList" == t.type && t.addedNodes) ||
                  ("attributes" == t.type && "class" == t.attributeName)) &&
                  ("attributes" == t.type &&
                    "class" == t.attributeName &&
                    this.attachListenersToTriggers(),
                  t.addedNodes.forEach((t) => {
                    if (
                      (this.attachListenersToTriggers(),
                      e !== document.location.href)
                    ) {
                      e = document.location.href;
                      let t = new URL(e),
                        n =
                          t.protocol +
                          "//" +
                          t.hostname +
                          t.pathname +
                          t.search +
                          t.hash,
                        r = document.getElementsByTagName("title").length
                          ? document.getElementsByTagName("title")[0].innerHTML
                          : "Screen";
                      this.sendMessage({
                        type: "NAVIGATION",
                        url: this.formatUrl(n),
                        title: r,
                      });
                    }
                  })));
            });
          }).observe(t, {
            attributeFilter: ["class"],
            childList: !0,
            subtree: !0,
          });
        }
        processAnchorTags() {
          document.querySelectorAll('a[target="_blank"]').forEach((e) => {
            e.hasAttribute("target") && e.setAttribute("target", "_self");
          });
        }
        attachHammer() {
          var e = document.getElementsByTagName("html")[0],
            t = new (R().Manager)(e);
          (t.add(new (R().Tap)({ event: "useberryTap", taps: 1 })),
            t.on("useberryTap", (e) => {
              let t = { type: "UB_CLICK_EVENT" },
                n = e.target.ownerDocument.defaultView,
                r = this.constructOffsetsArray(e.srcEvent.target);
              ((t.data = {
                pageScrolls: { x: n.pageXOffset, y: n.pageYOffset },
                clickPosition: { x: e.srcEvent.clientX, y: e.srcEvent.clientY },
                relativeTree: r,
                currentUrl: this.formatUrl(
                  this.depatternizeUrl(window.location.href),
                ),
              }),
                this.sendMessage(t));
            }));
        }
        attachListenersToTriggers() {
          this.triggerData.forEach((e) => {
            if (e.applyToAll) {
              let t = document.querySelectorAll(e.applyToAll);
              if (0 == t.length) return;
              return void t?.forEach((t) => {
                t.hasAttribute("data-ub-hastrigger") ||
                  (t.setAttribute("data-ub-hastrigger", e.triggerType),
                  t.addEventListener(e.triggerType, () => {
                    this.sendMessage({ type: "TRIGGER_COMPLETED", trigger: e });
                  }));
              });
            }
            if (
              e.currentUrl !==
              this.formatUrl(this.depatternizeUrl(document.location.href))
            )
              return;
            let t = r().decode(e.selector),
              n = document.querySelector(t);
            (n && n.hasAttribute("data-ub-hastrigger")) ||
              (n?.setAttribute("data-ub-hastrigger", e.triggerType),
              n?.addEventListener(e.triggerType, () => {
                this.sendMessage({ type: "TRIGGER_COMPLETED", trigger: e });
              }));
          });
        }
        findLinkAndReplace(e) {
          "A" == e.tagName &&
            (e.href = e.href.replace(this.originUrl, this.hostUrl));
        }
        clearUseberryInteractiveClick() {
          document.querySelectorAll("[data-ub-clickmap]").forEach((e) => {
            e.parentNode && e.parentNode.removeChild(e);
          });
        }
        createUseberryClickMaps(e) {
          e &&
            0 != e.length &&
            (e.forEach((e, t) => {
              const {
                clickPosition: n,
                pageScrolls: o,
                relativeTree: i,
              } = e.clickInfo;
              let a,
                s = n.x,
                l = n.y;
              if (0 == i.length) return;
              let u = i[0];
              if (
                ((u = i.filter((e) => this.filterClickParent(e)).shift()),
                !u || u.elementID)
              ) {
                if ("static" == u.position) {
                  let e = document.querySelector(r().decode(u.elementID));
                  e && (e.style.position = "relative");
                }
                if (
                  (u && u.elementID
                    ? (a = document.querySelector(r().decode(u.elementID)))
                    : ((a = document.getElementsByTagName("body")[0]),
                      (u = i.filter((e) => "BODY" == e.tag)[0])),
                  !document.querySelector(
                    "[data-ub-clickmap='" + u.elementID + "-" + t + "']",
                  ))
                ) {
                  let e = document.createElement("span");
                  (e.setAttribute("data-ub-clickmap", u.elementID + "-" + t),
                    (e.style.width = "30px"),
                    (e.style.height = "30px"),
                    (e.style.borderRadius = "100%"),
                    (e.style.margin = "-15px 0 0 -15px"),
                    (e.style.border = "3px solid #FFFFFF"),
                    (e.style.boxShadow = "0px 4px 10px rgb(74 74 89 / 40%)"),
                    (e.style.backgroundColor = "rgba(254, 63, 105, 0.8)"),
                    (e.style.position = "absolute"),
                    (e.style.pointerEvents = "none"),
                    (e.style.boxSizing = "border-box"),
                    (e.style.zIndex = 9),
                    (e.style.left = s + o.x + "px"),
                    (e.style.top = l + o.x + "px"),
                    u &&
                      ((e.style.left = n.x - u.x + "px"),
                      (e.style.top = n.y - u.y + "px")));
                  try {
                    a.appendChild(e);
                  } catch (e) {}
                }
              }
            }),
            (this.userberryTimeout = setTimeout(() => {
              this.createUseberryClickMaps(e);
            }, 800)));
        }
        filterClickParent(e) {
          return (
            "TEXTAREA" !== e.tag &&
            "INPUT" !== e.tag &&
            "IMG" !== e.tag &&
            "path" !== e.tag &&
            "svg" !== e.tag &&
            "use" !== e.tag &&
            "g" !== e.tag &&
            "SELECT" !== e.tag &&
            "IFRAME" !== e.tag &&
            "EM" !== e.tag &&
            "image" !== e.tag &&
            "VIDEO" !== e.tag &&
            "BUTTON" !== e.tag &&
            "LOTTIE-PLAYER" !== e.tag
          );
        }
        sendMessage(e) {
          parent && parent.postMessage && parent.postMessage({ ...e }, "*");
        }
        addUniqueElement(e) {
          let t;
          try {
            t = a(e, { threshold: 10 });
          } catch (e) {}
          t &&
            !this.checkForTag(e) &&
            e.setAttribute("useberryUnique", this.stringToBase64(t));
        }
        scrollEvent() {
          var e = document.querySelectorAll("#useberry_mouseover_overlay");
          e.length &&
            e.forEach((e) => {
              e.remove();
            });
        }
        mouseOverEvent(e) {
          if (
            "useberry_mouseover_overlay" == e.target.id ||
            "useberry_save_button" == e.target.id ||
            "useberry_save_button2" == e.target.id
          )
            return;
          var t = document.querySelectorAll("#useberry_mouseover_overlay");
          t.length &&
            t.forEach((e) => {
              e.remove();
            });
          let n = e.target,
            r = this.drawHoverBox(n),
            o = document.getElementsByTagName("body")[0],
            i = {};
          ((i.classList = e.target.classList),
            (i.selector = this.stringToBase64(a(e.target, { threshold: 10 }))),
            (i.currentUrl = this.formatUrl(
              this.depatternizeUrl(document.location.href),
            )),
            this.sendMessage({
              type: "TRIGGER_SELECTED",
              trigger: JSON.stringify(i),
            }),
            o.appendChild(r));
        }
        drawHoverBox(e, t = !1) {
          let n = e.getBoundingClientRect(),
            r = document.createElement("div");
          return (
            (r.id = "useberry_mouseover_overlay"),
            (r.style.position = "fixed"),
            (r.style.pointerEvents = "none"),
            (r.style.width = n.width + "px"),
            (r.style.height = n.height + "px"),
            (r.style.top = n.top + "px"),
            (r.style.left = n.left + "px"),
            (r.style.zIndex = 9999),
            (r.style.border = "1px dashed #FF3666"),
            (r.style.borderRadius = "5px"),
            (r.style.backgroundColor = "rgba(255,54,102,0.15)"),
            t && document.getElementsByTagName("body")[0].appendChild(r),
            r
          );
        }
        stringToBase64(e) {
          return r().encode(e);
        }
        checkForTag(e) {
          let t = !1;
          return (
            ("SCRIPT" != e.tagName &&
              "LINK" != e.tagName &&
              "STYLE" != e.tagName &&
              "HEAD" != e.tagName &&
              "HTML" != e.tagName &&
              "META" != e.tagName &&
              "BASE" != e.tagName &&
              "TITLE" != e.tagName) ||
              (t = !0),
            t
          );
        }
        constructOffsetsArray(e) {
          let t = [];
          for (; e && "HTML" !== e.tagName; ) {
            let n = this.addUniqueElement(e);
            e?.hasAttribute("useberryUnique") &&
              (n = e.getAttribute("useberryUnique"));
            let o = e.getBoundingClientRect(),
              i = {};
            ((i.x = o.left),
              (i.y = o.top),
              (i.elementID = n),
              (i.tag = e.tagName),
              n && (i.selector = r().decode(n)),
              (i.position = getComputedStyle(e).position),
              t.push(i),
              (e = e.parentNode));
          }
          return t;
        }
        depatternizeUrl(e) {
          let t = new URL(e),
            n = t.hostname.split(".")[0];
          if (String(n).startsWith("ubtag")) {
            let e = n.slice(5),
              o = "/" == t.pathname ? "" : t.pathname;
            var r = new RegExp("8-8", "gi");
            return (
              (e = String(e).replace(r, ".")),
              (e = t.protocol + "//" + e + o + t.search),
              t.hash,
              e
            );
          }
          return e;
        }
        formatUrl(e) {
          let t = new URL(e);
          return (
            t.protocol + "//" + t.hostname + t.pathname + t.search + t.hash
          );
        }
      }
    })(),
    (useberryLive = {}));
})();
