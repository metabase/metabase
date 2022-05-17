/* eslint-disable react/prop-types */
import React from "react";

import EmbedSelect from "./EmbedSelect";
import CheckBox from "metabase/core/components/CheckBox";
import Select from "metabase/core/components/Select";
import MetabaseSettings from "metabase/lib/settings";
import { t } from "ttag";

const THEME_OPTIONS = [
  { name: t`Light`, value: null, icon: "sun" },
  { name: t`Dark`, value: "night", icon: "moon" },
];

const DisplayOptionsPane = ({
  className,
  displayOptions,
  onChangeDisplayOptions,
}) => (
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
    <Select
      value={displayOptions.font}
      options={MetabaseSettings.get("available-fonts").map(font => ({
        name: font,
        value: font,
      }))}
      onChange={e => {
        onChangeDisplayOptions({
          ...displayOptions,
          font: e.target.value,
        });
      }}
    />
  </div>
);

export default DisplayOptionsPane;
