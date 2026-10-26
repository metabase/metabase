import { Code, type CodeProps } from "metabase/ui";

import type { ActionFieldSource } from "../hooks";

type ActionFieldSourceCodeProps = {
  source: ActionFieldSource;
} & Omit<CodeProps, "children">;

export function ActionFieldSourceCode({
  source,
  ...codeProps
}: ActionFieldSourceCodeProps) {
  return (
    <Code {...codeProps}>
      {source.type === "variable" ? `{{ ${source.name} }}` : source.name}
    </Code>
  );
}
