import "raf/polyfill";

if (!SVGElement.prototype.getBBox) {
  SVGElement.prototype.getBBox = function() {
    return { x: 0, y: 0, width: 0, height: 0 };
  };
}
