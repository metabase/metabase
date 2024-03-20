function getVisualizationSettings(settings) {
  const viz = {
    "graph.dimensions": settings["graph.dimensions"],
    "graph.metrics": settings["graph.metrics"],
  };

  if (settings["graph.show_goal"]) {
    viz["graph.goal_value"] = settings["graph.goal_value"];
  }

  if (
    settings["graph.x_axis.axis_enabled"] &&
    settings["graph.x_axis.title_text"]
  ) {
    viz["graph.x_axis.title_text"] = settings["graph.x_axis.title_text"];
  }

  if (
    settings["graph.y_axis.axis_enabled"] &&
    settings["graph.y_axis.title_text"]
  ) {
    viz["graph.y_axis.title_text"] = settings["graph.y_axis.title_text"];
  }

  if (settings["stackable.stack_type"]) {
    viz["stackable.stack_type"] = settings["stackable.stack_type"];
    viz["stackable.stack_display"] = settings["stackable.stack_display"];
  }

  if (settings["scatter.bubble"]) {
    viz["scatter.bubble.size"] = settings["scatter.bubble"];
  }

  return viz;
}

export function getChartExtras(dashcard, rawSeries, settings) {
  const { id, card, dashboard_id, series } = dashcard;
  const { display, updated_at } = card;
  const names = [card.name];
  if (series.length > 0) {
    series.forEach(x => names.push(x.name));
  }
  const title = settings["card.title"] ?? names.join(", ");
  // native_form is missing when the dashboard is NOT shown in Alastor
  const sql_queries = rawSeries
    .map(x => x.data?.native_form?.query)
    .filter(x => x);

  const visualization_settings = getVisualizationSettings(settings);

  return {
    dashboard_id,
    id, // ordered card id
    updated_at, // from the primary card
    display, // from the primary card
    title,
    sql_queries,
    visualization_settings,
  };
}
