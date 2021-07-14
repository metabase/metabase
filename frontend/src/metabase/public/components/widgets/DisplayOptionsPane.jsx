import React from "react";

import EmbedSelect from "./EmbedSelect";
import CheckBox from "metabase/components/CheckBox";
import { t } from "ttag";
import type { DisplayOptions } from "./EmbedModalContent";

type Props = {
  className?: string,
  displayOptions: DisplayOptions,
  onChangeDisplayOptions: (displayOptions: DisplayOptions) => void,
};

const THEME_OPTIONS = [
  { name: t`Light`, value: null, icon: "sun" },
  { name: t`Dark`, value: "night", icon: "moon" },
];

const DisplayOptionsPane = ({
  className,
  displayOptions,
  onChangeDisplayOptions,
}: Props) => (
  <div className={className}>
    <div className="flex align-center my1">
      <CheckBox
        label={t`Border`}
        checked={displayOptions.bordered}
        onChange={e =>
          onChangeDisplayOptions({
            ...displayOptions,
            bordered: e.target.checked,
          })
        }
      />
    </div>
    <div className="flex align-center my1">
      <CheckBox
        label={t`Title`}
        checked={displayOptions.titled}
        onChange={e =>
          onChangeDisplayOptions({
            ...displayOptions,
            titled: e.target.checked,
          })
        }
      />
    </div>
    <EmbedSelect
      value={displayOptions.theme}
      options={THEME_OPTIONS}
      onChange={value =>
        onChangeDisplayOptions({ ...displayOptions, theme: value })
      }
    />
  </div>
);

export default DisplayOptionsPane;
