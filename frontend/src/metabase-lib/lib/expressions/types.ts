export interface HelpText {
  name: string;
  args: HelpTextArg[];
  description: string;
  example: string;
  structure: string;
  hasDocsPage?: boolean;
}

export interface HelpTextArg {
  name: string;
  description: string;
}
