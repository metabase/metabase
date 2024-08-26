import cx from "classnames";
import type { ChangeEvent } from "react";

import { CopyButton } from "metabase/components/CopyButton";
import AceEditor from "metabase/components/TextEditor";
import Select, { Option } from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
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
        <div className={cx(CS.flex, CS.alignCenter)}>
          {title && <h4>{title}</h4>}
          {languageOptions.length > 1 ? (
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
              {languageOptions.map(option => (
                <Option key={option.id} value={option.id}>
                  {option.name}
                </Option>
              ))}
            </Select>
          ) : null}
        </div>
      )}
      <div
        className={cx(
          CS.bordered,
          CS.rounded,
          CS.shadowed,
          CS.relative,
          CS.mt2,
          CS.overflowHidden,
        )}
      >
        <AceEditor
          className={CS.z1}
          value={source}
          mode={textHighlightMode}
          theme="ace/theme/metabase"
          sizeToFit
          readOnly
          highlightedTexts={highlightedTexts}
        />
        {source && (
          <CopyButtonContainer>
            <CopyButton className={CS.p1} value={source} onCopy={onCopy} />
          </CopyButtonContainer>
        )}
      </div>
    </div>
  );
};
