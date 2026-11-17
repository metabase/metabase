import type { Engine } from "metabase-types/api";

export const mysqlFormConfig = {
  source: {
    type: "official",
    contact: null,
  },
  "details-fields": [
    {
      type: "group",
      "container-style": ["grid", "3fr 1fr"],
      fields: [
        {
          name: "host",
          "display-name": "Host",
          placeholder: "name.database.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          placeholder: 3306,
        },
      ],
    },
    {
      name: "dbname",
      "display-name": "Database name",
      placeholder: "birds_of_the_world",
      required: true,
    },
    {
      name: "user",
      "display-name": "Username",
      placeholder: "username",
      required: true,
    },
    {
      name: "password",
      "display-name": "Password",
      type: "password",
      placeholder: "••••••••",
    },
    {
      name: "ssl",
      "display-name": "Use a secure connection (SSL)",
      type: "boolean",
      default: false,
    },
  ],
  "driver-name": "MySQL",
  "superseded-by": null,
  "extra-info": null,
} satisfies Engine;
