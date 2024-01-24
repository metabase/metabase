import type { ChangeEvent } from "react";
import Select, { Option } from "metabase/core/components/Select";
import { CopyButton } from "metabase/components/CopyButton";
import AceEditor from "metabase/components/TextEditor";
import type { CodeSampleOption } from "metabase/public/lib/types";

import { CopyButtonContainer } from "./CodeSample.styled";

interface CodeSampleProps {
  selectedOptionName: CodeSampleOption["name"];
  source: string;
  languageOptions: CodeSampleOption["name"][];
  title?: string;
  textHighlightMode: string;
  highlightedTexts?: string[];

  dataTestId?: string;
  className?: string;

  onChangeOption: (optionName: string) => void;
}

export const CodeSample = ({
  selectedOptionName,
  source,
  title,
  languageOptions,
  dataTestId,
  textHighlightMode,
  highlightedTexts,
  className,
  onChangeOption,
}: CodeSampleProps): JSX.Element => {
  return (
    <div className={className} data-testid={dataTestId}>
      {(title || languageOptions.length > 1) && (
        <div className="flex align-center">
          {title && <h4>{title}</h4>}
          {languageOptions.length > 1 ? (
            <Select
              className="AdminSelect--borderless ml-auto"
              value={selectedOptionName}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                onChangeOption(e.target.value)
              }
              buttonProps={{
                dataTestId,
              }}
            >
              {languageOptions.map(option => (
                <Option key={option} value={option}>
                  {option}
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
            <CopyButton className="p1" value={source} />
          </CopyButtonContainer>
        )}
      </div>
    </div>
  );
};
