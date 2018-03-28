export const name = "databases";
export const path = "/api/database";

export const form = {
  fields: [
    { name: "name", type: "input" },
    { name: "engine", type: "input" },
    { name: "details.host", type: "input" },
    { name: "details.port", type: "input" },
    { name: "details.dbname", type: "input" },
    { name: "details.user", type: "input" },
    { name: "details.password", type: "input" },
  ],
};
