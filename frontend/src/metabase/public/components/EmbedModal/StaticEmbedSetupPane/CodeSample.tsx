import { useState } from "react";
import _ from "underscore";
import CopyButton from "metabase/components/CopyButton/CopyButton";
import AceEditor from "metabase/components/TextEditor/TextEditor";
import Select, { Option } from "metabase/core/components/Select";
import { CopyButtonContainer } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/CodeSample.styled";

export const CodeSample = ({
  options,
  onChangeOption,
  className,
  title,
  dataTestId,
}: {
  options: {}[];
  onChangeOption: () => void;
  className?: string;
  title?: string;
  dataTestId?: string;
}) => {
  const [name, setName] = useState<string>(
    Array.isArray(options) && options.length > 0 ? options[0].name : null,
  );

  const selected = _.findWhere(options, { name });
  const source = selected && selected.source();

  const setOption = name => setName(name);

  const handleChange = function (name) {
    setOption(name);
    if (onChangeOption) {
      onChangeOption(_.findWhere(options, { name }));
    }
  };

  return (
    <div className={className}>
      {(title || (options && options.length > 1)) && (
        <div className="flex align-center">
          <h4>{title}</h4>
          {options && options.length > 1 ? (
            <Select
              className="AdminSelect--borderless ml-auto"
              value={name}
              onChange={e => handleChange(e.target.value)}
              buttonProps={{
                dataTestId,
              }}
            >
              {options.map(option => (
                <Option key={option.name} value={option.name}>
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
          mode={selected && selected.mode}
          theme="ace/theme/metabase"
          sizeToFit
          readOnly
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
