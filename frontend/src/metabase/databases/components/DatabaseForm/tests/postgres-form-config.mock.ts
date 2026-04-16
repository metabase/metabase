import type { Engine } from "metabase-types/api";

import { providerConfig } from "../../DatabaseHostnameWithProviderField/test/provider-config.mock";

export const postgresFormConfig = {
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
          "helper-text":
            "Your database's IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          placeholder: 5432,
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
  ],
  "driver-name": "PostgreSQL",
  "superseded-by": null,
  "extra-info": {
    "db-routing-info": {
      text: "test",
    },
    providers: providerConfig,
  },
} satisfies Engine;
