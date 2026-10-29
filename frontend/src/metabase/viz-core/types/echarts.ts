export type EChartsEventHandler = {
  eventName: string;
  query?: string;
  handler: (event: any) => void;
};

export type ZREventHandler = {
  eventName: string;
  handler: (event: any) => void;
};
