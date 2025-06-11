export type Location = {
  row: number;
  column: number;
};

export type SelectionRange = {
  start: Location;
  end: Location;
};

export type Features = {
  dataReference?: boolean;
  variables?: boolean;
  snippets?: boolean;
  promptInput?: boolean;
};
