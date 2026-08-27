import { t } from "ttag";

import DisconnectImage from "assets/img/disconnect.svg";
import { getErrorMessage } from "metabase/api/utils/errors";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Box } from "metabase/ui";

type ListErrorStateProps = {
  error: unknown;
};

export function ListErrorState({ error }: ListErrorStateProps) {
  return (
    <Box p="xl">
      <EmptyState
        message={getErrorMessage(error, t`An error occurred`)}
        spacing="sm"
        illustrationElement={
          <img src={DisconnectImage} alt={t`Error`} width={100} height={100} />
        }
      />
    </Box>
  );
}
