export type ComponentDataSource = {
  id: string;
  type: "table";
  tableId: number;
  databaseId: number;
  name?: string;
};

export type ComponentFormScope = {
  id: string;
  name: string;
};

export type ComponentConfiguration = {
  root: ComponentDefinition;
  id: string;
  type: "page" | "component";
  title?: string;
  urlSlug?: string;
  pagePadding?: string;
  context: string;
  contextTableId?: string;
  dataSources?: ComponentDataSource[];
  formScopes?: ComponentFormScope[];
};

export type ComponentValue =
  | {
      type: "constant";
      value?: string;
    }
  | {
      type: "context";
      field?: string;
    };

export type ComponentDefinition = {
  id: string;
  componentId: string;
  value?: ComponentValue;
  dataSourceId?: string;
  children?: ComponentDefinition[];
  style?: Record<string, string | number | boolean>;
};
