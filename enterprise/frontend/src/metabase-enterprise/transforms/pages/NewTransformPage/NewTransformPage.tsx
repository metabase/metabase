import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { Box, Button, Group } from "metabase/ui";

import { newTransformQueryUrl } from "../../utils/urls";

export function NewTransformPage() {
  const [isPickerOpened, setIsPickerOpened] = useState(false);

  const handlePickerOpen = () => {
    setIsPickerOpened(true);
  };

  const handleChangeQuestion = (_item: QuestionPickerValueItem) => {
    return null;
  };

  const handlePickerClose = () => {};

  return (
    <Box flex="1 1 0" bg="bg-white">
      <Group>
        <Button component={Link} to={newTransformQueryUrl()}>
          {t`Use the notebook editor`}
        </Button>
        <Button
          onClick={handlePickerOpen}
        >{t`Use an existing question or model`}</Button>
      </Group>
      {isPickerOpened && (
        <QuestionPickerModal
          title={t`Pick a question or model to copy the query from`}
          models={["card", "dataset"]}
          onChange={handleChangeQuestion}
          onClose={handlePickerClose}
        />
      )}
    </Box>
  );
}
