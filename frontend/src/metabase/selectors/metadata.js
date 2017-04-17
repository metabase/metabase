
export const getTables = (state) => state.metadata.tables;
export const getFields = (state) => state.metadata.fields;
export const getMetrics = (state) => state.metadata.metrics;
export const getDatabases = (state) => Object.values(state.metadata.databases);
