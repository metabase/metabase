import { useState } from "react";
import { t } from "ttag";

import { validateDatabase } from "metabase/transforms/utils";
import { Button, Icon, Tooltip } from "metabase/ui";
import type { Card, Database } from "metabase-types/api";

import { SourceReplacementButton } from "../../../../components/SourceReplacementButton";
import { ReplaceWithTransformModal } from "../../ReplaceWithTransformModal";

type ActionSectionProps = {
  card: Card;
  database: Database;
};

export function ActionSection({ card, database }: ActionSectionProps) {
  const [opened, setOpened] = useState(false);
  const transformValidation = validateDatabase(database);

  return (
    <>
      <SourceReplacementButton>
        {({ tooltip, isDisabled }) => {
          const buttonTooltip = transformValidation.message ?? tooltip;
          const isButtonDisabled = isDisabled || !transformValidation.isValid;

          return (
            <Tooltip label={buttonTooltip} disabled={!buttonTooltip}>
              <Button
                variant="filled"
                leftSection={<Icon name="transform" />}
                disabled={isButtonDisabled}
                onClick={() => setOpened(true)}
              >
                {t`Convert to a transform`}
              </Button>
            </Tooltip>
          );
        }}
      </SourceReplacementButton>
      <ReplaceWithTransformModal
        card={card}
        opened={opened}
        onClose={() => setOpened(false)}
      />
    </>
  );
}
