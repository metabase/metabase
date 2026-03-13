import { useState } from "react";
import { t } from "ttag";

import { ArchiveCardModal } from "metabase/questions/components/ArchiveCardModal";
import { validateDatabase } from "metabase/transforms/utils";
import { Button, Group, Icon, Tooltip } from "metabase/ui";
import type { Card, Database } from "metabase-types/api";

import { SourceReplacementButton } from "../../../../components/SourceReplacementButton";
import { ConvertToTransformModal } from "../../ConvertToTransformModal";

type ModalType = "convert" | "archive";

type ActionSectionProps = {
  card: Card;
  database: Database;
};

export function ActionSection({ card, database }: ActionSectionProps) {
  const [modalType, setModalType] = useState<ModalType>();
  const validation = validateDatabase(database);

  return (
    <>
      <Group gap="sm" wrap="nowrap">
        <SourceReplacementButton>
          {({ tooltip, isDisabled }) => {
            const buttonTooltip = validation.message ?? tooltip;
            const isButtonDisabled = isDisabled || !validation.isValid;

            return (
              <Tooltip label={buttonTooltip} disabled={!buttonTooltip}>
                <Button
                  variant="filled"
                  leftSection={<Icon name="transform" />}
                  disabled={isButtonDisabled}
                  fullWidth
                  onClick={() => setModalType("convert")}
                >
                  {t`Convert to a transform`}
                </Button>
              </Tooltip>
            );
          }}
        </SourceReplacementButton>
        <Button
          leftSection={<Icon name="trash" />}
          onClick={() => setModalType("archive")}
        />
      </Group>
      {modalType === "convert" && (
        <ConvertToTransformModal
          card={card}
          opened
          onClose={() => setModalType(undefined)}
        />
      )}
      {modalType === "archive" && (
        <ArchiveCardModal card={card} onClose={() => setModalType(undefined)} />
      )}
    </>
  );
}
