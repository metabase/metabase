import type { Engine } from "metabase-types/api";

export const bigqueryFormConfig = {
  source: {
    type: "official",
    contact: null,
  },
  "details-fields": [
    {
      name: "service-account-json",
      "display-name": "Service account JSON file",
      "helper-text":
        "This JSON file contains the credentials Metabase needs to read and query your dataset.",
      required: true,
      type: "textFile",
    },
  ],
  "driver-name": "BigQuery",
  "superseded-by": null,
  "extra-info": null,
} satisfies Engine;
