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
                "title": "Column Name",
                "description": "The name of the column (not the display name)",
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
      "additionalProperties": false,
      "properties": {
        "filters": {
          // We could tight this here but the json schema is imposed by the tool
          "type": "string"
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
