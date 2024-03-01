import { t } from "ttag";

import "./DashboardThemeSelector.css";

const THEME_OPTIONS = [
  { label: t`Light`, value: "light" },
  { label: t`Dark`, value: "night" },
  { label: t`Transparent`, value: "transparent" },
];

export const DashboardThemeSelector = ({ value, onChange, className }) => {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className}
    >
      {THEME_OPTIONS.map(({ label, value: themeValue }) => (
        <option value={themeValue}>{label}</option>
      ))}
    </select>
  );
};
