import { DashboardThemeSelector } from "./DashboardThemeSelector";
import { DashboardBoolToggle } from "./DashboardBoolToggle";
import { DashboardParameterSelector } from "./DashboardParameterSelector";

const TEST_EMBED_OPTIONS = [
  "titled",
  "bordered",
  "hide_download_button",
];

const BUTTON_CLASSES =
  "tw-font-bold tw-bg-gray-900 tw-text-white tw-text-center tw-rounded hover:tw-bg-gray-700 tw-px-2 tw-py-1 tw-gap-1";

export const DashboardOptionToggleSection = ({
  dashboardId,
  currentOptions,
  setOptions,
}) => (
  <div className="tw-bg-gray-800 tw-px-2 tw-py-4 tw-flex tw-flex-row tw-gap-1 tw-sticky tw-z-40 tw-shadow-lg tw-border-b tw-border-gray-500 ">
    <div className={`${BUTTON_CLASSES} tw-bg-transparent`}>
      <span>Options:</span>
    </div>
    <DashboardThemeSelector
      className={BUTTON_CLASSES}
      value={currentOptions.theme}
      onChange={value => setOptions({ theme: value })}
    />
    <DashboardParameterSelector
      className={BUTTON_CLASSES}
      dashboardId={dashboardId}
      value={currentOptions.hide_parameters}
      onChange={value => setOptions({ hide_parameters: value })}
    />

    {TEST_EMBED_OPTIONS.map(option => (
      <DashboardBoolToggle
        className={BUTTON_CLASSES}
        key={option}
        label={option.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
        value={currentOptions[option]}
        onChange={value => setOptions({ [option]: value })}
      />
    ))}
  </div>
);
