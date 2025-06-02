import { Box } from "metabase/ui";

import { Input, Textarea } from "./Input";
import S from "./NameDescriptionInput.module.css";

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
      <Input
        classNames={{
          input: S.nameInput,
          root: S.name,
        }}
        fw="bold"
        normalize={(newValue) => {
          if (typeof newValue !== "string") {
            return name;
          }

          const isNewValueEmpty = newValue.trim().length === 0;
          return isNewValueEmpty ? name : newValue.trim();
        }}
        placeholder={namePlaceholder}
        required
        size="lg"
        value={name}
        onChange={onNameChange}
      />

      <Textarea
        classNames={{
          input: S.descriptionInput,
          root: S.description,
        }}
        placeholder={descriptionPlaceholder}
        value={description}
        onChange={onDescriptionChange}
        autosize
        minRows={2}
        maxRows={4}
      />
    </Box>
  );
};
