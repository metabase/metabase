import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { TextInput } from "metabase/ui";

import S from "./NameDescriptionInput.module.css";

interface Props {
  description: string;
  name: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
}

export const NameDescriptionInput = ({
  description,
  name,
  onDescriptionChange,
  onNameChange,
}: Props) => {
  const [nameState, setNameState] = useState(name);
  const [descriptionState, setDescriptionState] = useState(description);

  useLayoutEffect(() => {
    setNameState(name);
  }, [name]);

  return (
    <div>
      <TextInput
        classNames={{
          input: S.nameInput,
          root: S.name,
        }}
        fw="bold"
        placeholder={t`Give this table a name`}
        size="lg"
        value={nameState}
        onBlur={(event) => {
          const newValue = event.target.value;

          // prevent empty names
          if (!newValue.trim()) {
            setNameState(name);
          }

          if (name !== newValue) {
            onNameChange(newValue);
          }
        }}
        onChange={(event) => setNameState(event.target.value)}
      />

      <TextInput
        classNames={{
          input: S.descriptionInput,
          root: S.description,
        }}
        placeholder={t`Give this table a description`}
        value={descriptionState}
        onBlur={(event) => {
          const newValue = event.target.value;

          if (description !== newValue) {
            onDescriptionChange(newValue);
          }
        }}
        onChange={(event) => setDescriptionState(event.target.value)}
      />
    </div>
  );
};
