import { createContext } from "react";
import type { RefObject } from "react";

export interface PopoverContextType {
  targetRef?: RefObject<HTMLDivElement>;
}

export const PopoverContext = createContext<PopoverContextType>({});
