/* eslint-disable react/prop-types */
import Button from "metabase/core/components/Button";
import LogoIcon from "metabase/components/LogoIcon";
import SettingInput from "metabase/admin/settings/components/widgets/SettingInput";
import { color } from "metabase/lib/colors";

import { LogoFileInput } from "./LogoUpload.styled";

const LogoUpload = ({ setting, onChange, ...props }) => (
  <div>
    <div className="mb1">
      {/* Preview of icon as it will appear in the nav bar */}
      <span
        className="mb1 p1 rounded flex layout-centered"
        style={{ backgroundColor: color("nav") }}
      >
        <LogoIcon dark height={32} />
      </span>
    </div>
    {window.File && window.FileReader ? (
      <LogoFileInput
        onChange={e => {
          if (e.target.files.length > 0) {
            const reader = new FileReader();
            reader.onload = e => onChange(e.target.result);
            reader.readAsDataURL(e.target.files[0]);
          }
        }}
      />
    ) : (
      <SettingInput setting={setting} onChange={onChange} {...props} />
    )}
    <Button onlyIcon icon="close" onClick={() => onChange(undefined)} />
  </div>
);

export default LogoUpload;
