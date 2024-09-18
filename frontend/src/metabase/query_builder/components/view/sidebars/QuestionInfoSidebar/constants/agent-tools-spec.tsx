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
      "additionalProperties": false,
      "properties": {
        "name": {
          "title": "Name",
          "type": "string"
        },
        "shown": {
          "title": "Shown",
          "type": "boolean"
        }
      },
      "required": [
        "name",
        "shown"
      ],
      "title": "Parameters",
      "type": "object"
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
          "title": "Oldindex",
          "type": "integer"
        },
        "newIndex": {
          "title": "Newindex",
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
