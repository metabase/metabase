import cx from "classnames";
import Icon from "metabase/components/Icon";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import React from "react";

import {
  Button,
  Label,
  Content,
  Select,
  Option,
  ButtonContent,
} from "./Selector.styled";

type Props = {
  className?: string;
  value: string;
  setValue: (value: string) => void;
  options: {
    value: string;
    label: string;
  }[];
};

const Selector: React.FC<Props> = ({
  value,
  setValue,
  options,
  className,
}: Props) => {
  const [visible, setVisible] = React.useState(false);
  const label = React.useMemo(
    () => options.find(opt => opt.value === value)?.label || options[0].label,
    [options, value],
  );
  return (
    <div className={className}>
      <TippyPopover
        visible={visible}
        content={
          <Contents value={value} setValue={setValue} options={options} />
        }
        onClose={() => setVisible(false)}
        placement="bottom-start"
      >
        <Button borderless onClick={() => setVisible(!visible)}>
          <ButtonContent>
            <Label>{label}</Label>
            <Icon name="chevrondown" size="12px" className="ml-1" />
          </ButtonContent>
        </Button>
      </TippyPopover>
    </div>
  );
};

const Contents: React.FC<Props> = ({ value, setValue, options }: Props) => (
  <Content className="px-0 py-0 bg-white border rounded-md shadow-md border-border">
    <Select className="flex flex-column" aria-label="Tabs">
      {options.map(({ value: optionValue, label }) => (
        <Option
          key={optionValue}
          borderless
          className={cx(
            value === optionValue ? "text-brand" : "",
            "px-4 py-2 font-bold text-left text-medium text-sm bg-opacity-25 hover:bg-accent0-light hover:bg-opacity-25",
          )}
          active={optionValue === value}
          aria-current={optionValue === value ? "page" : undefined}
          onClick={() => setValue(optionValue)}
        >
          {label}
        </Option>
      ))}
    </Select>
  </Content>
);

export default Selector;
