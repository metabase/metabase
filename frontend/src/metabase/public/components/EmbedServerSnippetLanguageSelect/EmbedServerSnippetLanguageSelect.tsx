import type { ChangeEvent } from "react";

import { Option, Select } from "metabase/common/components/Select";
import CS from "metabase/css/core/index.css";
import type { CodeSampleOption } from "metabase/public/lib/types";

type Props = {
  languageOptions: CodeSampleOption[];
  selectedOptionId: string;
  onChangeOption: (optionId: string) => void;
  dataTestId?: string;
};

export const EmbedServerSnippetLanguageSelect = ({
  languageOptions,
  selectedOptionId,
  onChangeOption,
  dataTestId,
}: Props) => {
  if (!languageOptions.length) {
    return null;
  }

  return (
    <Select
      className={CS.mlAuto}
      value={selectedOptionId}
      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
        onChangeOption(e.target.value)
      }
      buttonProps={{
        dataTestId,
      }}
    >
      {languageOptions.map((option) => (
        <Option key={option.id} value={option.id}>
          {option.name}
        </Option>
      ))}
    </Select>
  );
};
