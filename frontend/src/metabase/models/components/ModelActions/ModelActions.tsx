import { t } from "ttag";

import { Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ModelActionDetails from "./ModelActionDetails";

interface Props {
  model: Question;
  shouldShowActionsUI: boolean;
}

function ModelActions({ model, shouldShowActionsUI }: Props) {
  return (
    <Stack p="3rem 4rem" mih="90vh">
      {shouldShowActionsUI ? (
        <ModelActionDetails model={model} />
      ) : (
        <>{t`Actions are not enabled for this model.`}</>
      )}
    </Stack>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActions;
