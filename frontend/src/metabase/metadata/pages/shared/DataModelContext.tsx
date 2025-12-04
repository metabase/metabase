import { createContext } from "react";

export type DataModelContextType = {
  baseUrl: string;
};

// should be removed once we don't need to render the page in two different places
export const DataModelContext = createContext<DataModelContextType>({
  baseUrl: "/admin/datamodel",
});
