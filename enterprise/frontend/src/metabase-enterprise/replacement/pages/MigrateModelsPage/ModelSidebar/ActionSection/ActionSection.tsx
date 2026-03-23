import { useState } from "react";
import { t } from "ttag";

import { validateDatabase } from "metabase/transforms/utils";
import { Button, Icon, Tooltip } from "metabase/ui";
import type { Card, Database } from "metabase-types/api";

import { SourceReplacementButton } from "../../../../components/SourceReplacementButton";
import { ReplaceModelWithTransformModal } from "../../ReplaceModelWithTransformModal";

type ModalType = "replace";

type ActionSectionProps = {
  card: Card;
  database: Database;
};

export function ActionSection({ card, database }: ActionSectionProps) {
  const [modalType, setModalType] = useState<ModalType>();
  const validation = validateDatabase(database);

  return (
    <>
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
                onClick={() => setModalType("replace")}
              >
                {t`Convert to a transform`}
              </Button>
            </Tooltip>
          );
        }}
      </SourceReplacementButton>
      <ReplaceModelWithTransformModal
        card={card}
        isOpened={modalType === "replace"}
        onClose={() => setModalType(undefined)}
      />
    </>
  );
}
