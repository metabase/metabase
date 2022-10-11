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

function combo_chart(series, settings, colors) {
  // Thinking of combo as similar to multiple, although they're different in BE
  return StaticViz.RenderChart("combo-chart", {
    series: JSON.parse(series),
    settings: JSON.parse(settings),
    colors: JSON.parse(colors),
  });
}

function gauge(card, data) {
  return StaticViz.RenderChart("gauge", {
    card: JSON.parse(card),
    data: JSON.parse(data),
  });
}

function waterfall(data, labels, settings, waterfallType, instanceColors) {
  return StaticViz.RenderChart("waterfall", {
    data: toJSArray(data),
    labels: toJSMap(labels),
    settings: JSON.parse(settings),
    type: waterfallType,
    colors: JSON.parse(instanceColors),
  });
}

function funnel(data, settings) {
  return StaticViz.RenderChart("funnel", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
  });
}

function categorical_donut(rows, colors) {
  return StaticViz.RenderChart("categorical/donut", {
    data: toJSArray(rows),
    colors: toJSMap(colors),
  });
}

function progress(data, settings) {
  return StaticViz.RenderChart("progress", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
  });
}
