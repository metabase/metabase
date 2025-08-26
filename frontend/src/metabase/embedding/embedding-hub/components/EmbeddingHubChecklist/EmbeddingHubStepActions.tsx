import { Link } from "react-router";

import { Button, Group } from "metabase/ui";

import type { EmbeddingHubStep } from "../../types";
import { DocsLink } from "../DocsLink";

export const EmbeddingHubStepActions = ({
  step,
  onModalAction,
}: {
  step: EmbeddingHubStep;
  onModalAction?: (modalType: "add-data" | "new-dashboard") => void;
}) => {
  if (!step.actions?.length) {
    return null;
  }

  return (
    <Group gap="sm">
      {step.actions.map((action, index) => {
        if (action.modal) {
          return (
            <Button
              key={index}
              variant={action.variant || "outline"}
              onClick={() => onModalAction?.(action.modal!)}
            >
              {action.label}
            </Button>
          );
        }

        if (action.docsPath) {
          return (
            <DocsLink key={index} docsPath={action.docsPath}>
              {action.label}
            </DocsLink>
          );
        }

        if (action.to) {
          return (
            <Link key={index} to={action.to}>
              <Button variant={action.variant ?? "outline"}>
                {action.label}
              </Button>
            </Link>
          );
        }

        return null;
      })}
    </Group>
  );
};
