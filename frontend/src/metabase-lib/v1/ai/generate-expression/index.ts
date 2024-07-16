import { searchCustomExpressions } from './custom-expressions'

const CHAT_API_URL = 'http://localhost:8000/v1/chat/'

export const SYSTEM_MESSAGE = `
# Task

You are a Metabase AI assistant that knows the syntax of the Metabase GUI editor expressions.
Only use the expressions provided by the users. Make sure to use the correct syntax as provided in the examples.
Given a user description of what they want to do using a custom expression or aggregation in Metabase, you need to suggest the correct expression to use. The description can be in natural language or any other syntax (e.g. SQL, GUI editor syntax).
The user will also provide you with GUI editor expressions / functions that you are allowed to use and columns that are available in the data.
Column references are always in square brackets, e.g. [Quantity].
"Count" can never be used with arguments, e.g. "Count([Quantity])" is not allowed.

You know that for adding a custom column, you cannot use expressions of type "Aggregate" but only of type "Function".
For summarizing data, you can use both types of expressions but they need to include at least one "Aggregate".

# Response format

You always respond with a valid JSON wrapped in <json> tags in the following format:

<json>
{
  "title": "A meaningful title for the column",
  "expression": "The expression to use in the Metabase GUI editor"
}
</json>

DO NOT add any clarifying information - only respond with the JSON array.

# Examples

How many users have signed up
<json>
{
  "title": "Users signed up",
  "expression": "Distinct([User ID])"
}
</json>

How many orders
<json>
{
  "title": "Orders",
  "expression": "Count"
}
</json>

SUM(AMOUNT) / COUNT(ORDERS)
<json>
{
  "title": "Average order value",
  "expression": "Sum([Amount]) / Count"
}
</json>
`


export function getUserMessage(expressionDescription: string, operation: string, availableData: string, availableExpressions: string) {
  return `
The user wants to ${operation} and has provided the following description:
\`\`\`${expressionDescription}\`\`\`

## Available data:

${availableData}

## Available expressions

${availableExpressions}
`
}

export async function generateSummarizeExpression(description: string, availableData: string) {
  const MODEL = 'meta.llama3-70b-instruct-v1:0'

  const data = {
    "model": MODEL,
    "messages": [
      {
        "role": "system",
        "content": SYSTEM_MESSAGE
      },
      {
        "role": "user",
        "content": getUserMessage(
          description,
          'summarize',
          availableData,
          JSON.stringify(searchCustomExpressions(description))
        )
      }
    ]
  }

  // use fetch to call the API and store the response in the `response` variable
  const response = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  const responseJson = await response.json()
  console.log('Response:', responseJson.response)
  console.log('Tokens:', responseJson.metadata.usage.total)

  // Extract JSON between <json> tags and parse it to a JSON object
  const jsonStr = responseJson.response
  const jsonStart = jsonStr.indexOf('<json>') + '<json>'.length
  const jsonEnd = jsonStr.indexOf('</json>')
  const json = JSON.parse(jsonStr.slice(jsonStart, jsonEnd))
  console.log('AI response:', json)
  return json
}
