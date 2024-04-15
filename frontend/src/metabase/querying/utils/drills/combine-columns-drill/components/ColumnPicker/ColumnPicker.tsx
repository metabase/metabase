import { useState } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import { Icon, Select } from "metabase/ui";

import type { ColumnOption } from "../../types";

import S from "./ColumnPicker.module.css";

interface Props {
  label?: string;
  options: ColumnOption[];
  value: string;
  onChange: (value: string) => void;
}

export const ColumnPicker = ({ label, options, value, onChange }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const sections = [];

  const DropdownComponent = () => {
    return (
      <div>
        asdasdasd
      </div>
    );
  };
  // const DropdownComponent = () => {
  //   return (
  //     <AccordionList
  //       className="text-brand"
  //       maxHeight={600}
  //       sections={[]}
  //       onChange={item => this.props.onChange(item.target)}
  //       itemIsSelected={item => _.isEqual(item.target, target)}
  //       renderItemIcon={item => (
  //         <Icon name={item.icon || "unknown"} size={18} />
  //       )}
  //       alwaysExpanded={true}
  //       hideSingleSectionTitle={!hasForeignOption}
  //     />
  //   );
  // };

  return (
    <>
      <Select
        className={S.column}
        classNames={{
          wrapper: S.wrapper,
        }}
        data={options}
        label={label}
        value={value}
        dropdownComponent={DropdownComponent}
      />
    </>
  );
};
