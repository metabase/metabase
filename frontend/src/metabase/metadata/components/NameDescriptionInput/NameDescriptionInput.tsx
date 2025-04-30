import { Box } from "metabase/ui";

import S from "./NameDescriptionInput.module.css";
import { TextInputBlurChange } from "./TextInputBlurChange";

interface Props {
  description: string;
  descriptionPlaceholder: string;
  name: string;
  namePlaceholder: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
}

export const NameDescriptionInput = ({
  description,
  descriptionPlaceholder,
  name,
  namePlaceholder,
  onDescriptionChange,
  onNameChange,
}: Props) => {
  return (
    <Box>
      <TextInputBlurChange
        classNames={{
          input: S.nameInput,
          root: S.name,
        }}
        fw="bold"
        placeholder={namePlaceholder}
        required
        size="lg"
        value={name}
        onChange={onNameChange}
      />

      <TextInputBlurChange
        classNames={{
          input: S.descriptionInput,
          root: S.description,
        }}
        placeholder={descriptionPlaceholder}
        value={description}
        onChange={onDescriptionChange}
      />
    </Box>
  );
};
