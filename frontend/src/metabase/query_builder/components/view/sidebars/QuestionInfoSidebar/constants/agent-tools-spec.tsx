export interface Tool {
  name: string;
  description: string;
  parameters: object;
  strict: boolean;
}

export const METABOT_AGENT_TOOLS_SPEC = [
  {
    "name": "hideShowColumns",
    "description": "Show or hide columns in a table",
    "parameters": {
      "type": "object",
      "properties": {
        "columns": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "title": "Name",
                "type": "string"
              },
              "enabled": {
                "title": "Enabled",
                "type": "boolean"
              }
            },
            "required": [
              "name",
              "enabled"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": ["columns"],
      "additionalProperties": false
    },
    "strict": true
  },
  {
    "name": "moveColumns",
    "description": "Move columns in a table",
    "parameters": {
      "additionalProperties": false,
      "properties": {
        "oldIndex": {
          "title": "Old Index",
          "type": "integer"
        },
        "newIndex": {
          "title": "New Index",
          "type": "integer"
        }
      },
      "required": [
        "oldIndex",
        "newIndex"
      ],
      "title": "Parameters",
      "type": "object"
    },
    "strict": true
  },
  {
    "name": "applyFilters",
    "description": "Apply filters to a table",
    "parameters": {
      "$defs": {
        "Filter": {
          "additionalProperties": false,
          "properties": {
            "comparator": {
              "$ref": "#/$defs/FilterOperator"
            },
            "fieldName": {
              "title": "Fieldname",
              "type": "string"
            },
            "value": {
              "title": "Value",
              "type": "string"
            }
          },
          "required": [
            "comparator",
            "fieldName",
            "value"
          ],
          "title": "Filter",
          "type": "object"
        },
        "FilterOperator": {
          "enum": [
            "=",
            "<",
            ">"
          ],
          "title": "FilterOperator",
          "type": "string"
        }
      },
      "additionalProperties": false,
      "properties": {
        "filters": {
          "$ref": "#/$defs/Filter"
        }
      },
      "required": [
        "filters"
      ],
      "title": "Parameters",
      "type": "object"
    },
    "strict": true
  }
] as const satisfies Tool[];
