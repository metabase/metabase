import { match } from "ts-pattern";

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
      {match(source)
        .with({ type: "column" }, ({ name }) => name)
        .with(
          { type: "variable" },
          { type: "request-variable" },
          ({ name }) => `{{ ${name} }}`,
        )
        .exhaustive()}
    </Code>
  );
}
