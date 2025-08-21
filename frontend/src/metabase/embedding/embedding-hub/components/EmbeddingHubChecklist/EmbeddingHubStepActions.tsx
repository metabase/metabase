import { Link } from "react-router";

import { Button, Group } from "metabase/ui";

import type { EmbeddingHubStep } from "../../types";
import { DocsLink } from "../DocsLink";

export const EmbeddingHubStepActions = ({
  step,
}: {
  step: EmbeddingHubStep;
}) => {
  if (!step.actions?.length) {
    return null;
  }

  return (
    <Group gap="sm">
      {step.actions.map((action, index) => {
        const button = (
          <Button variant={action.variant ?? "outline"}>{action.label}</Button>
        );

        if (action.docsPath) {
          return (
            <DocsLink key={index} docsPath={action.docsPath}>
              {button}
            </DocsLink>
          );
        }

        if (action.to) {
          return (
            <Link key={index} to={action.to}>
              {button}
            </Link>
          );
        }

        return null;
      })}
    </Group>
  );
};
