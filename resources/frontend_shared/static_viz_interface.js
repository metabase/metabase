const toJSArray = (a) => {
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
function row_chart(settings, data, colors, tokenFeatures) {
  return StaticViz.LegacyRenderChart("row", {
    settings: settings,
    data: data,
    colors: colors,
    tokenFeatures: tokenFeatures,
  });
}

/**
 * @deprecated use javascript_visualization instead
 */
function gauge(card, data, tokenFeatures) {
  return StaticViz.LegacyRenderChart("gauge", {
    card: card,
    data: data,
    tokenFeatures: tokenFeatures,
  });
}

/**
 * @deprecated use javascript_visualization instead
 */
function funnel(data, settings, tokenFeatures) {
  return StaticViz.LegacyRenderChart("funnel", {
    data: data,
    settings: settings,
    tokenFeatures: tokenFeatures,
  });
}

/**
 * @deprecated use javascript_visualization instead
 */
function progress(data, settings, instanceColors, tokenFeatures) {
  return StaticViz.LegacyRenderChart("progress", {
    data: data,
    settings: settings,
    colors: instanceColors,
    tokenFeatures: tokenFeatures,
  });
}

function javascript_visualization(rawSeries, dashcardSettings, options) {
  const content = StaticViz.RenderChart(
    rawSeries,
    dashcardSettings,
    options,
  );
  const type = content.startsWith("<svg") ? "svg" : "html";

  return JSON.stringify({
    type,
    content,
  });
}
