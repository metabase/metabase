import type { CodeSampleOption } from "metabase/embedding/types";
import { Select } from "metabase/ui";

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
      data-testid={dataTestId ? `${dataTestId}-select-button` : undefined}
      value={selectedOptionId}
      data={languageOptions.map((option) => ({
        value: option.id,
        label: option.name,
      }))}
      onChange={onChangeOption}
      ml="auto"
    />
  );
};
