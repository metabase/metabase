import cx from "classnames";
import type { CSSProperties, ChangeEvent, InputHTMLAttributes } from "react";

import FormS from "metabase/css/components/form.module.css";
import CS from "metabase/css/core/index.css";

import { CopyWidgetButton } from "./CopyWidget.styled";

interface CopyWidgetProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "style"> {
  value: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  style?: CSSProperties;
}

export const CopyWidget = ({
  value,
  onChange,
  style,
  ...props
}: CopyWidgetProps) => {
  return (
    <div className={cx(CS.flex, CS.relative)} style={style}>
      <input
        className={cx(FormS.FormInput, CS.flexFull, {
          [FormS.noFocus]: !onChange,
        })}
        style={{
          paddingRight: 40,
        }}
        onClick={
          !onChange
            ? (e) => {
                e.currentTarget.setSelectionRange(
                  0,
                  e.currentTarget.value.length,
                );
              }
            : undefined
        }
        value={value}
        onChange={onChange}
        readOnly={!!value && !onChange}
        {...props}
      />
      <CopyWidgetButton value={value} />
    </div>
  );
};
