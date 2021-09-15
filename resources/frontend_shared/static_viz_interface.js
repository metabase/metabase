const toJSArray = a => {
  var jsArray = [];
  for (var i = 0; i < a.length; i++) {
    jsArray[i] = a[i];
  }
  return jsArray;
};

function toJSMap(m) {
  var o = {};
  for (var i = 0; i < m.length; i++) {
    o[m[i][0]] = m[i][1];
  }
  return o;
}

const date_accessors = {
  x: row => new Date(row[0]).valueOf(),
  y: row => row[1],
};

const positional_accessors = {
  x: row => row[0],
  y: row => row[1],
};

const dimension_accessors = {
  dimension: row => row[0],
  metric: row => row[1],
};

function timeseries_line(data, labels, settings) {
  return StaticViz.RenderChart("timeseries/line", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    accessors: date_accessors,
    settings: JSON.parse(settings),
  });
}

function timeseries_bar(data, labels, settings) {
  return StaticViz.RenderChart("timeseries/bar", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    accessors: date_accessors,
    settings: JSON.parse(settings),
  });
}

function categorical_bar(data, labels, settings) {
  return StaticViz.RenderChart("categorical/bar", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    accessors: positional_accessors,
    settings: JSON.parse(settings),
  });
}

function categorical_donut(rows, colors) {
  return StaticViz.RenderChart("categorical/donut", {
    data: toJSArray(rows),
    colors: toJSMap(colors),
    accessors: dimension_accessors,
  });
}
