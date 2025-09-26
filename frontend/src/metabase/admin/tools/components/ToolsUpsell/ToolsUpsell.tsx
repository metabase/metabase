import { ErroringQuestions } from "../ErroringQuestions";

/**
 * Upsell component for erroring questions in OSS.
 * This uses the ErroringQuestions component which handles both the upsell case
 * and potential data scenarios with proper click handling.
 */
export const ToolsUpsell = () => {
  // Use the ErroringQuestions component which will show the upsell by default
  // but can handle data if it's ever provided in edge cases
  return <ErroringQuestions />;
};
