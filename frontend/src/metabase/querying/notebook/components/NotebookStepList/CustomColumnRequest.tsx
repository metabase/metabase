import { createContext, useContext } from "react";

type CustomColumnRequestValue = {
  /** The id of the custom column step that must add a new column. */
  requestedStepId: string | null;
  requestCustomColumn: (stageIndex: number) => void;
  clearRequest: () => void;
};

/**
 * Lets a step ask the custom column step of its stage to add a new column and
 * open its editor, like the "Create custom column" button of the group-by
 * list.
 */
export const CustomColumnRequestContext =
  createContext<CustomColumnRequestValue>({
    requestedStepId: null,
    requestCustomColumn: () => {},
    clearRequest: () => {},
  });

export const useCustomColumnRequest = () =>
  useContext(CustomColumnRequestContext);

export const getExpressionStepId = (stageIndex: number) =>
  `${stageIndex}:expression`;
