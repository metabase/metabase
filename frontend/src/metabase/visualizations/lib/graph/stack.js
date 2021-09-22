import d3 from "d3";

export function stack() {
  const inner = d3.layout.stack();
  let values = inner.values();
  let order = inner.order();
  let x = inner.x();
  let y = inner.y();
  let out = inner.out();
  let offset = stackOffset;

  function stack(data, index) {
    if (!data.length) {
      return data;
    }

    // Convert series to canonical two-dimensional representation.
    let series = data.map(function(d, i) {
      return values.call(stack, d, i);
    });

    // Convert each series to canonical [[x,y]] representation.
    let points = series.map(function(d) {
      return d.map(function(v, i) {
        return [x.call(stack, v, i), y.call(stack, v, i)];
      });
    });

    // Compute the order of series, and permute them.
    const orders = order.call(stack, points, index);
    series = d3.permute(series, orders);
    points = d3.permute(points, orders);

    // Compute the baseline…
    const offsets = offset.call(stack, points, index);

    // And propagate it to other series.
    for (let j = 0; j < series[0].length; ++j) {
      for (let i = 0; i < data.length; ++i) {
        out.call(stack, series[i][j], offsets[i][j], points[i][j][1]);
      }
    }

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

  return stack;
}

function stackOffset(data) {
  const n = data.length;
  const m = data[0].length;
  const y0 = [];

  for (let j = 0; j < n; j++) {
    y0[j] = [];

    for (let i = 0; i < m; i++) {
      y0[j][i] = 0;
    }
  }

  return y0;
}
