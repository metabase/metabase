export const name = "databases";
export const path = "/api/database";

const FIELDS_BY_ENGINE = {
  h2: [{ name: "details.db", type: "input" }],
  postgres: [
    { name: "details.host", type: "input" },
    { name: "details.port", type: "input" },
    { name: "details.dbname", type: "input" },
    { name: "details.user", type: "input" },
    { name: "details.password", type: "password" },
  ],
};

const ENGINE_OPTIONS = Object.keys(FIELDS_BY_ENGINE).map(key => ({
  name: key,
  value: key,
}));

export const form = {
  fields: (values = {}) => [
    { name: "name", type: "input" },
    { name: "engine", type: "select", options: ENGINE_OPTIONS },
    ...(FIELDS_BY_ENGINE[values.engine] || []),
  ],
};
