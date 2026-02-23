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
function gauge(card, data, tokenFeatures) {
  return StaticViz.LegacyRenderChart("gauge", {
    card: JSON.parse(card),
    data: JSON.parse(data),
    tokenFeatures: JSON.parse(tokenFeatures),
  });
}

/**
 * @deprecated use javascript_visualization instead
 */
function funnel(data, settings, tokenFeatures) {
  return StaticViz.LegacyRenderChart("funnel", {
    data: JSON.parse(data),
    settings: JSON.parse(settings),
    tokenFeatures: JSON.parse(tokenFeatures),
  });
}


function javascript_visualization(rawSeries, dashcardSettings, options) {
  const parsedOptions = JSON.parse(options);
  const content = StaticViz.RenderChart(
    JSON.parse(rawSeries),
    JSON.parse(dashcardSettings),
    parsedOptions,
  );
  const type = content.startsWith("<svg") ? "svg" : "html";

  return JSON.stringify({
    type,
    content,
  });
}
