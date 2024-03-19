export const DashboardBoolToggle = ({ label, value, onChange, className }) => (
  <label
    className={`${className} tw-flex tw-flex-row tw-items-center tw-cursor-pointer tw-flex-nowrap tw-text-nowrap`}
  >
    {/* just having fun with these css classes */}
    <input
      className="tw-mr-1
        tw-bg-transparent
        tw-border-2
        tw-border-gray-400
        tw-bg-gray-100s
        tw-rounded
        tw-w-2
        tw-h-2
        tw-appearance-none
        checked:tw-bg-gray-600
        checked:tw-border-transparent
        checked:tw-ring-2
        checked:tw-ring-offset-2
        checked:tw-ring-offset-white
        checked:tw-ring-white
        checked:tw-ring-opacity-60
        checked:tw-ring-offset-opacity-40
        tw-transition
        tw-duration-300
        tw-ease-in-out
        "
      type="checkbox"
      checked={value}
      onChange={e => onChange(e.target.checked)}
    />
    <span>{label}</span>
  </label>
);
