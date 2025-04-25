import classNames from "classnames";
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
}: Props) => (
  <div className={classNames(S.nameDescriptionInput, className)}>
    <TextInput
      placeholder={t`Table name`}
      value={name}
      onChange={(event) => onNameChange(event.target.value)}
    />
    <TextInput
      placeholder={t`Table description`}
      value={description}
      onChange={(event) => onDescriptionChange(event.target.value)}
    />
  </div>
);
