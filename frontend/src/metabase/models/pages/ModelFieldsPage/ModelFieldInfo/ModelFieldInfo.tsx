import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { NameDescriptionInput } from "metabase/metadata/components";
import { Box, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../../constants";

import S from "./ModelFieldInfo.module.css";

type ModelFieldInfoProps = {
  field: Field;
  onNameChange: (field: Field, newName: string) => void;
  onDescriptionChange: (field: Field, newDescription: string | null) => void;
};

export function ModelFieldInfo({
  field,
  onNameChange,
  onDescriptionChange,
}: ModelFieldInfoProps) {
  return (
    <Flex className={S.section} flex={1} direction="column" h="100%">
      <Box className={S.header} p="md">
        <NameDescriptionInput
          name={field.display_name}
          nameIcon={getColumnIcon(Lib.legacyColumnTypeInfo(field))}
          nameMaxLength={NAME_MAX_LENGTH}
          namePlaceholder={t`Give this field a name`}
          description={field.description ?? ""}
          descriptionPlaceholder={t`Give this field a description`}
          onNameChange={(newName) => onNameChange(field, newName)}
          onDescriptionChange={(newDescription) =>
            onDescriptionChange(field, newDescription)
          }
        />
      </Box>
    </Flex>
  );
}
