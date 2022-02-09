/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import ColorPicker from "metabase/components/ColorPicker";
import Icon from "metabase/components/Icon";
import { humanize } from "metabase/lib/formatting";

import { originalColors } from "../lib/whitelabel";

const THEMEABLE_COLORS = [
  "brand",
  "nav",
  ...Object.keys(originalColors).filter(name => name.startsWith("accent")),
];

const COLOR_DISPLAY_PROPERTIES = {
  brand: {
    name: t`Primary color`,
    description: t`The main color used throughout the app for buttons, links, and the default chart color.`,
  },
  nav: {
    name: t`Navigation bar color`,
    description: t`The top nav bar of Metabase. Defaults to the Primary Color if not set.`,
  },
  accent1: {
    name: t`Accent 1`,
    description: t`The color of aggregations and breakouts in the graphical query builder.`,
  },
  accent2: {
    name: t`Accent 2`,
    description: t`The color of filters in the query builder and buttons and links in filter widgets.`,
  },
  accent3: {
    name: t`Additional chart color`,
  },
  accent4: {
    name: t`Additional chart color`,
  },
  accent5: {
    name: t`Additional chart color`,
  },
  accent6: {
    name: t`Additional chart color`,
  },
  accent7: {
    name: t`Additional chart color`,
  },
};

const ColorSchemeWidget = ({ setting, onChange }) => {
  const value = setting.value || {};
  const colors = { ...originalColors, ...value };

  return (
    <div>
      <table>
        <tbody>
          {THEMEABLE_COLORS.map(name => {
            const properties = COLOR_DISPLAY_PROPERTIES[name] || {};
            return (
              <tr key={name}>
                <td>{properties.name || humanize(name)}:</td>
                <td>
                  <span className="mx1">
                    <ColorPicker
                      fancy
                      triggerSize={16}
                      value={colors[name]}
                      onChange={color => onChange({ ...value, [name]: color })}
                    />
                  </span>
                </td>
                <td>
                  {colors[name] !== originalColors[name] && (
                    <Icon
                      name="close"
                      className="text-grey-2 text-grey-4-hover cursor-pointer"
                      onClick={() => onChange({ ...value, [name]: undefined })}
                    />
                  )}
                </td>
                <td>
                  <span className="mx2 text-grey-4">
                    {properties.description}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ColorSchemeWidget;
