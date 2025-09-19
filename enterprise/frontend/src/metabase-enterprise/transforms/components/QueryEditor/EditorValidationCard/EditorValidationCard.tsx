import { t } from "ttag";

import { UserHasSeen } from "metabase/common/components/UserHasSeen/UserHasSeen";
import { Button, Card, Stack, Text } from "metabase/ui";

import type { QueryValidationResult } from "../types";

import { TRANSFORM_ERROR_SEEN_KEY } from "./constants";

type EditorValidationCardProps = {
  validationResult: QueryValidationResult;
};

export function EditorValidationCard({
  validationResult: { errorMessage },
}: EditorValidationCardProps) {
  if (errorMessage == null) {
    return null;
  }

  return (
    <UserHasSeen id={TRANSFORM_ERROR_SEEN_KEY}>
      {({ hasSeen, ack }) =>
        !hasSeen && <ErrorCard errorMessage={errorMessage} onClose={ack} />
      }
    </UserHasSeen>
  );
}

type ErrorCardProps = {
  errorMessage: string;
  onClose: () => void;
};

function ErrorCard({ errorMessage, onClose }: ErrorCardProps) {
  return (
    <Card pos="fixed" left="2rem" bottom="2rem" maw="21rem" withBorder>
      <Stack align="end">
        <Text>{errorMessage}</Text>
        <Button variant="filled" onClick={onClose}>{t`Okay`}</Button>
      </Stack>
    </Card>
  );
}
