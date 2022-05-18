/* eslint-disable react/prop-types */
import React from "react";

import Radio from "metabase/core/components/Radio/";
import CheckBox from "metabase/core/components/CheckBox";
import Select from "metabase/core/components/Select";
import MetabaseSettings from "metabase/lib/settings";
import { t } from "ttag";

import {
  StyleContainer,
  DisplayOption,
  DisplayOptionTitle,
} from "./DisplayOptionsPane.styled";

const THEME_OPTIONS = [
  { name: t`Light`, value: null },
  { name: t`Dark`, value: "night" },
];

const DisplayOptionsPane = ({
  className,
  displayOptions,
  onChangeDisplayOptions,
}) => (
  <div className={className}>
    <DisplayOptionSection title={t`Style`}>
      <StyleContainer>
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
      </StyleContainer>
    </DisplayOptionSection>
    <DisplayOptionSection title={t`Appearance`}>
      <Radio
        value={displayOptions.theme}
        options={THEME_OPTIONS}
        onChange={value =>
          onChangeDisplayOptions({ ...displayOptions, theme: value })
        }
        variant="normal"
        showButtons
        vertical
      />
    </DisplayOptionSection>
    <DisplayOptionSection title={t`Font`}>
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
    </DisplayOptionSection>
  </div>
);

const DisplayOptionSection = ({ title, children }) => (
  <DisplayOption>
    <DisplayOptionTitle>{title}</DisplayOptionTitle>
    {children}
  </DisplayOption>
);

export default DisplayOptionsPane;
