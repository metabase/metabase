import { Link } from "react-router";

import { Button, Group } from "metabase/ui";

import type { EmbeddingHubModalToTrigger, EmbeddingHubStep } from "../../types";
import { DocsLink } from "../DocsLink";

export const EmbeddingHubStepActions = ({
  step,
  isLocked,
  onModalAction,
}: {
  step: EmbeddingHubStep;
  isLocked: boolean;
  onModalAction?: (modal: EmbeddingHubModalToTrigger) => void;
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
              disabled={isLocked}
            >
              {action.title}
            </Button>
          );
        }

        if (action.docsPath) {
          return (
            <DocsLink
              key={index}
              docsPath={action.docsPath}
              utm={{
                utm_campaign: "embedding-hub",
                utm_content: step.id,
              }}
            >
              {action.title}
            </DocsLink>
          );
        }

        if (action.to) {
          return (
            <Link key={index} to={action.to}>
              <Button variant={action.variant ?? "outline"} disabled={isLocked}>
                {action.title}
              </Button>
            </Link>
          );
        }

        return null;
      })}
    </Group>
  );
};
