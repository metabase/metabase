/* @flow weak */

export const name = "databases";
export const path = "/api/database";

const FIELDS_BY_ENGINE = {
  h2: [{ name: "details.db" }],
  postgres: [
    { name: "details.host" },
    { name: "details.port" },
    { name: "details.dbname" },
    { name: "details.user" },
    { name: "details.password", type: "password" },
  ],
};

const ENGINE_OPTIONS = Object.keys(FIELDS_BY_ENGINE).map(key => ({
  name: key,
  value: key,
}));

export const form = {
  fields: (values = {}) => [
    { name: "name" },
    { name: "engine", type: "select", options: ENGINE_OPTIONS },
    ...(FIELDS_BY_ENGINE[values.engine] || []),
  ],
};
