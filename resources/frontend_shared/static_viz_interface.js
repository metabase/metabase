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

function row_chart(settings, data, colors) {
  return StaticViz.RenderChart("row", {
    settings: JSON.parse(settings),
    data: JSON.parse(data),
    colors: JSON.parse(colors),
  });
}

function isomorphic(cardsWithData, dashcardSettings, colors) {
  return StaticViz.RenderChart("isomorphic", {
    rawSeries: JSON.parse(cardsWithData),
    dashcardSettings: JSON.parse(dashcardSettings),
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

function categorical_donut(rows, legendColors, settings) {
  return StaticViz.RenderChart("categorical/donut", {
    data: toJSArray(rows),
    colors: toJSMap(legendColors),
    settings: JSON.parse(settings),
  });
}

function progress(data, settings, instanceColors) {
  return StaticViz.RenderChart("progress", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
    colors: JSON.parse(instanceColors),
  });
}
