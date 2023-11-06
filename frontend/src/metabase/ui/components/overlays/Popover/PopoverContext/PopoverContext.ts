import { createContext } from "react";
import type { RefObject } from "react";
import type { PopoverProps } from "@mantine/core";

export interface PopoverContextType {
  offset?: PopoverProps["offset"];
  targetRef?: RefObject<HTMLElement>;
}

export const PopoverContext = createContext<PopoverContextType>({});
