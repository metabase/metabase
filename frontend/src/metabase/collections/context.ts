import { createContext, useContext, type ContextType } from "react";
import type { DragDropContextProvider } from "react-dnd";

export const DragDropContextProviderContext =
  createContext<ContextType<typeof DragDropContextProvider>>(null);

export const useDragDropContext = () =>
  useContext(DragDropContextProviderContext);
