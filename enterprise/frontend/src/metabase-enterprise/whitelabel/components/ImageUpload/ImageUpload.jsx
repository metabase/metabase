/* eslint-disable react/prop-types */
import cx from "classnames";

import { SettingInput } from "metabase/admin/settings/components/widgets/SettingInput";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { Button, Flex, Icon } from "metabase/ui";

import { FileInput } from "./ImageUpload.styled";

export const ImageUpload = ({ id, setting, onChange, ...props }) => {
  const imageSource = setting.value;
  return (
    <Flex align="center">
      {imageSource && (
        <div className={CS.mb1}>
          {/* Preview of icon as it will appear in the nav bar */}
          <span
            className={cx(
              CS.mb1,
              CS.p1,
              CS.rounded,
              CS.flex,
              CS.layoutCentered,
            )}
            style={{ backgroundColor: color("nav") }}
          >
            <img src={imageSource} height={32} />
          </span>
        </div>
      )}
      {window.File && window.FileReader ? (
        <FileInput
          id={id}
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
      {imageSource && (
        <Button
          p="xs"
          c="text-dark"
          variant="subtle"
          onClick={() => onChange(undefined)}
        >
          <Icon name="close" />
        </Button>
      )}
    </Flex>
  );
};
