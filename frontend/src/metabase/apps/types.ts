export type ComponentConfiguration = {
  root: ComponentDefinition;
};

export type ComponentValue = {
  type: "constant";
  value: string;
};

export type ComponentDefinition = {
  id: string;
  componentId: string;
  value?: ComponentValue;
  children?: ComponentDefinition[];
  style?: Record<string, string | number | boolean>;
};
