import d3 from "d3";

// d3.layout.stack applies offsets only to the first value within a group
// this wrapper does that to each value to stack positive and negative series separately

export function stack() {
  const inner = d3.layout.stack();

  let values = inner.values();
  let order = inner.order();
  let x = inner.x();
  let y = inner.y();
  let out = inner.out();
  let offset = stackOffsetZero;

  function stack(data, index) {
    const n = data.length;

    if (!n) {
      return data;
    }

    // convert series to canonical two-dimensional representation
    let series = data.map(function (d, i) {
      return values.call(stack, d, i);
    });

    // convert each series to canonical [[x,y]] representation
    let points = series.map(function (d) {
      return d.map(function (v, i) {
        return [x.call(stack, v, i), y.call(stack, v, i)];
      });
    });

    // compute the order of series, and permute them
    const orders = order.call(stack, points, index);
    series = d3.permute(series, orders);
    points = d3.permute(points, orders);

    // compute the baseline
    const offsets = offset.call(stack, points, index);

    // propagate it to other series
    const m = series[0].length;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        out.call(stack, series[i][j], offsets[i][j], points[i][j][1]);
      }
    }

    return data;
  }

  stack.values = function (x) {
    if (!arguments.length) {
      return values;
    }

    values = x;
    return stack;
  };

  stack.order = function (x) {
    if (!arguments.length) {
      return order;
    }

    order = x;
    return stack;
  };

  stack.offset = function (x) {
    if (!arguments.length) {
      return offset;
    }

    offset = x;
    return stack;
  };

  stack.x = function (z) {
    if (!arguments.length) {
      return x;
    }

    x = z;
    return stack;
  };

  stack.y = function (z) {
    if (!arguments.length) {
      return y;
    }

    y = z;
    return stack;
  };

  stack.out = function (z) {
    if (!arguments.length) {
      return out;
    }

    out = z;
    return stack;
  };

  return stack;
}

// series are stacked on top of each other, starting from zero
export function stackOffsetZero(data) {
  const n = data.length;
  const m = data[0].length;
  const y0 = [];

  for (let i = 0; i < n; i++) {
    y0[i] = [];
  }

  for (let j = 0; j < m; j++) {
    for (let i = 0, d = 0; i < n; i++) {
      y0[i][j] = d;
      d += data[i][j][1];
    }
  }

  return y0;
}

// series are stacked with separate tracks for positive and negative values
export function stackOffsetDiverging(data) {
  const n = data.length;
  const m = data[0].length;
  const y0 = [];

  for (let i = 0; i < n; i++) {
    y0[i] = [];
  }

  for (let j = 0; j < m; j++) {
    for (let i = 0, dp = 0, dn = 0; i < n; i++) {
      if (data[i][j][1] >= 0) {
        y0[i][j] = dp;
        dp += data[i][j][1];
      } else {
        y0[i][j] = dn;
        dn += data[i][j][1];
      }
    }
  }

  return y0;
}
