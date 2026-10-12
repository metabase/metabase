import type { SettingWidget } from "../../settings/types";

type ToolbarSettingProps = {
  setting: SettingWidget | undefined;
};

/** Renders a setting's widget bare, without the panel's label and spacing. */
export const ToolbarSetting = ({ setting }: ToolbarSettingProps) => {
  if (setting === undefined || setting.hidden) {
    return null;
  }
  const { widget: Widget, id, value, onChange, props } = setting;
  return <Widget id={id} value={value} onChange={onChange} {...props} />;
};
