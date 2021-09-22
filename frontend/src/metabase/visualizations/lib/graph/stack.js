import d3 from "d3";

export function stack() {
  const inner = d3.layout.stack();

  let values = inner.values();
  let order = inner.order();
  let x = inner.x();
  let y = inner.y();
  let out = inner.out();
  let offset = stackOffsetZero;

  function outer(data, index) {
    const n = data.length;

    if (!n) {
      return data;
    }

    // Convert series to canonical two-dimensional representation.
    let series = data.map(function(d, i) {
      return values.call(outer, d, i);
    });

    // Convert each series to canonical [[x,y]] representation.
    let points = series.map(function(d) {
      return d.map(function(v, i) {
        return [x.call(outer, v, i), y.call(outer, v, i)];
      });
    });

    // Compute the order of series, and permute them.
    const orders = order.call(outer, points, index);
    series = d3.permute(series, orders);
    points = d3.permute(points, orders);

    // Compute the baseline…
    const offsets = offset.call(outer, points, index);

    // And propagate it to other series.
    const m = series[0].length;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        out.call(outer, series[i][j], offsets[i][j], points[i][j][1]);
      }
    }

    return data;
  }

  outer.values = function(x) {
    if (!arguments.length) {
      return values;
    }

    values = x;
    return outer;
  };

  outer.order = function(x) {
    if (!arguments.length) {
      return order;
    }

    order = x;
    return outer;
  };

  outer.offset = function(x) {
    if (!arguments.length) {
      return offset;
    }

    offset = x;
    return outer;
  };

  outer.x = function(z) {
    if (!arguments.length) {
      return x;
    }

    x = z;
    return outer;
  };

  outer.y = function(z) {
    if (!arguments.length) {
      return y;
    }

    y = z;
    return outer;
  };

  outer.out = function(z) {
    if (!arguments.length) {
      return out;
    }

    out = z;
    return outer;
  };

  return outer;
}

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
