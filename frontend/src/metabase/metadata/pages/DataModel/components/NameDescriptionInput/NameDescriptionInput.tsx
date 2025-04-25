import classNames from "classnames";
import { useLayoutEffect, useState } from "react";
import { t } from "ttag";

import { TextInput } from "metabase/ui";

import S from "./NameDescriptionInput.module.css";

interface Props {
  className?: string;
  description: string;
  name: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
}

export const NameDescriptionInput = ({
  className,
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
    <div className={classNames(S.nameDescriptionInput, className)}>
      <TextInput
        placeholder={t`Table name`}
        value={nameState}
        onBlur={(event) => {
          if (name !== event.target.value) {
            onNameChange(event.target.value);
          }
        }}
        onChange={(event) => setNameState(event.target.value)}
      />

      <TextInput
        placeholder={t`Table description`}
        value={descriptionState}
        onBlur={(event) => {
          if (description !== event.target.value) {
            onDescriptionChange(event.target.value);
          }
        }}
        onChange={(event) => setDescriptionState(event.target.value)}
      />
    </div>
  );
};
