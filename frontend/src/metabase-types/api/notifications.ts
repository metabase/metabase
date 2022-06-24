export type Channel = {
  details: Record<string, string>;
};

type ChannelField = {
  name: string;
  displayName: string;
  options?: string[];
};

export type ChannelSpec = {
  fields: ChannelField[];
};
