import type { ChangeEvent } from "react";

import { CopyButton } from "metabase/components/CopyButton";
import AceEditor from "metabase/components/TextEditor";
import Select, { Option } from "metabase/core/components/Select";
import type { CodeSampleOption } from "metabase/public/lib/types";

import { CopyButtonContainer } from "./CodeSample.styled";

interface CodeSampleProps {
  selectedOptionId: CodeSampleOption["id"];
  source: string;
  languageOptions: CodeSampleOption[];
  title?: string;
  textHighlightMode: string;
  highlightedTexts?: string[];

  dataTestId?: string;
  className?: string;

  onChangeOption: (optionName: string) => void;
  onCopy?: () => void;
}

export const CodeSample = ({
  selectedOptionId,
  source,
  title,
  languageOptions,
  dataTestId,
  textHighlightMode,
  highlightedTexts,
  className,
  onChangeOption,
  onCopy,
}: CodeSampleProps): JSX.Element => {
  return (
    <div className={className} data-testid={dataTestId}>
      {(title || languageOptions.length > 1) && (
        <div className="flex align-center">
          {title && <h4>{title}</h4>}
          {languageOptions.length > 1 ? (
            <Select
              className="ml-auto"
              value={selectedOptionId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                onChangeOption(e.target.value)
              }
              buttonProps={{
                dataTestId,
              }}
            >
              {languageOptions.map(option => (
                <Option key={option.id} value={option.id}>
                  {option.name}
                </Option>
              ))}
            </Select>
          ) : null}
        </div>
      )}
      <div className="bordered rounded shadowed relative mt2">
        <AceEditor
          className="z1"
          value={source}
          mode={textHighlightMode}
          theme="ace/theme/metabase"
          sizeToFit
          readOnly
          highlightedTexts={highlightedTexts}
        />
        {source && (
          <CopyButtonContainer>
            <CopyButton className="p1" value={source} onCopy={onCopy} />
          </CopyButtonContainer>
        )}
      </div>
    </div>
  );
};
