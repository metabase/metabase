import getGAMetadata from "promise-loader?global!metabase-lib/v1/metadata/utils/ga-metadata";

export async function injectTableMetadata(table) {
  // HACK: inject GA metadata that we don't have intergrated on the backend yet
  if (table && table.db && table.db.engine === "googleanalytics") {
    const GA = await getGAMetadata();
    table.fields = table.fields.map(field => ({
      ...field,
      ...GA.fields[field.name],
    }));
    table.metrics.push(
      ...GA.metrics.map(metric => ({
        ...metric,
        table_id: table.id,
        googleAnalyics: true,
      })),
    );
    table.segments.push(
      ...GA.segments.map(segment => ({
        ...segment,
        table_id: table.id,
        googleAnalyics: true,
      })),
    );
  }

  if (table && table.fields) {
    // replace dimension_options IDs with objects
    for (const field of table.fields) {
      if (field.dimension_options) {
        field.dimension_options = field.dimension_options.map(
          id => table.dimension_options[id],
        );
      }
      if (field.default_dimension_option) {
        field.default_dimension_option =
          table.dimension_options[field.default_dimension_option];
      }
    }
  }

  return table;
}
