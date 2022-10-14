export interface HelpText {
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
