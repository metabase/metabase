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


// Pending custom viz plugin registrations, deferred until enterprise overrides are applied.
var __pendingCustomVizRegistrations__ = [];

function register_custom_viz_plugin(identifier, assetsJson) {
  if (typeof __customVizPlugin__ === "function") {
    var assets = assetsJson ? JSON.parse(assetsJson) : {};
    // Capture the factory now (before __customVizPlugin__ is overwritten by the next bundle load),
    // but defer the actual registration until javascript_visualization runs initializeContext,
    // which applies enterprise overrides and activates the real EE registerCustomVizPlugin.
    __pendingCustomVizRegistrations__.push({
      factory: __customVizPlugin__,
      identifier,
      assets,
    });
  }
}

function javascript_visualization(rawSeries, dashcardSettings, options) {
  var parsedOptions = JSON.parse(options);

  // Apply enterprise overrides (EE registerCustomVizPlugin + customVizRegistry become active).
  // This must happen before plugin registration so the real EE registry is populated.
  StaticViz.initializeContext(parsedOptions);

  // Register all deferred custom viz plugins now that the EE registry is active.
  for (var i = 0; i < __pendingCustomVizRegistrations__.length; i++) {
    var r = __pendingCustomVizRegistrations__[i];
    StaticViz.registerCustomVizPlugin(r.factory, r.identifier, r.assets);
  }
  __pendingCustomVizRegistrations__ = [];

  var parsedSeries = JSON.parse(rawSeries);
  var content = StaticViz.RenderChart(parsedSeries, JSON.parse(dashcardSettings), parsedOptions);
  var type = content.startsWith("<svg") ? "svg" : "html";

  return JSON.stringify({ type, content });
}
