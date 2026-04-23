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


function initialize_context(options) {
  StaticViz.initializeContext(JSON.parse(options));
}

function register_custom_viz_plugin(identifier, assetsJson) {
  if (typeof __customVizPlugin__ === "function") {
    var assets = assetsJson ? JSON.parse(assetsJson) : {};
    StaticViz.registerCustomVizPlugin(__customVizPlugin__, identifier, assets);
  }
}

function javascript_visualization(rawSeries, dashcardSettings, options) {
  var parsedSeries = JSON.parse(rawSeries);
  var content = StaticViz.RenderChart(parsedSeries, JSON.parse(dashcardSettings), JSON.parse(options));
  var type = content.startsWith("<svg") ? "svg" : "html";

  return JSON.stringify({ type, content });
}
