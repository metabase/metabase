import { createContext } from "react";
import type { RefObject } from "react";

export interface PopoverContextType {
  targetRef?: RefObject<HTMLElement>;
}

export const PopoverContext = createContext<PopoverContextType>({});
