export interface HelpText {
  name: string;
  args: HelpTextArg[];
  description: string | Record<string, string>;
  example: string;
  structure: string;
  docsPage?: string;
}

export interface TreatedHelpText {
  name: string;
  args: HelpTextArg[];
  description: string;
  example: string;
  structure: string;
  docsPage?: string;
}

export interface HelpTextArg {
  name: string;
  description: string;
}
