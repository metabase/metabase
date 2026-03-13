import { useState } from "react";
import { t } from "ttag";

import { ArchiveCardModal } from "metabase/questions/components/ArchiveCardModal";
import { Button, Group, Icon, Tooltip } from "metabase/ui";
import type { Card } from "metabase-types/api";

import { SourceReplacementButton } from "../../../../components/SourceReplacementButton";
import { ConvertToTransformModal } from "../../ConvertToTransformModal";

type ModalType = "convert-to-transform" | "archive";

type ActionSectionProps = {
  card: Card;
};

export function ActionSection({ card }: ActionSectionProps) {
  const [modalType, setModalType] = useState<ModalType>();

  return (
    <>
      <Group gap="sm" wrap="nowrap">
        <SourceReplacementButton>
          {({ tooltip, isDisabled }) => (
            <Tooltip label={tooltip} disabled={!tooltip}>
              <Button
                variant="filled"
                leftSection={<Icon name="transform" />}
                disabled={isDisabled}
                fullWidth
                onClick={() => setModalType("convert-to-transform")}
              >
                {t`Convert to a transform`}
              </Button>
            </Tooltip>
          )}
        </SourceReplacementButton>
        <Button
          leftSection={<Icon name="trash" />}
          onClick={() => setModalType("archive")}
        />
      </Group>
      {modalType === "convert-to-transform" && (
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
