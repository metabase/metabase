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

function timeseries_line(data, labels, settings) {
  return StaticViz.RenderChart("timeseries/line", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function timeseries_bar(data, labels, settings) {
  return StaticViz.RenderChart("timeseries/bar", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function timeseries_area(data, labels, settings) {
  return StaticViz.RenderChart("timeseries/area", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function combo_chart(series, settings, colors) {
  // Thinking of combo as similar to multiple, although they're different in BE
  return StaticViz.RenderChart("combo-chart", {
    series: JSON.parse(series),
    settings: JSON.parse(settings),
    colors: JSON.parse(colors),
  });
}

function timeseries_waterfall(data, labels, settings) {
  return StaticViz.RenderChart("timeseries/waterfall", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function funnel(data, settings) {
  return StaticViz.RenderChart("funnel", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
  });
}

function categorical_bar(data, labels, settings) {
  return StaticViz.RenderChart("categorical/bar", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function categorical_area(data, labels, settings) {
  return StaticViz.RenderChart("categorical/area", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function categorical_line(data, labels, settings) {
  return StaticViz.RenderChart("categorical/line", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function categorical_donut(rows, colors) {
  return StaticViz.RenderChart("categorical/donut", {
    data: toJSArray(rows),
    colors: toJSMap(colors),
  });
}

function categorical_waterfall(data, labels, settings) {
  return StaticViz.RenderChart("categorical/waterfall", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
  });
}

function progress(data, settings) {
  return StaticViz.RenderChart("progress", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
  });
}
