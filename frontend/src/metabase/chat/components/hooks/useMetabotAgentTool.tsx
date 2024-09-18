import { match } from "ts-pattern";

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    // To JSON parse
    arguments: string;
  };
}

/**
 * Dispatches the action according to LLM's specified tools
 */
export function useMetabotAgentTool() {
  const runAgentAction = (toolCall: ToolCall) => {
    const args = JSON.parse(toolCall.function.arguments);

    match(toolCall.function.name)
      .with("hideShowColumns", () => {
        console.log("hideShowColumns", args);
      })
      .with("moveColumns", () => {
        console.log("moveColumns", args);
      })
      .with("applyFilters", () => {
        console.log("applyFilters", args);
      })
      .otherwise(() => {
        console.log(`Unknown action: ${toolCall.function.name}`);
      });
  };

  return { runAgentAction };
}
