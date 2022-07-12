import cx from "classnames";
import Icon from "metabase/components/Icon";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import React from "react";

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
        <button
          className="flex align-center"
          onClick={() => setVisible(!visible)}
        >
          <h2>{label}</h2>
          <Icon name="chevrondown" size="12px" className="ml-1" />
        </button>
      </TippyPopover>
    </div>
  );
};

const Contents: React.FC<Props> = ({ value, setValue, options }: Props) => (
  <div className="px-0 py-0 bg-white border rounded-md shadow-md border-border">
    <div className="flex flex-column" aria-label="Tabs">
      {options.map(({ value: optionValue, label }) => (
        <button
          key={optionValue}
          className={cx(
            value === optionValue ? "text-brand" : "",
            "px-4 py-2 font-bold text-left text-medium text-sm bg-opacity-25 hover:bg-accent0-light hover:bg-opacity-25",
          )}
          aria-current={optionValue === value ? "page" : undefined}
          onClick={() => setValue(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  </div>
);

export default Selector;
