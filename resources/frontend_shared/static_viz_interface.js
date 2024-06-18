const toJSArray = a => {
  const jsArray = [];
  for (let i = 0; i < a.length; i++) {
    jsArray[i] = a[i];
  }
  return jsArray;
};

function toJSMap(m) {
  const o = {};
  for (let i = 0; i < m.length; i++) {
    o[m[i][0]] = m[i][1];
  }
  return o;
}

/**
 * @deprecated use javascript_visualization instead
 */
function row_chart(settings, data, colors) {
  return StaticViz.LegacyRenderChart("row", {
    settings: JSON.parse(settings),
    data: JSON.parse(data),
    colors: JSON.parse(colors),
  });
}

/**
 * @deprecated use javascript_visualization instead
 */
function gauge(card, data) {
  return StaticViz.LegacyRenderChart("gauge", {
    card: JSON.parse(card),
    data: JSON.parse(data),
  });
}

function funnel(data, settings) {
  return StaticViz.LegacyRenderChart("funnel", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
  });
}

/**
 * @deprecated use javascript_visualization instead
 */
function categorical_donut(rows, legendColors, settings) {
  return StaticViz.LegacyRenderChart("categorical/donut", {
    data: toJSArray(rows),
    colors: toJSMap(legendColors),
    settings: JSON.parse(settings),
  });
}

/**
 * @deprecated use javascript_visualization instead
 */
function progress(data, settings, instanceColors) {
  return StaticViz.LegacyRenderChart("progress", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
    colors: JSON.parse(instanceColors),
  });
}

function javascript_visualization(rawSeries, dashcardSettings, colors) {
  const content = StaticViz.RenderChart(
    JSON.parse(rawSeries),
    JSON.parse(dashcardSettings),
    JSON.parse(colors),
  );
  const type = content.startsWith("<svg") ? "svg" : "html";

  return JSON.stringify({
    type,
    content,
  });
}
