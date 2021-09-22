import d3 from "d3";

export default function() {
  let values = stackValues;
  let order = stackOrder;
  let offset = stackOffset;
  let out = stackOut;
  let x = stackX;
  let y = stackY;

  function stack(data, index) {
    return data;
  }

  stack.values = function(x) {
    return arguments.length ? (values = x) : values;
  };

  stack.order = function(x) {
    return arguments.length ? (order = x) : order;
  };

  stack.offset = function(x) {
    return arguments.length ? (offset = x) : offset;
  };

  stack.x = function(z) {
    return arguments.length ? (x = z) : x;
  };

  stack.y = function(z) {
    return arguments.length ? (y = z) : y;
  };

  stack.out = function(z) {
    return arguments.length ? (out = z) : out;
  };
}

function stackValues(data) {
  return data;
}

function stackOrder(data) {
  return d3.range(data.length);
}

function stackX(d) {
  return d.x;
}

function stackY(d) {
  return d.y;
}

function stackOut(d, y0, y) {
  d.y0 = y0;
  d.y = y;
}

function stackOffset(data) {}
