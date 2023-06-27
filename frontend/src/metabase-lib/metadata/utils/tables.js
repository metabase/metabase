export async function injectTableMetadata(table) {
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
