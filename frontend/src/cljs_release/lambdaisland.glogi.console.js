var window=global;var $CLJS=require("./cljs_env.js");require("./cljs.core.js");require("./lambdaisland.glogi.js");require("./lambdaisland.glogi.print.js");
'use strict';var vG=function(){},BG=function(a){var b=$CLJS.I(a,0,null);a=$CLJS.I(a,1,null);return new $CLJS.P(null,2,5,$CLJS.Q,[[$CLJS.q.g(b),$CLJS.q.g(" ")].join(""),a],null)},DG=function(a,b,c){var d=$CLJS.I(a,0,null);a=$CLJS.I(a,1,null);return new $CLJS.P(null,2,5,$CLJS.Q,[[$CLJS.q.g(d),"%c",$CLJS.q.g(b),"%c"].join(""),$CLJS.Gd.o(a,["color:",$CLJS.q.g($CLJS.K.h($CLJS.uG,$CLJS.oJ)),";background-color:",$CLJS.q.g($CLJS.K.h($CLJS.uG,c))].join(""),$CLJS.G(["color:black;background-color:inherit"]))],
null)},CG=function(a,b,c){var d=$CLJS.I(a,0,null);a=$CLJS.I(a,1,null);return new $CLJS.P(null,2,5,$CLJS.Q,[[$CLJS.q.g(d),"%c",$CLJS.q.g(b),"%c"].join(""),$CLJS.Gd.o(a,["color:",$CLJS.q.g($CLJS.K.h($CLJS.uG,c))].join(""),$CLJS.G(["color:black"]))],null)},yG=function(a){return $CLJS.K.h($CLJS.iF,a).value},AG=function(a){var b=yG(a);return $CLJS.p(function(){var c=yG($CLJS.vI);return $CLJS.zG.h?$CLJS.zG.h(c,b):$CLJS.zG.call(null,c,b)}())?$CLJS.cJ:$CLJS.p(function(){var c=yG($CLJS.uI);return $CLJS.zG.h?
$CLJS.zG.h(c,b):$CLJS.zG.call(null,c,b)}())?$CLJS.mJ:$CLJS.p(function(){var c=yG($CLJS.sI);return $CLJS.zG.h?$CLJS.zG.h(c,b):$CLJS.zG.call(null,c,b)}())?$CLJS.fJ:$CLJS.p(function(){var c=yG($CLJS.jI);return $CLJS.zG.h?$CLJS.zG.h(c,b):$CLJS.zG.call(null,c,b)}())?$CLJS.lJ:$CLJS.p(function(){var c=yG($CLJS.tI);return $CLJS.zG.h?$CLJS.zG.h(c,b):$CLJS.zG.call(null,c,b)}())?$CLJS.nJ:$CLJS.p(function(){var c=yG($CLJS.nI);return $CLJS.zG.h?$CLJS.zG.h(c,b):$CLJS.zG.call(null,c,b)}())?$CLJS.iJ:$CLJS.p(function(){var c=
yG($CLJS.fI);return $CLJS.zG.h?$CLJS.zG.h(c,b):$CLJS.zG.call(null,c,b)}())?$CLJS.jJ:$CLJS.kJ},EG=function(a){function b(c,d){return d>=c}a=yG(a);if(b(yG($CLJS.vI),a))return"error";if(b(yG($CLJS.uI),a))return"warn";if(b(yG($CLJS.sI),a))return"info";b(yG($CLJS.jI),a);return"log"},FG=function(a){return function(b){var c=$CLJS.je(b),d=$CLJS.K.h(c,$CLJS.gI),e=$CLJS.K.h(c,$CLJS.Ru);b=$CLJS.K.h(c,$CLJS.zI);e=EG(e);e=$CLJS.xa(console,e);e=$CLJS.p(e)?e:console.log;$CLJS.fe.h(e,a.g?a.g(c):a.call(null,c));return $CLJS.p(b)?
(c=["[",$CLJS.q.g(d),"]"].join(""),d=$CLJS.q.g(b),b=b.stack,e.O?e.O(c,d,"\n",b):e.call(null,c,d,"\n",b)):null}},GG=function GG(a,b){for(;;){if($CLJS.E.h($CLJS.bJ,b))return CG(a,", ",$CLJS.kJ);if($CLJS.E.h($CLJS.dJ,b))return BG(a);if(b instanceof $CLJS.M)return CG(a,b,$CLJS.fJ);if(b instanceof $CLJS.t)return CG(a,b,$CLJS.lJ);if("string"===typeof b)return CG(a,$CLJS.gh.o($CLJS.G([b])),$CLJS.eJ);if($CLJS.Pe(b)){var d=BG(function(){var f=a,g=$CLJS.kb(b);return GG.h?GG.h(f,g):GG.call(null,f,g)}()),e=$CLJS.lb(b);
return GG.h?GG.h(d,e):GG.call(null,d,e)}if(b instanceof $CLJS.n||b instanceof $CLJS.Xf)return d=a,d=CG(d,"{",$CLJS.pJ),d=$CLJS.qd(GG,d,$CLJS.xG($CLJS.bJ,b)),CG(d,"}",$CLJS.pJ);if($CLJS.Xc(b))return d=a,d=CG(d,["#",$CLJS.q.g(function(){var f=$CLJS.Na(b),g=f.name;return $CLJS.Tc(g)?$CLJS.gh.o($CLJS.G([f])):g}())," "].join(""),$CLJS.gJ),d=CG(d,"{",$CLJS.pJ),d=$CLJS.qd(GG,d,$CLJS.xG($CLJS.bJ,b)),CG(d,"}",$CLJS.pJ);if($CLJS.Vc(b))return d=a,d=CG(d,"#{",$CLJS.pJ),d=$CLJS.qd(GG,d,$CLJS.xG($CLJS.dJ,b)),CG(d,
"}",$CLJS.pJ);if($CLJS.Zc(b))return d=a,d=CG(d,"[",$CLJS.pJ),d=$CLJS.qd(GG,d,$CLJS.xG($CLJS.dJ,b)),CG(d,"]",$CLJS.pJ);if($CLJS.Hh(b))return d=a,d=CG(d,"(",$CLJS.gJ),d=$CLJS.qd(GG,d,$CLJS.xG($CLJS.dJ,b)),CG(d,")",$CLJS.gJ);if(null!=b?b.M&16384||$CLJS.gc===b.Od||(b.M?0:$CLJS.Ma(vG,b)):$CLJS.Ma(vG,b))d=CG(a,"#atom ",$CLJS.gJ),e=$CLJS.pb(b),a=d,b=e;else if($CLJS.nh(b))d=CG(a,"#uuid ",$CLJS.gJ),e=$CLJS.q.g(b),a=d,b=e;else if($CLJS.ee(b))d=CG(a,"#js ",$CLJS.gJ),e=$CLJS.qd(function(f,g){return function(l,
k){return $CLJS.Cg.j(l,$CLJS.yg.g(k),$CLJS.xa(g,k))}}(a,b),$CLJS.ie,Object.keys(b)),a=d,b=e;else if($CLJS.Ka(b))d=CG(a,"#js ",$CLJS.gJ),e=$CLJS.uf.h($CLJS.Te,b),a=d,b=e;else return CG(a,$CLJS.gh.o($CLJS.G([b])),$CLJS.hJ)}};$CLJS.HG=FG(function(a){a=$CLJS.je(a);$CLJS.K.h(a,$CLJS.Ru);var b=$CLJS.K.h(a,$CLJS.gI),c=$CLJS.K.h(a,$CLJS.Wi);$CLJS.K.h(a,$CLJS.zI);return new $CLJS.P(null,2,5,$CLJS.Q,[["[",$CLJS.q.g(b),"]"].join(""),c],null)});
$CLJS.IG=FG(function(a){var b=$CLJS.je(a),c=$CLJS.K.h(b,$CLJS.Ru);a=$CLJS.K.h(b,$CLJS.gI);var d=$CLJS.K.h(b,$CLJS.Wi);$CLJS.K.h(b,$CLJS.zI);b=AG(c);d=GG(BG(DG(DG(DG(new $CLJS.P(null,2,5,$CLJS.Q,["",$CLJS.Te],null),"[",b),a,b),"]",b)),d);a=$CLJS.I(d,0,null);d=$CLJS.I(d,1,null);return $CLJS.Jd(a,d)});
$CLJS.JG=FG(function(a){a=$CLJS.je(a);$CLJS.K.h(a,$CLJS.Ru);var b=$CLJS.K.h(a,$CLJS.gI),c=$CLJS.K.h(a,$CLJS.Wi);$CLJS.K.h(a,$CLJS.zI);return new $CLJS.P(null,2,5,$CLJS.Q,[["[",$CLJS.q.g(b),"]"].join(""),$CLJS.gh.o($CLJS.G([c]))],null)});