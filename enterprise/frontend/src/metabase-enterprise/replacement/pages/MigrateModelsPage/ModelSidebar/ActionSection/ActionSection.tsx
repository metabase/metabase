import { useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { validateDatabase } from "metabase/transforms/utils";
import { Button, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card, Database } from "metabase-types/api";

import { SourceReplacementButton } from "../../../../components/SourceReplacementButton";
import { ConvertModelModal } from "../../ConvertModelModal";

import { isTableOnlyQuery } from "./utils";

type ModalType = "replace" | "convert";

type ActionSectionProps = {
  card: Card;
  database: Database;
};

export function ActionSection({ card, database }: ActionSectionProps) {
  const metadata = useSelector(getMetadata);
  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const isTableOnly = isTableOnlyQuery(query);
  const [modalType, setModalType] = useState<ModalType>();
  const transformValidation = validateDatabase(database);

  return (
    <>
      {isTableOnly ? (
        <SourceReplacementButton>
          {({ tooltip, isDisabled }) => {
            const buttonTooltip = transformValidation.message ?? tooltip;
            const isButtonDisabled = isDisabled || !transformValidation.isValid;

            return (
              <Tooltip label={buttonTooltip} disabled={!buttonTooltip}>
                <Button
                  variant="filled"
                  leftSection={<Icon name="table" />}
                  disabled={isButtonDisabled}
                  onClick={() => setModalType("replace")}
                >
                  {t`Replace with the base table`}
                </Button>
              </Tooltip>
            );
          }}
        </SourceReplacementButton>
      ) : (
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
                  onClick={() => setModalType("convert")}
                >
                  {t`Convert to a transform`}
                </Button>
              </Tooltip>
            );
          }}
        </SourceReplacementButton>
      )}
      <ConvertModelModal
        card={card}
        isOpened={modalType === "convert"}
        onClose={() => setModalType(undefined)}
      />
    </>
  );
}
