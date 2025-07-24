import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button, Group } from "metabase/ui";

import { NewTransformFromQuestionModal } from "../../components/NewTransformFromQuestionModal";
import { newTransformFromQueryUrl } from "../../utils/urls";

export function NewTransformPage() {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Box flex="1 1 0" bg="bg-white">
      <Group>
        <Button component={Link} to={newTransformFromQueryUrl()}>
          {t`Use the notebook editor`}
        </Button>
        <Button
          onClick={() => setIsOpened(true)}
        >{t`Use an existing question or model`}</Button>
      </Group>
      <NewTransformFromQuestionModal
        isOpened={isOpened}
        onClose={() => setIsOpened(false)}
      />
    </Box>
  );
}
