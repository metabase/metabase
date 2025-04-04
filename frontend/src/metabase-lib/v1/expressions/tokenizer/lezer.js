// This file was generated by lezer-generator. You probably shouldn't edit it.
import { LRParser } from "@lezer/lr";

import { reference } from "./tokens";
const spec_Identifier = {
  __proto__: null,
  true: 90,
  truE: 90,
  trUe: 90,
  trUE: 90,
  tRue: 90,
  tRuE: 90,
  tRUe: 90,
  tRUE: 90,
  True: 90,
  TruE: 90,
  TrUe: 90,
  TrUE: 90,
  TRue: 90,
  TRuE: 90,
  TRUe: 90,
  TRUE: 90,
  false: 92,
  falsE: 92,
  falSe: 92,
  falSE: 92,
  faLse: 92,
  faLsE: 92,
  faLSe: 92,
  faLSE: 92,
  fAlse: 92,
  fAlsE: 92,
  fAlSe: 92,
  fAlSE: 92,
  fALse: 92,
  fALsE: 92,
  fALSe: 92,
  fALSE: 92,
  False: 92,
  FalsE: 92,
  FalSe: 92,
  FalSE: 92,
  FaLse: 92,
  FaLsE: 92,
  FaLSe: 92,
  FaLSE: 92,
  FAlse: 92,
  FAlsE: 92,
  FAlSe: 92,
  FAlSE: 92,
  FALse: 92,
  FALsE: 92,
  FALSe: 92,
  FALSE: 92,
  and: 94,
  anD: 94,
  aNd: 94,
  aND: 94,
  And: 94,
  AnD: 94,
  ANd: 94,
  AND: 94,
  or: 96,
  oR: 96,
  Or: 96,
  OR: 96,
  not: 98,
  Not: 98,
  nOt: 98,
  noT: 98,
  NOt: 98,
  nOT: 98,
  NoT: 98,
  NOT: 98,
};
export const parser = LRParser.deserialize({
  version: 14,
  states:
    ")SOVQROOOzOSO'#C`O!YOWO'#C`OOQO'#Cc'#CcOOQO'#Ce'#CeOOQO'#Cb'#CbQ!hQQOOOVQRO'#CsO#`QQO'#CvOOQP'#C{'#C{OVQRO'#CzOOQO'#C|'#C|OVQRO'#C|OOQO'#DT'#DTOOOO'#C}'#C}O#eOSO,58zOOQO,58z,58zOOOO'#DO'#DOO#sOWO,58zOOQP'#Ck'#CkOOQP'#Cl'#ClOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QOVQRO,59QO$RQQO,59_O$YQRO,59bOOQO,59f,59fO$aQQO,59hOOOO-E6{-E6{OOQO1G.f1G.fOOOO-E6|-E6|OOQO1G.l1G.lO%lQQO1G.lO%sQQO1G.lO&xQQO1G.lO'PQQO1G.lO(UQQO1G.lO(]QQO1G.lO)bQQO1G.lO)iQQO1G.lO*nQQO1G.lO*uQQO1G.lO+qQQO1G.lOOQO1G.y1G.yO,RQQO'#CxO,]QQO'#CwOOQO1G.|1G.|O,eQQO1G.|OVQRO'#DPO,jQQO,59cOOQO7+$h7+$hOOQO,59k,59kOOQO-E6}-E6}",
  stateData:
    ",r~OvOS~OP]OR]OWWOZZO[[OhVOxPO{QO}RO!OSO!RXO~OT^Ox`Oy^Oz`O~OTaOz`O{`O|aO~OZeO[fO]gO^hOakOblOcmOdnOeoOfpO!PcO!QdO~OhrO~OT^OxvOy^OzvO~OTaOzvO{vO|aO~Oi!UO~P!hOi!XO~PVOtpaipampa~P!hOZeO]Yi^YiaYibYicYidYieYifYitYi!PYi!QYiiYimYi~O[Yi~P$nO[fO~P$nOZeO[fO]gOaYibYicYidYieYifYitYi!PYi!QYiiYimYi~O^Yi~P%zO^hO~P%zOZeO[fO]gO^hO!PcOaYibYicYidYieYifYitYiiYimYi~O!QYi~P'WO!QdO~P'WOZeO[fO]gO^hOakO!PcO!QdOcYidYieYifYitYiiYimYi~ObYi~P(dOblO~P(dOZeO[fO]gO^hOakOblOcmO!PcO!QdOeYifYitYiiYimYi~OdYi~P)pOdnO~P)pOZeO[fO]gO^hOakOblOcmOdnOeoO!PcO!QdO~OfYitYiiYimYi~P*|OilXmlX~P!hOm!ZOikX~Oi!]O~Om!ZOika~O",
  goto: "%exPPPPyPy!_P!_yPPPP!s#QPPPPPPyPPy#^#aPy#gy#{$R$XPPP$_u]OVY[efghijklmnopr!ZuTOVY[efghijklmnopr!ZgiUqt}!O!P!Q!R!S!T!VejUqt!O!P!Q!R!S!T!VR!YrQ!WrR!^!ZuYOVY[efghijklmnopr!ZQ_PRu_QbQRwbQ![!WR!_![QUOQqVQsYQt[QxeQyfQzgQ{hQ|iQ}jQ!OkQ!PlQ!QmQ!RnQ!SoQ!TpT!Vr!Z",
  nodeNames:
    "⚠ Reference Expression Number String Escape Boolean True Identifier False BinaryExpression + - * / And Or > >= < <= = != ParenExpression ( ) CallExpression ArgList Arg , UnaryExpression Not SignedExpression",
  maxTerm: 49,
  nodeProps: [["isolate", 4, ""]],
  skippedNodes: [0],
  repeatNodeCount: 3,
  tokenData:
    "Hv~R!TOX$bXY&hYZ)dZ^&h^p$bpq&hqr*Zrs+ysw$bwx,dxy,}yz-sz{.i{|/_|}0T}!O0y!O!P1o!P!Q6X!Q!R6}!R![8u![!^$b!^!_@s!_!`Be!`!aCZ!a!c$b!c!}D{!}#O$b#O#PFa#P#R$b#R#SD{#S#T$b#T#oD{#o#y$b#y#z&h#z$f$b$f$g&h$g#BY$b#BY#BZ&h#BZ$IS$b$IS$I_&h$I_$I|$b$I|$JO&h$JO$JT$b$JT$JU&h$JU$KV$b$KV$KW&h$KW&FU$b&FU&FV&h&FV;'S$b;'S;=`&b<%lO$bU$iXyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bS%ZU|SOY%UZw%Ux#O%U#P;'S%U;'S;=`%m<%lO%US%pP;=`<%l%UQ%xUyQOY%sZr%ss#O%s#P;'S%s;'S;=`&[<%lO%sQ&_P;=`<%l%sU&eP;=`<%l$bV&qnvPyQ|SOX$bXY&hYZ(oZ^&h^p$bpq&hqr$brs%Usw$bwx%sx#O$b#P#y$b#y#z&h#z$f$b$f$g&h$g#BY$b#BY#BZ&h#BZ$IS$b$IS$I_&h$I_$I|$b$I|$JO&h$JO$JT$b$JT$JU&h$JU$KV$b$KV$KW&h$KW&FU$b&FU&FV&h&FV;'S$b;'S;=`&b<%lO$bP(tYvPX^(opq(o#y#z(o$f$g(o#BY#BZ(o$IS$I_(o$I|$JO(o$JT$JU(o$KV$KW(o&FU&FV(oV)kYzUvPX^(opq(o#y#z(o$f$g(o#BY#BZ(o$IS$I_(o$I|$JO(o$JT$JU(o$KV$KW(o&FU&FV(oV*bZyQ|SOY$bZr$brs%Usw$bwx%sx!_$b!_!`+T!`#O$b#P;'S$b;'S;=`&b<%lO$bV+^XfPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV,QUxR|SOY%UZw%Ux#O%U#P;'S%U;'S;=`%m<%lO%UV,kU{TyQOY%sZr%ss#O%s#P;'S%s;'S;=`&[<%lO%sV-WXhPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV-|XiPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV.rX]PyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV/hXZPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV0^XmPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV1SX[PyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV1vZyQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q![2i![#O$b#P;'S$b;'S;=`&b<%lO$bV2raRPyQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q![2i![!g$b!g!h3w!h#O$b#P#R$b#R#S2i#S#X$b#X#Y3w#Y;'S$b;'S;=`&b<%lO$bV4QaRPyQ|SOY$bZr$brs%Usw$bwx%sx{$b{|5V|}$b}!O5V!O!Q$b!Q![5V![#O$b#P#R$b#R#S5V#S;'S$b;'S;=`&b<%lO$bV5`]RPyQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q![5V![#O$b#P#R$b#R#S5V#S;'S$b;'S;=`&b<%lO$bV6bX^PyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV7WiRPyQ|SOY$bZr$brs%Usw$bwx%sx!O$b!O!P2i!P!Q$b!Q![8u![!g$b!g!h3w!h#O$b#P#R$b#R#S8u#S#U$b#U#V:Z#V#X$b#X#Y3w#Y#c$b#c#d=_#d#l$b#l#m?g#m;'S$b;'S;=`&b<%lO$bV9OcRPyQ|SOY$bZr$brs%Usw$bwx%sx!O$b!O!P2i!P!Q$b!Q![8u![!g$b!g!h3w!h#O$b#P#R$b#R#S8u#S#X$b#X#Y3w#Y;'S$b;'S;=`&b<%lO$bV:b^yQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q!R;^!R!S;^!S#O$b#P#R$b#R#S;^#S;'S$b;'S;=`&b<%lO$bV;g`RPyQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q!R;^!R!S;^!S#O$b#P#R$b#R#S;^#S#b$b#b#c<i#c;'S$b;'S;=`&b<%lO$bV<rXRPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bV=f]yQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q!Y>_!Y#O$b#P#R$b#R#S>_#S;'S$b;'S;=`&b<%lO$bV>h_RPyQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q!Y>_!Y#O$b#P#R$b#R#S>_#S#b$b#b#c<i#c;'S$b;'S;=`&b<%lO$bV?nayQ|SOY$bZr$brs%Usw$bwx%sx!Q$b!Q![<i![!c$b!c!i<i!i#O$b#P#R$b#R#S<i#S#T$b#T#Z<i#Z;'S$b;'S;=`&b<%lO$bV@|ZcPyQ|SOY$bZr$brs%Usw$bwx%sx!_$b!_!`Ao!`#O$b#P;'S$b;'S;=`&b<%lO$bVAxXdPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bVBnXePyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bVCdZaPyQ|SOY$bZr$brs%Usw$bwx%sx!_$b!_!`DV!`#O$b#P;'S$b;'S;=`&b<%lO$bVD`XbPyQ|SOY$bZr$brs%Usw$bwx%sx#O$b#P;'S$b;'S;=`&b<%lO$bVEUcWPyQ|SOY$bZr$brs%Usw$bwx%sx!O$b!O!PD{!P!Q$b!Q![D{![!c$b!c!}D{!}#O$b#P#R$b#R#SD{#S#T$b#T#oD{#o;'S$b;'S;=`&b<%lO$b~FdVO#iFy#i#jGO#j#lFy#l#mGk#m;'SFy;'S;=`Hp<%lOFy~GOOT~~GRS!Q![G_!c!iG_#T#ZG_#o#pHT~GbR!Q![Gk!c!iGk#T#ZGk~GnR!Q![Gw!c!iGw#T#ZGw~GzR!Q![Fy!c!iFy#T#ZFy~HWR!Q![Ha!c!iHa#T#ZHa~HdS!Q![Ha!c!iHa#T#ZHa#q#rFy~HsP;=`<%lFy",
  tokenizers: [reference, 0, 1, 2],
  topRules: { Expression: [0, 2] },
  specialized: [{ term: 8, get: (value) => spec_Identifier[value] || -1 }],
  tokenPrec: 0,
});
